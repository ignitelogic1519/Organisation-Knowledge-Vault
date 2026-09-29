import { createHash, randomBytes } from "node:crypto";
import type { OrgStorage, StorageObject, StoragePendingConnection } from "@prisma/client";
import {
  GATEWAY_CHUNK_BYTES,
  KVBLOB_SHA256_PLACEHOLDER,
  KVBLOB_STREAM_FRAME_BYTES,
  kvblobCipherBytes,
  kvblobHeaderBytes,
  type GdriveStorageConfigInput,
  type KvblobHeader,
  type StorageDegradedReason,
  type StorageTestResult,
  type StorageTestStep,
  type UploadCommitInput,
  type UploadTicket,
} from "@vault/shared";
import { db } from "../db.js";
import {
  Drive,
  DriveError,
  FOLDER_MIME,
  accessToken,
  dropAccessToken,
  putChunk,
  revokeToken,
  type DriveFile,
} from "./google.js";
import {
  newDek,
  newFileKey,
  openCredential,
  openValue,
  sealCredential,
  sealValue,
  unwrapDekFromPlatform,
  wrapDekForPlatform,
  wrapFileKey,
} from "./secrets.js";
import { signTicket } from "./tickets.js";
import { gatewayUrl } from "./gateway-url.js";
import { encryptToKvblob } from "./kvblob.js";

// Google Drive as organization-provided storage (docs/structure.md §9.16).
//
// Layout in their Drive, all created by us and therefore all within reach of the
// least-privilege drive.file grant:
//
//   Knowledge Vault — <organization>/      root: its id is what we store
//   ├── README.txt                         what this folder is; do not edit
//   ├── .kv-health                         the one file the health check rewrites
//   └── objects/
//       └── 2026-09/
//           ├── 3f2a…c1.kvblob             ENCRYPTED
//           └── Safety Induction.pdf       PLAIN keeps its readable name
//
// We address everything by Drive file ID and never by name or path, so a folder moved
// or renamed in the Drive UI breaks nothing.

const HEALTH_NAME = ".kv-health";
const README = `This folder holds the documents of a Knowledge Vault organization.

Knowledge Vault created it and keeps it in order. Please do not rename, move, edit or
delete anything inside it: people's documents are read from here, and a file changed
here is refused rather than shown.

Encrypted documents (.kvblob) can only be opened through Knowledge Vault, or with the
organization's .main file and Supreme password using the Knowledge Vault recovery tool.
`;

/** Pending connections live an hour; the grant is revoked if nobody uses it. */
export const PENDING_TTL_MS = 60 * 60 * 1000;

// ── Drive clients ────────────────────────────────────────────────────────────

export function driveForOrg(row: OrgStorage): Drive {
  const key = `org:${row.orgId}`;
  return new Drive(
    () =>
      accessToken(key, () => {
        if (!row.credentialEnc) {
          throw new DriveError("This organization has no Google account connected.", "auth", 0);
        }
        return openCredential(row.orgId, row.credentialEnc);
      }),
    () => dropAccessToken(key),
  );
}

export function pendingKey(p: StoragePendingConnection): string {
  return `pending:${p.id}`;
}

export function driveForPending(p: StoragePendingConnection): Drive {
  const key = pendingKey(p);
  return new Drive(
    () => accessToken(key, () => openValue(key, p.credentialEnc)),
    () => dropAccessToken(key),
  );
}

