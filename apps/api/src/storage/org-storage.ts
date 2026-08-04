import { randomBytes } from "node:crypto";
import type { OrgStorage } from "@prisma/client";
import type { StorageConfigInput, StorageTestResult, StorageTestStep } from "@vault/shared";
import { db } from "../db.js";
import {
  S3Error,
  deleteObject,
  getObject,
  isPubliclyReadable,
  listObjects,
  putObject,
  type S3Config,
} from "./s3.js";
import {
  newDek,
  openCredential,
  sealCredential,
  unwrapDekFromPlatform,
  wrapDekForPlatform,
} from "./secrets.js";

// The organization's storage backend: loading it, testing it, and keeping its health
// state honest (docs/structure.md §9.3, §9.4, §9.8).

/** Turn a stored row into the credentials the S3 client needs. */
export function s3ConfigFor(row: OrgStorage): S3Config {
  return {
    endpoint: row.endpoint,
    bucket: row.bucket,
    region: row.region,
    accessKeyId: openCredential(row.orgId, row.accessKeyIdEnc),
    secretAccessKey: openCredential(row.orgId, row.secretKeyEnc),
    forcePathStyle: row.forcePathStyle,
  };
}

/** The full object key, including the organization's configured prefix. */
export function fullKey(row: OrgStorage, objectKey: string): string {
  const prefix = row.prefix.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${objectKey}` : objectKey;
}

/** A fresh, content-free object key: date-sharded so no directory grows unbounded. */
export function mintObjectKey(encrypted: boolean): string {
  const now = new Date();
  const shard = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  // Random, not derived from the filename: a key like
  // "Redundancy-Consultation-Legal-Advice.pdf" leaks confidential information to
  // anyone who can list the folder (§9.6).
  return `objects/${shard}/${randomBytes(16).toString("hex")}.${encrypted ? "kvblob" : "bin"}`;
}

export async function storageFor(orgId: string): Promise<OrgStorage | null> {
  return db.orgStorage.findUnique({ where: { orgId } });
}

/**
 * The organization's storage, or a clear refusal. Used by every path that must write.
 * A DEGRADED backend refuses writes but never pretends the content is gone.
 */
export async function requireWritableStorage(orgId: string): Promise<OrgStorage> {
  const row = await storageFor(orgId);
  if (!row || row.status === "UNCONFIGURED") {
    throw Object.assign(
      new Error("This organization has no storage connected yet — connect it in storage settings."),
      { statusCode: 409 },
    );
  }
  if (row.status === "DEGRADED") {
    throw Object.assign(
      new Error(
        `Your storage is not reachable right now, so new uploads are paused. ${
          row.lastError ?? ""
        } Existing documents are safe and will open again as soon as the connection is restored.`.trim(),
      ),
      { statusCode: 503 },
    );
  }
  return row;
}

/** The org's data key, unwrapped. Only called on paths that already passed `can()`. */
export function dekFor(row: OrgStorage): Buffer {
  if (!row.wrappedDek) {
    throw Object.assign(new Error("This organization's storage has no encryption key"), {
      statusCode: 500,
    });
  }
  return unwrapDekFromPlatform(row.orgId, row.wrappedDek);
}

// ── The connection test (§9.4) ───────────────────────────────────────────────

/**
 * Write a probe, read it back, compare it, delete it — and check the bucket is not
 * public. Every step is reported, so a failure names the exact stage that broke rather
 * than "could not connect".
 *
 * This runs before a backend is ever activated. A backend that "seems configured" but
 * fails on the first real upload is the outcome this exists to prevent.
 */
export async function testConnection(cfg: S3Config, prefix: string): Promise<StorageTestResult> {
  const steps: StorageTestStep[] = [];
  const probeKey = `${prefix.replace(/^\/+|\/+$/g, "")}${prefix ? "/" : ""}.knowledge-vault-probe-${randomBytes(8).toString("hex")}`;
  const payload = Buffer.from(`Knowledge Vault connection test ${new Date().toISOString()}`, "utf8");

  const fail = (
    step: StorageTestStep["step"],
    label: string,
    err: unknown,
    hint?: string,
  ): StorageTestResult => {
    const message =
      err instanceof S3Error ? err.message : err instanceof Error ? err.message : String(err);
    steps.push({ step, label, ok: false, detail: message });
    return { ok: false, steps, error: message, hint };
  };

  // 1 · Write
  try {
    await putObject(cfg, probeKey, payload, "text/plain");
    steps.push({ step: "write", label: "Write a test file", ok: true });
  } catch (err) {
    const hint =
      err instanceof S3Error && err.code === "Unreachable"
        ? "If this NAS is on your office network only, our servers cannot reach it. Put it behind " +
          "a Cloudflare Tunnel (no ports opened) or give it a public HTTPS address, then try again."
        : err instanceof S3Error && err.code === "AccessDenied"
          ? "The access key needs GetObject, PutObject, DeleteObject and ListBucket on this bucket and prefix."
          : undefined;
    return fail("write", "Write a test file", err, hint);
  }

  // 2 · Read back
  let readBack: Buffer;
  try {
    readBack = await getObject(cfg, probeKey);
    steps.push({ step: "read", label: "Read it back", ok: true });
  } catch (err) {
    await deleteObject(cfg, probeKey).catch(() => {});
    return fail("read", "Read it back", err);
  }

  // 3 · Compare
  if (!readBack.equals(payload)) {
    await deleteObject(cfg, probeKey).catch(() => {});
    return fail(
      "compare",
      "Check the bytes match",
      new Error("The file we read back did not match the file we wrote — your storage is altering objects."),
    );
  }
  steps.push({ step: "compare", label: "Check the bytes match", ok: true });

  // 4 · Public-bucket check. A publicly readable bucket makes every permission rule in
  // the platform decorative, so we refuse to activate one.
  const isPublic = await isPubliclyReadable(cfg, probeKey);
  if (isPublic) {
    await deleteObject(cfg, probeKey).catch(() => {});
    steps.push({
      step: "public",
      label: "Confirm the bucket is private",
      ok: false,
      detail: "Anyone on the internet can read objects in this bucket.",
    });
    return {
      ok: false,
      steps,
      error:
        "This bucket is publicly readable, so anything stored in it could be opened by anyone " +
        "with the link. Make the bucket private before connecting it.",
      hint: "In MinIO: `mc anonymous set none <alias>/<bucket>`.",
    };
  }
  steps.push({ step: "public", label: "Confirm the bucket is private", ok: true });

  // 5 · Delete
  try {
    await deleteObject(cfg, probeKey);
    steps.push({ step: "delete", label: "Clean up the test file", ok: true });
  } catch (err) {
    return fail(
      "delete",
      "Clean up the test file",
      err,
      "We can write and read but not delete. Without DeleteObject, removing a document here " +
        "would leave the file on your storage forever.",
    );
  }

  return { ok: true, steps };
}

// ── Activation (§9.3) ────────────────────────────────────────────────────────

/**
 * Test the supplied configuration and, if it passes, persist it.
 *
 * Called both from organization creation (before the creation transaction opens, so a
 * failure consumes nothing) and from storage settings later.
 */
export async function connectStorage(
  orgId: string,
  input: StorageConfigInput,
): Promise<{ ok: false; result: StorageTestResult } | { ok: true; row: OrgStorage }> {
  const cfg: S3Config = {
    endpoint: input.endpoint.replace(/\/+$/, ""),
    bucket: input.bucket,
    region: input.region || "us-east-1",
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    forcePathStyle: input.forcePathStyle,
  };

  const result = await testConnection(cfg, input.prefix);
  if (!result.ok) return { ok: false, result };

  const existing = await db.orgStorage.findUnique({ where: { orgId } });
  // The DEK is generated once and kept for the life of the organization: regenerating
  // it would orphan every object already encrypted under the old one.
  const wrappedDek =
    existing?.wrappedDek ??
    (input.encryption === "ENCRYPTED" ? wrapDekForPlatform(orgId, newDek()) : null);

  const data = {
    adapter: "s3",
    endpoint: cfg.endpoint,
    bucket: cfg.bucket,
    region: cfg.region,
    prefix: input.prefix.replace(/^\/+|\/+$/g, ""),
    forcePathStyle: cfg.forcePathStyle,
    accessKeyIdEnc: sealCredential(orgId, input.accessKeyId),
    secretKeyEnc: sealCredential(orgId, input.secretAccessKey),
    wrappedDek,
    status: "ACTIVE" as const,
    // The posture is fixed at activation: changing it re-encrypts every stored object,
    // so it is a migration rather than a setting (§9.5).
    encryption: existing ? existing.encryption : input.encryption,
    lastCheckAt: new Date(),
    lastError: null,
    degradedAt: null,
  };

  const row = await db.orgStorage.upsert({
    where: { orgId },
    create: { orgId, ...data },
    update: data,
  });
  return { ok: true, row };
}

// ── Health (§9.8) ────────────────────────────────────────────────────────────

/**
 * Re-test one organization's backend and move it between ACTIVE and DEGRADED.
 *
 * Returns the transition, so the caller can raise the high-priority mailbox message
 * exactly once on the way in and once on the way out.
 */
export async function checkHealth(
  row: OrgStorage,
): Promise<{ status: "ACTIVE" | "DEGRADED"; changed: boolean; error?: string }> {
  let cfg: S3Config;
  try {
    cfg = s3ConfigFor(row);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const changed = row.status !== "DEGRADED";
    await db.orgStorage.update({
      where: { id: row.id },
      data: {
        status: "DEGRADED",
        lastCheckAt: new Date(),
        lastError: error,
        degradedAt: row.degradedAt ?? new Date(),
      },
    });
    return { status: "DEGRADED", changed, error };
  }

  const probeKey = fullKey(row, `.health-${randomBytes(6).toString("hex")}`);
  try {
    await putObject(cfg, probeKey, Buffer.from("ok", "utf8"), "text/plain");
    await deleteObject(cfg, probeKey);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const changed = row.status !== "DEGRADED";
    await db.orgStorage.update({
      where: { id: row.id },
      data: {
        status: "DEGRADED",
        lastCheckAt: new Date(),
        lastError: error,
        degradedAt: row.degradedAt ?? new Date(),
      },
    });
    return { status: "DEGRADED", changed, error };
  }

  const changed = row.status !== "ACTIVE";
  await db.orgStorage.update({
    where: { id: row.id },
    data: { status: "ACTIVE", lastCheckAt: new Date(), lastError: null, degradedAt: null },
  });
  return { status: "ACTIVE", changed };
}

/** Real consumption, read from their storage rather than from our own bookkeeping. */
export async function usageFor(row: OrgStorage): Promise<{ objects: number; bytes: number }> {
  try {
    const listed = await listObjects(s3ConfigFor(row), fullKey(row, "objects/"), 1000);
    return { objects: listed.keys.length, bytes: listed.bytes };
  } catch {
    // Usage is informational — never let it take a page down.
    const agg = await db.storageObject.aggregate({
      where: { orgId: row.orgId },
      _sum: { bytes: true },
      _count: true,
    });
    return { objects: agg._count, bytes: agg._sum.bytes ?? 0 };
  }
}