export function folderUrl(id: string | null | undefined): string | null {
  return id ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}` : null;
}

/** A pending connection that belongs to this profile and has not expired — or a clear refusal. */
export async function usablePending(connectionId: string, profileId: string): Promise<StoragePendingConnection> {
  const p = await db.storagePendingConnection.findUnique({ where: { id: connectionId } });
  if (!p || p.profileId !== profileId) {
    throw Object.assign(new Error("That Google connection was not found. Connect your Google account again."), {
      statusCode: 404,
    });
  }
  if (p.expiresAt < new Date()) {
    throw Object.assign(new Error("That Google connection has expired. Connect your Google account again."), {
      statusCode: 410,
    });
  }
  return p;
}

// ── The connection test (§9.4, as it applies to Drive) ──────────────────────

export interface DriveIds {
  rootId?: string | null;
  objectsId?: string | null;
  healthFileId?: string | null;
}

/** Drive's own words are for us; owners get the sentence that tells them what to do. */
function describeFailure(err: unknown): { message: string; hint?: string } {
  if (err instanceof DriveError) {
    if (err.failure === "auth") {
      return {
        message: err.message,
        hint: "Sign in with Google again from this screen. If it keeps failing, check that the Knowledge Vault app is allowed in your Google account's security settings.",
      };
    }
    if (err.failure === "quota") return { message: err.message };
    if (err.failure === "permission") {
      return {
        message: err.message,
        hint: "If this is a Google Workspace account, your administrator may be blocking third-party apps from Google Drive.",
      };
    }
    return { message: err.message };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

/**
 * Prove the connection works end to end, creating the Knowledge Vault folder on first
 * use. Every step is reported, so a failure names the exact stage that broke.
 */
/** Free space in the unit a person would say it in: "1.9 TB", "740.2 GB". */
function roomy(bytes: number): string {
  const gigs = bytes / 1024 ** 3;
  return gigs >= 1024 ? `${(gigs / 1024).toFixed(1)} TB` : `${gigs.toFixed(1)} GB`;
}

export async function testDrive(
  drive: Drive,
  ids: DriveIds,
  opts: { folderName: string },
): Promise<{
  result: StorageTestResult;
  ids: DriveIds;
  accountEmail: string | null;
  quota?: { limit: number | null; usage: number };
}> {
  const steps: StorageTestStep[] = [];
  const out: DriveIds = { ...ids };
  let accountEmail: string | null = null;
  const fail = (step: StorageTestStep["step"], label: string, err: unknown) => {
    const { message, hint } = describeFailure(err);
    steps.push({ step, label, ok: false, detail: message });
    return { result: { ok: false, steps, error: message, hint }, ids: out, accountEmail };
  };

  // 1 · Reach, and the account's quota
  let quota: { limit: number | null; usage: number };
  try {
    const about = await drive.about();
    accountEmail = about.email;
    quota = about;
    steps.push({ step: "reach", label: "Reach your Google Drive", ok: true, detail: about.email ?? undefined });
  } catch (err) {
    return fail("reach", "Reach your Google Drive", err);
  }

  // 2 · The Knowledge Vault folder — ours, not trashed, and still ours to write into
  try {
    if (out.rootId) {
      let root = await drive.getFile(out.rootId, "id,trashed,capabilities(canAddChildren)");
      if (root.trashed) {
        await drive.updateMetadata(out.rootId, { trashed: false });
        root = await drive.getFile(out.rootId, "id,trashed,capabilities(canAddChildren)");
      }
      if (root.capabilities && root.capabilities.canAddChildren === false) {
        throw new DriveError(
          "The connected account can no longer add files to the Knowledge Vault folder.",
          "permission",
          403,
        );
      }
    } else {
      const root = await drive.createMetadata({
        name: opts.folderName,
        mimeType: FOLDER_MIME,
        appProperties: { kvRoot: "1" },
        description: "Knowledge Vault documents. Managed by Knowledge Vault — please do not edit.",
      });
      out.rootId = root.id;
      await drive.createSmall(
        { name: "README.txt", parents: [root.id], appProperties: { kvReadme: "1" } },
        Buffer.from(README, "utf8"),
        "text/plain",
      );
    }
    if (!out.objectsId) {
      const objects = await drive.createMetadata({
        name: "objects",
        mimeType: FOLDER_MIME,
        parents: [out.rootId!],
        appProperties: { kvObjects: "1" },
      });
      out.objectsId = objects.id;
    }
    steps.push({ step: "folder", label: "Open the Knowledge Vault folder", ok: true });
  } catch (err) {
    return fail("folder", "Open the Knowledge Vault folder", err);
  }

  // 3 · Write — one small file, rewritten on every test rather than created and deleted,
  //     so repeated tests never leave a trail of probes in their Drive's trash.
  const payload = Buffer.from(`Knowledge Vault connection test ${new Date().toISOString()} ${randomBytes(6).toString("hex")}`);
  try {
    if (out.healthFileId) {
      await drive.updateSmall(out.healthFileId, payload, "text/plain");
    } else {
      const f = await drive.createSmall(
        { name: HEALTH_NAME, parents: [out.rootId!], appProperties: { kvHealth: "1" } },
        payload,
        "text/plain",
      );
      out.healthFileId = f.id;
    }
    steps.push({ step: "write", label: "Write a test file", ok: true });
  } catch (err) {
    return fail("write", "Write a test file", err);
  }

  // 4 · Read it back, and 5 · compare
  let readBack: Buffer;
  try {
    const res = await drive.download(out.healthFileId!);
    readBack = Buffer.from(await res.arrayBuffer());
    steps.push({ step: "read", label: "Read it back", ok: true });
  } catch (err) {
    return fail("read", "Read it back", err);
  }
  if (!readBack.equals(payload)) {
    return fail(
      "compare",
      "Check the bytes match",
      new Error("The file we read back did not match the file we wrote."),
    );
  }
  steps.push({ step: "compare", label: "Check the bytes match", ok: true });

  // 6 · Not shared with the world. A folder anyone can open makes every permission rule
  //     in the product decorative for readable documents.
  try {
    const perms = await drive.permissions(out.rootId!);
    const open = perms.find((p) => p.type === "anyone" || p.type === "domain");
    if (open) {
      steps.push({
        step: "public",
        label: "Confirm the folder is private",
        ok: false,
        detail: open.type === "anyone" ? "Anyone with the link can open it." : "Everyone in your domain can open it.",
      });
      return {
        result: {
          ok: false,
          steps,
          error:
            "The Knowledge Vault folder is shared more widely than its owner. Remove the link sharing on it in Google Drive, then test again.",
        },
        ids: out,
        accountEmail,
      };
    }
    steps.push({ step: "public", label: "Confirm the folder is private", ok: true });
  } catch (err) {
    return fail("public", "Confirm the folder is private", err);
  }

  // 7 · Room to write
  const free = quota.limit === null ? null : quota.limit - quota.usage;
  if (free !== null && free < 50 * 1024 * 1024) {
    steps.push({ step: "quota", label: "Check there is room", ok: false, detail: "Less than 50 MB free." });
    return {
      result: {
        ok: false,
        steps,
        error: "This Google Drive is almost full. Free some space or add storage to the account, then test again.",
      },
      ids: out,
      accountEmail,
    };
  }
  steps.push({
    step: "quota",
    label: "Check there is room",
    ok: true,
    detail: free === null ? "Unlimited" : `${roomy(free)} free`,
  });

  return { result: { ok: true, steps }, ids: out, accountEmail, quota };
}

/** Run the test for a pending connection and remember the folders it created. */
export async function testPending(
  p: StoragePendingConnection,
  folderName = "Knowledge Vault",
): Promise<StorageTestResult> {
  let ids: DriveIds = {
    rootId: p.gdriveRootId,
    objectsId: p.gdriveObjectsId,
    healthFileId: p.gdriveHealthFileId,
  };
  // Reconnecting an existing organization tests its existing folder, never a new one.
  if (p.purpose !== "create") {
    const row = await db.orgStorage.findUnique({ where: { orgId: p.purpose } });
    if (row?.adapter === "gdrive") {
      ids = { rootId: row.gdriveRootId, objectsId: row.gdriveObjectsId, healthFileId: row.gdriveHealthFileId };
    }
  }
  const { result, ids: out } = await testDrive(driveForPending(p), ids, { folderName });
  await db.storagePendingConnection.update({
    where: { id: p.id },
    data: {
      gdriveRootId: out.rootId ?? null,
      gdriveObjectsId: out.objectsId ?? null,
      gdriveHealthFileId: out.healthFileId ?? null,
      testedAt: result.ok ? new Date() : null,
    },
  });
  return result;
}

// ── Activation (§9.3) ────────────────────────────────────────────────────────

export async function connectGdrive(
  orgId: string,
  input: GdriveStorageConfigInput,
  profileId: string,
): Promise<{ ok: false; result: StorageTestResult } | { ok: true; row: OrgStorage }> {
  const pending = await usablePending(input.connectionId, profileId);
  if (pending.purpose !== "create" && pending.purpose !== orgId) {
    throw Object.assign(new Error("That Google connection was made for a different organization."), {
      statusCode: 400,
    });
  }
  if (!input.acknowledgedPersonalOwnership) {
    throw Object.assign(
      new Error(
        "Confirm that you understand the files will belong to this Google account before connecting it.",
      ),
      { statusCode: 400 },
    );
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const existing = await db.orgStorage.findUnique({ where: { orgId } });
  if (existing && existing.adapter !== "gdrive" && existing.status !== "UNCONFIGURED") {
    throw Object.assign(
      new Error(
        "This organization already stores its documents on a NAS. Moving them to Google Drive needs a migration that is not available yet.",
      ),
      { statusCode: 409 },
    );
  }
  // drive.file access belongs to one Google account: another account cannot see the
  // files this one created, so a reconnection must be the same account.
  if (existing?.adapter === "gdrive" && existing.gdriveAccountEmail &&
      existing.gdriveAccountEmail.toLowerCase() !== pending.accountEmail.toLowerCase()) {
    throw Object.assign(
      new Error(
        `This organization's documents are in ${existing.gdriveAccountEmail}'s Google Drive. Reconnect with that same account — another account cannot see those files.`,
      ),
      { statusCode: 409 },
    );
  }

  const folderName = `Knowledge Vault — ${org.name}`.slice(0, 120);
  const ids: DriveIds =
    existing?.adapter === "gdrive"
      ? { rootId: existing.gdriveRootId, objectsId: existing.gdriveObjectsId, healthFileId: existing.gdriveHealthFileId }
      : { rootId: pending.gdriveRootId, objectsId: pending.gdriveObjectsId, healthFileId: pending.gdriveHealthFileId };
  const drive = driveForPending(pending);
  const tested = await testDrive(drive, ids, { folderName });
  if (!tested.result.ok) return { ok: false, result: tested.result };

  // Name and label the folder for this organization, now that it exists.
  await drive.updateMetadata(tested.ids.rootId!, {
    name: folderName,
    appProperties: { kvRoot: "1", kvOrg: String(org.orgNumber) },
  });

  const refresh = openValue(pendingKey(pending), pending.credentialEnc);
  const wrappedDek =
    existing?.wrappedDek ?? (input.encryption === "ENCRYPTED" ? wrapDekForPlatform(orgId, newDek()) : null);
  const oldCredential = existing?.credentialEnc ? openCredential(orgId, existing.credentialEnc) : null;

  const data = {
    adapter: "gdrive",
    endpoint: null,
    bucket: null,
    accessKeyIdEnc: null,
    secretKeyEnc: null,
    credentialEnc: sealCredential(orgId, refresh),
    gdriveAccountEmail: pending.accountEmail,
    gdriveHostedDomain: pending.hostedDomain,
    gdriveTarget: "MY_DRIVE",
    gdriveRootId: tested.ids.rootId!,
    gdriveObjectsId: tested.ids.objectsId!,
    gdriveHealthFileId: tested.ids.healthFileId!,
    remoteTargetKey: `gdrive:${tested.ids.rootId}`,
    wrappedDek,
    status: "ACTIVE" as const,
    // Fixed at activation: changing it re-encrypts every stored object (§9.5).
    encryption: existing && existing.status !== "UNCONFIGURED" ? existing.encryption : input.encryption,
    lastCheckAt: new Date(),
    lastError: null,
    degradedReason: null,
    degradedAt: null,
    failingSince: null,
    // The test just read these, so the panel can show Drive space from the first view.
    ...(tested.quota
      ? {
          quotaLimitBytes: tested.quota.limit === null ? null : BigInt(tested.quota.limit),
          quotaUsedBytes: BigInt(tested.quota.usage),
          quotaCheckedAt: new Date(),
        }
      : {}),
  };

  let row: OrgStorage;
  try {
    row = await db.orgStorage.upsert({
      where: { orgId },
      create: { orgId, ...data },
      // A reconnection invalidates every streaming ticket issued under the old grant.
      update: { ...data, ticketEpoch: { increment: 1 } },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw Object.assign(new Error("This Google Drive folder is already connected to another organization."), {
        statusCode: 409,
      });
    }
    throw err;
  }

  await db.storagePendingConnection.delete({ where: { id: pending.id } }).catch(() => {});
  dropAccessToken(pendingKey(pending));
  dropAccessToken(`org:${orgId}`);
  // The grant this one replaces is told to Google to forget — we keep exactly one.
  if (oldCredential && oldCredential !== refresh) await revokeToken(oldCredential).catch(() => {});
  return { ok: true, row };
}

// ── Month folders ────────────────────────────────────────────────────────────

const folderLocks = new Map<string, Promise<string>>();

/** The folder this month's objects go into, created once and remembered. */
async function monthFolder(row: OrgStorage, drive: Drive): Promise<string> {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const known = (row.gdriveFolders as Record<string, string> | null) ?? {};
  if (known[month]) return known[month]!;
  const lockKey = `${row.orgId}:${month}`;
  const running = folderLocks.get(lockKey);
  if (running) return running;
  const job = (async () => {
    const fresh = await db.orgStorage.findUniqueOrThrow({ where: { id: row.id } });
    const folders = (fresh.gdriveFolders as Record<string, string> | null) ?? {};
    if (folders[month]) return folders[month]!;
    const created = await drive.createMetadata({
      name: month,
      mimeType: FOLDER_MIME,
      parents: [row.gdriveObjectsId!],
      appProperties: { kvMonth: month },
    });
    await db.orgStorage.update({
      where: { id: row.id },
      data: { gdriveFolders: { ...folders, [month]: created.id } },
    });
    return created.id;
  })();
  folderLocks.set(lockKey, job);
  try {
    return await job;
  } finally {
    folderLocks.delete(lockKey);
  }
}

// ── Quota ────────────────────────────────────────────────────────────────────

const QUOTA_FRESH_MS = 5 * 60 * 1000;

/** Their Drive's limit and usage, refreshed at most every five minutes. */
export async function driveQuota(row: OrgStorage): Promise<{ limit: number | null; usage: number }> {
  if (row.quotaCheckedAt && Date.now() - row.quotaCheckedAt.getTime() < QUOTA_FRESH_MS) {
    return {
      limit: row.quotaLimitBytes === null ? null : Number(row.quotaLimitBytes),
      usage: Number(row.quotaUsedBytes ?? 0),
    };
  }
  const about = await driveForOrg(row).about();
  await db.orgStorage.update({
    where: { id: row.id },
    data: {
      quotaLimitBytes: about.limit === null ? null : BigInt(about.limit),
      quotaUsedBytes: BigInt(about.usage),
      quotaCheckedAt: new Date(),
    },
  });
  return { limit: about.limit, usage: about.usage };
}

// ── Upload ───────────────────────────────────────────────────────────────────

const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** A readable, safe Drive name for a PLAIN document (question 10: readable names). */
function readableName(filename: string): string {
  const clean = wellFormed(filename)
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || "document").slice(0, 200);
}

/**
 * Replace lone UTF-16 surrogates with U+FFFD, as TextEncoder would. The header's byte
 * length is computed on the server and must match what the browser writes exactly.
 */
function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

function objectTag(objectKey: string): string {
  return createHash("sha256").update(objectKey).digest("hex").slice(0, 32);
}

async function orgNumberOf(orgId: string): Promise<number> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { orgNumber: true } });
  return org.orgNumber;
}

/**
 * Open a resumable upload for one object and hand the browser what it needs to send the
 * bytes through the gateway. Nothing about the Google session leaves the server.
 */
export async function beginGdriveUpload(
  row: OrgStorage,
  input: { filename: string; mime: string; bytes: number },
  profileId: string,
  dek: Buffer | null,
  mintObjectKey: (encrypted: boolean) => string,
): Promise<UploadTicket> {
  const encrypted = row.encryption === "ENCRYPTED";
  const filename = wellFormed(input.filename);
  const objectKey = mintObjectKey(encrypted);

  let fileKey: Buffer | null = null;
  let nonceBase: string | null = null;
  let wrappedKey: string | null = null;
  let headerTemplate: string | null = null;
  let headerBytes: number | null = null;
  let cipherBytes = input.bytes;
  const frameBytes = KVBLOB_STREAM_FRAME_BYTES;
  if (encrypted) {
    if (!dek) throw Object.assign(new Error("This organization's storage has no encryption key"), { statusCode: 500 });
    fileKey = newFileKey();
    nonceBase = randomBytes(8).toString("base64");
    wrappedKey = wrapFileKey(dek, fileKey, objectKey);
    const header: KvblobHeader = {
      v: 1,
      alg: "AES-256-GCM",
      frame: frameBytes,
      nonceBase,
      size: input.bytes,
      sha256: KVBLOB_SHA256_PLACEHOLDER,
      mime: input.mime,
      filename,
      wk: wrappedKey,
      ok: objectKey,
      dv: 1,
    };
    headerTemplate = JSON.stringify(header);
    headerBytes = kvblobHeaderBytes(headerTemplate);
    cipherBytes = kvblobCipherBytes(input.bytes, headerBytes, frameBytes);
  }

  // Refuse before a byte is sent, not after the upload fills their Drive.
  const quota = await driveQuota(row).catch(() => null);
  if (quota && quota.limit !== null && quota.usage + cipherBytes > quota.limit) {
    throw Object.assign(
      new Error("Your Google Drive does not have room for this file. Free some space or add storage to the account."),
      { statusCode: 413 },
    );
  }

  const drive = driveForOrg(row);
  const parent = await monthFolder(row, drive);
  const [id] = await drive.generateIds(1);
  const orgNumber = await orgNumberOf(row.orgId);
  const sessionUri = await drive.startResumable(
    {
      id,
      name: encrypted ? objectKey.split("/").pop()! : readableName(filename),
      parents: [parent],
      mimeType: encrypted ? "application/octet-stream" : input.mime,
      appProperties: { kvOrg: String(orgNumber), kvObj: objectTag(objectKey) },
      // Readable files: Drive viewers cannot download, print or copy them from Drive's UI.
      ...(encrypted ? {} : { copyRequiresWriterPermission: true }),
    },
    cipherBytes,
    encrypted ? "application/octet-stream" : input.mime,
  );

  const object = await db.storageObject.create({
    data: {
      orgId: row.orgId,
      objectKey,
      sha256: "",
      bytes: input.bytes,
      mime: input.mime,
      filename,
      encrypted,
      wrappedKey,
      remoteId: id,
      cipherBytes,
      frameBytes: encrypted ? frameBytes : null,
      headerBytes,
      nonceBase,
    },
  });
  const session = await db.storageUploadSession.create({
    data: {
      orgId: row.orgId,
      storageObjectId: object.id,
      sessionUriEnc: "",
      totalBytes: cipherBytes,
      expiresAt: new Date(Date.now() + UPLOAD_SESSION_TTL_MS),
    },
  });
  await db.storageUploadSession.update({
    where: { id: session.id },
    data: { sessionUriEnc: sealValue(`upload:${session.id}`, sessionUri) },
  });

  const ticket = signTicket({
    o: row.orgId,
    s: session.id,
    m: "u",
    e: Math.floor(session.expiresAt.getTime() / 1000),
    g: row.ticketEpoch,
    p: profileId,
  });
  return {
    objectKey,
    transport: "gateway",
    uploadUrl: gatewayUrl(`/stream/u/${session.id}`),
    headers: {},
    encrypted,
    ...(fileKey ? { fileKey: fileKey.toString("base64") } : {}),
    ...(nonceBase ? { nonceBase } : {}),
    frameBytes,
    expiresInSeconds: Math.floor(UPLOAD_SESSION_TTL_MS / 1000),
    ...(wrappedKey ? { wrappedKey, dekVersion: 1 } : {}),
    ...(headerTemplate ? { headerTemplate } : {}),
    cipherBytes,
    ticket,
    chunkBytes: GATEWAY_CHUNK_BYTES,
  };
}

export function sessionUriOf(session: { id: string; sessionUriEnc: string }): string {
  return openValue(`upload:${session.id}`, session.sessionUriEnc);
}

/**
 * The browser says its upload finished. Confirm with Google — size, checksum, owner —
 * then pin the revision we wrote so nobody can swap the file under a reader.
 */
export async function commitGdriveUpload(
  row: OrgStorage,
  pending: StorageObject,
  body: UploadCommitInput,
): Promise<StorageObject> {
  const session = await db.storageUploadSession.findUnique({ where: { storageObjectId: pending.id } });
  if (!session || !session.completedAt) {
    throw Object.assign(new Error("That upload has not finished yet — wait for it to complete."), {
      statusCode: 409,
    });
  }
  if (body.bytes !== pending.bytes) {
    throw Object.assign(new Error("The uploaded file is not the size that was announced."), { statusCode: 422 });
  }
  const drive = driveForOrg(row);
  const file: DriveFile = await drive.getFile(
    pending.remoteId!,
    "id,size,sha256Checksum,md5Checksum,headRevisionId,trashed,appProperties",
  );
  const orgNumber = await orgNumberOf(row.orgId);
  const refuse = async (message: string) => {
    await db.$transaction([
      db.storageDeletion.create({
        data: { orgId: row.orgId, objectKey: pending.objectKey, remoteId: pending.remoteId },
      }),
      db.storageUploadSession.deleteMany({ where: { storageObjectId: pending.id } }),
      db.storageObject.delete({ where: { id: pending.id } }),
    ]);
    throw Object.assign(new Error(message), { statusCode: 422 });
  };
  if (Number(file.size ?? -1) !== pending.cipherBytes) {
    return refuse("The file in your Google Drive is not the size that was sent. Upload it again.");
  }
  if (file.appProperties?.kvOrg !== String(orgNumber)) {
    return refuse("That file does not belong to this organization's storage.");
  }
  if (file.sha256Checksum && body.cipherSha256 && file.sha256Checksum.toLowerCase() !== body.cipherSha256) {
    return refuse("The file changed on its way to Google Drive. Upload it again.");
  }
  if (file.headRevisionId) {
    await drive.keepRevisionForever(file.id, file.headRevisionId);
  }
  const [updated] = await db.$transaction([
    db.storageObject.update({
      where: { id: pending.id },
      data: {
        sha256: body.sha256,
        mime: body.mime,
        filename: wellFormed(body.filename),
        remoteRevision: file.headRevisionId ?? null,
        cipherSha256: body.cipherSha256 ?? file.sha256Checksum ?? null,
      },
    }),
    db.storageUploadSession.delete({ where: { id: session.id } }),
  ]);
  return updated;
}

/**
 * Write a whole object from the server — used to migrate files still held in our
 * database. Encrypted exactly as a browser would, with 256 KiB frames.
 */
export async function putGdriveObject(
  row: OrgStorage,
  plaintext: Buffer,
  meta: { filename: string; mime: string; sha256: string },
  mintObjectKey: (encrypted: boolean) => string,
): Promise<{ objectKey: string; remoteId: string; revision: string | null; stored: Partial<StorageObject> }> {
  const encrypted = row.encryption === "ENCRYPTED";
  const objectKey = mintObjectKey(encrypted);
  let body = plaintext;
  const stored: Partial<StorageObject> = { cipherBytes: plaintext.length };
  if (encrypted) {
    const dek = unwrapDekFromPlatform(row.orgId, row.wrappedDek!);
    const fileKey = newFileKey();
    const wrappedKey = wrapFileKey(dek, fileKey, objectKey);
    const sealed = encryptToKvblob(plaintext, fileKey, {
      mime: meta.mime,
      filename: meta.filename,
      sha256: meta.sha256,
      frameBytes: KVBLOB_STREAM_FRAME_BYTES,
      wrappedKey,
      objectKey,
    });
    body = sealed.blob;
    Object.assign(stored, {
      wrappedKey,
      cipherBytes: body.length,
      frameBytes: KVBLOB_STREAM_FRAME_BYTES,
      headerBytes: sealed.headerBytes,
      nonceBase: sealed.header.nonceBase,
    });
  }
  const drive = driveForOrg(row);
  const parent = await monthFolder(row, drive);
  const [id] = await drive.generateIds(1);
  const orgNumber = await orgNumberOf(row.orgId);
  const uri = await drive.startResumable(
    {
      id,
      name: encrypted ? objectKey.split("/").pop()! : readableName(meta.filename),
      parents: [parent],
      mimeType: encrypted ? "application/octet-stream" : meta.mime,
      appProperties: { kvOrg: String(orgNumber), kvObj: objectTag(objectKey) },
      ...(encrypted ? {} : { copyRequiresWriterPermission: true }),
    },
    body.length,
    encrypted ? "application/octet-stream" : meta.mime,
  );
  const result = await putChunk(uri, body, 0, body.length, body.length);
  if (!result.file) throw new DriveError("Google did not confirm the upload.", "transient", 0);
  const file = await drive.getFile(id!, "id,size,headRevisionId,sha256Checksum");
  if (Number(file.size) !== body.length) {
    await drive.deleteFile(id!).catch(() => {});
    throw new Error("The uploaded object did not read back at the expected size");
  }
  if (file.headRevisionId) await drive.keepRevisionForever(id!, file.headRevisionId);
  stored.cipherSha256 = createHash("sha256").update(body).digest("hex");
  return { objectKey, remoteId: id!, revision: file.headRevisionId ?? null, stored };
}

// ── Health (§9.8) ────────────────────────────────────────────────────────────

export type ProbeOutcome =
  | { ok: true }
  | { ok: false; error: string; reason: StorageDegradedReason; definitive: boolean };

export function outcomeFor(err: unknown): ProbeOutcome {
  if (err instanceof DriveError) {
    const reason: StorageDegradedReason =
      err.failure === "auth"
        ? "AUTH_REVOKED"
        : err.failure === "quota"
          ? "QUOTA_FULL"
          : err.failure === "permission"
            ? "PERMISSION"
            : err.failure === "not-found"
              ? "ROOT_MISSING"
              : "UNREACHABLE";
    return {
      ok: false,
      error: err.message,
      reason,
      definitive: err.definitive || err.failure === "not-found",
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  const statusCode = (err as { statusCode?: number } | null)?.statusCode;
  // The platform key cannot open this organization's grant: nothing but an operator fixes it.
  if (statusCode === 503) return { ok: false, error: message, reason: "KEY", definitive: true };
  return { ok: false, error: message, reason: "UNREACHABLE", definitive: false };
}

/** Re-test one Drive organization without leaving anything behind in their Drive. */
export async function probeGdrive(row: OrgStorage): Promise<ProbeOutcome> {
  try {
    const drive = driveForOrg(row);
    const about = await drive.about();
    await db.orgStorage.update({
      where: { id: row.id },
      data: {
        quotaLimitBytes: about.limit === null ? null : BigInt(about.limit),
        quotaUsedBytes: BigInt(about.usage),
        quotaCheckedAt: new Date(),
      },
    });
    let root = await drive.getFile(row.gdriveRootId!, "id,trashed,capabilities(canAddChildren)");
    if (root.trashed) {
      // Somebody moved our folder to the trash. Put it back — nothing was meant to be lost.
      await drive.updateMetadata(row.gdriveRootId!, { trashed: false });
      root = await drive.getFile(row.gdriveRootId!, "id,trashed,capabilities(canAddChildren)");
      await notifyOwners(row.orgId, "storage_restored_folder", {
        subject: "We restored your Knowledge Vault folder from Google Drive's trash",
        body:
          "The Knowledge Vault folder in your organization's Google Drive had been moved to the trash. " +
          "Knowledge Vault has put it back, so nothing is lost. Google Drive's activity panel shows who moved it.",
      });
    }
    if (root.capabilities?.canAddChildren === false) {
      return {
        ok: false,
        error: "The connected Google account can no longer add files to the Knowledge Vault folder.",
        reason: "PERMISSION",
        definitive: true,
      };
    }
    const payload = Buffer.from(`health ${new Date().toISOString()}`);
    await drive.updateSmall(row.gdriveHealthFileId!, payload, "text/plain");
    const back = Buffer.from(await (await drive.download(row.gdriveHealthFileId!)).arrayBuffer());
    if (!back.equals(payload)) {
      return { ok: false, error: "The health file read back differently from how it was written.", reason: "UNREACHABLE", definitive: false };
    }
    if (about.limit !== null && about.usage >= about.limit) {
      return { ok: false, error: "The connected Google Drive is full, so uploads are paused.", reason: "QUOTA_FULL", definitive: true };
    }
    return { ok: true };
  } catch (err) {
    return outcomeFor(err);
  }
}

async function notifyOwners(orgId: string, kind: string, msg: { subject: string; body: string }) {
  const { notify } = await import("../courses/helpers.js");
  const owners = await db.placement.findMany({
    where: { kind: "OWNER", membership: { orgId } },
    select: { membership: { select: { profileId: true } } },
  });
  for (const profileId of new Set(owners.map((o) => o.membership.profileId))) {
    await notify(profileId, orgId, kind, {}, { ...msg, priority: "HIGH" }).catch(() => {});
  }
}

// ── Deletion (§9.10) ─────────────────────────────────────────────────────────

export async function deleteGdriveObject(row: OrgStorage, remoteId: string): Promise<void> {
  // The account owns what our app created in its My Drive, so this is a permanent
  // delete — not a trip to the trash.
  await driveForOrg(row).deleteFile(remoteId);
}

// ── Reconciliation, nightly ──────────────────────────────────────────────────

/**
 * Compare what is in their Drive with what we believe is there. Nothing is changed that
 * we did not put there: trashed documents are restored, replaced ones are reported and
 * keep serving the revision we pinned, and files with no record are queued for deletion.
 */
export async function reconcileGdrive(row: OrgStorage): Promise<{ restored: number; replaced: number; orphans: number; missing: number }> {
  const report = { restored: 0, replaced: 0, orphans: 0, missing: 0 };
  const drive = driveForOrg(row);
  const orgNumber = await orgNumberOf(row.orgId);
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await drive.listByProperty("kvOrg", String(orgNumber), pageToken);
    pageToken = page.nextPageToken;
    for (const f of page.files) {
      if (!f.appProperties?.kvObj) continue; // the root folder, README, health file
      seen.add(f.id);
      const obj = await db.storageObject.findFirst({ where: { orgId: row.orgId, remoteId: f.id } });
      if (!obj) {
        // The record is created before an upload starts and only removed once the
        // object is abandoned or deleted, so a file with no record is one nothing refers
        // to. Deleting a file that is already gone is harmless.
        await db.storageDeletion.create({ data: { orgId: row.orgId, objectKey: `orphan:${f.id}`, remoteId: f.id } });
        report.orphans += 1;
        continue;
      }
      if (f.trashed && obj.courseId) {
        await drive.updateMetadata(f.id, { trashed: false });
        report.restored += 1;
      }
      if (obj.remoteRevision && f.headRevisionId && f.headRevisionId !== obj.remoteRevision) {
        report.replaced += 1;
      }
    }
  } while (pageToken);

  const expected = await db.storageObject.findMany({
    where: { orgId: row.orgId, remoteId: { not: null }, courseId: { not: null } },
    select: { remoteId: true },
  });
  report.missing = expected.filter((o) => !seen.has(o.remoteId!)).length;

  if (report.restored || report.replaced || report.missing) {
    const lines = [
      report.restored ? `${report.restored} document(s) had been moved to Google Drive's trash and were restored.` : "",
      report.replaced
        ? `${report.replaced} document(s) had a new version uploaded over them in Google Drive. Readers still get the original, which Knowledge Vault kept.`
        : "",
      report.missing
        ? `${report.missing} document(s) are missing from the Google Drive entirely. They will show as unavailable until restored — a Google Workspace administrator can restore recently deleted files from the Admin console.`
        : "",
    ].filter(Boolean);
    await notifyOwners(row.orgId, "storage_reconcile", {
      subject: "Changes were made to your Knowledge Vault folder in Google Drive",
      body: lines.join("\n\n"),
    });
  }
  return report;
}

// ── Pending connections nobody used ──────────────────────────────────────────

/** Remove the test folder and revoke the grant of every pending connection past its hour. */
export async function sweepPendingConnections(): Promise<number> {
  const stale = await db.storagePendingConnection.findMany({ where: { expiresAt: { lt: new Date() } }, take: 50 });
  for (const p of stale) {
    try {
      // A test folder is only ours to remove when this sign-in created it.
      if (p.purpose === "create" && p.gdriveRootId) {
        await driveForPending(p).deleteFile(p.gdriveRootId).catch(() => {});
      }
      await revokeToken(openValue(pendingKey(p), p.credentialEnc)).catch(() => {});
    } finally {
      dropAccessToken(pendingKey(p));
      await db.storagePendingConnection.delete({ where: { id: p.id } }).catch(() => {});
    }
  }
  return stale.length;
}

/** Stop holding access to a Drive we no longer serve (organization purged). */
export async function forgetGdrive(row: OrgStorage): Promise<void> {
  if (!row.credentialEnc) return;
  await revokeToken(openCredential(row.orgId, row.credentialEnc)).catch(() => {});
  dropAccessToken(`org:${row.orgId}`);
}
