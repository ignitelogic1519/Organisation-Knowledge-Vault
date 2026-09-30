import type { FastifyInstance } from "fastify";
import {
  KVBLOB_FRAME_BYTES,
  MAX_OBJECT_BYTES,
  gdriveAuthorizeSchema,
  storageConfigSchema,
  storageCredentialsSchema,
  uploadCommitSchema,
  uploadTicketSchema,
  type GdriveConnectionView,
  type StorageTestResult,
  type StorageView,
  type UploadTicket,
} from "@vault/shared";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { env } from "../env.js";
import { audit } from "../security.js";
import { requireSupreme } from "../orgs/supreme.js";
import { presign } from "./s3.js";
import {
  connectStorage,
  dekFor,
  fullKey,
  mintObjectKey,
  requireWritableStorage,
  s3ConfigFor,
  storageFor,
  testConnection,
  usageFor,
} from "./org-storage.js";
import { migrateInlineFiles, pendingMigrationCount, runHealthChecks } from "./jobs.js";
import { newFileKey, openValue, sealCredential, sealValue, storageKekConfigured, wrapFileKey } from "./secrets.js";
import {
  PENDING_TTL_MS,
  beginGdriveUpload,
  commitGdriveUpload,
  connectGdrive,
  driveForPending,
  folderUrl,
  pendingKey,
  testPending,
  usablePending,
} from "./gdrive-store.js";
import {
  buildAuthorizeUrl,
  dropAccessToken,
  exchangeCode,
  googleConfigured,
  primeAccessToken,
  readState,
  revokeToken,
} from "./google.js";
import { gatewayIsExternal } from "./gateway-url.js";
import { streamUsage } from "./gateway.js";
import { allow, tooMany } from "./rate.js";

// Storage settings and the upload/download tickets (docs/structure.md §9.3, §9.4, §9.5,
// §9.16).
//
// Configuring storage is a governance act — it decides where the organization's
// documents live — so it sits behind the Supreme gate, like owner management and
// deletion. Reading the storage panel does not.

/** Presigned URLs are bearer tokens: short-lived, one object each, minted per view. */
const TICKET_TTL_SECONDS = 300;

async function isOrgOwner(profileId: string, orgId: string): Promise<boolean> {
  const owner = await db.placement.findFirst({
    where: { kind: "OWNER", membership: { profileId, orgId } },
  });
  return owner !== null;
}

async function isMember(profileId: string, orgId: string): Promise<boolean> {
  const m = await db.membership.findUnique({
    where: { profileId_orgId: { profileId, orgId } },
  });
  return m !== null;
}

/** Where the Google sign-in lands when it is done: a page on our own web origin. */
function donePage(params: Record<string, string>): string {
  const origin = env.webOrigin || "http://localhost:3000";
  return `${origin.replace(/\/+$/, "")}/storage/google/done?${new URLSearchParams(params).toString()}`;
}

export async function storageRoutes(app: FastifyInstance) {
  // ── The storage panel ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/orgs/:id/storage",
    { preHandler: app.authenticate },
    async (req, reply): Promise<StorageView> => {
      if (!(await isMember(req.profileId, req.params.id))) {
        return reply.status(404).send({ error: "Organization not found" }) as never;
      }
      const row = await storageFor(req.params.id);
      const pendingMigration = await pendingMigrationCount(req.params.id);

      if (!row) {
        return {
          configured: false,
          adapter: null,
          status: "UNCONFIGURED",
          encryption: null,
          endpoint: null,
          bucket: null,
          prefix: null,
          region: null,
          accessKeyIdMasked: null,
          lastCheckAt: null,
          lastError: null,
          degradedAt: null,
          objectCount: 0,
          bytesUsed: 0,
          pendingMigration,
        };
      }

      const usage = await usageFor(row);
      const isDrive = row.adapter === "gdrive";
      return {
        configured: true,
        adapter: isDrive ? "gdrive" : "s3",
        status: row.status,
        encryption: row.encryption,
        endpoint: row.endpoint,
        bucket: row.bucket,
        prefix: row.prefix,
        region: row.region,
        // Never the secret, and never the key itself once saved (§9.3).
        accessKeyIdMasked: isDrive ? null : "••••••••",
        lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
        lastError: row.lastError,
        degradedAt: row.degradedAt?.toISOString() ?? null,
        degradedReason: (row.degradedReason as StorageView["degradedReason"]) ?? null,
        objectCount: usage.objects,
        bytesUsed: usage.bytes,
        pendingMigration,
        gdrive: isDrive
          ? {
              accountEmail: row.gdriveAccountEmail ?? "",
              hostedDomain: row.gdriveHostedDomain,
              target: "MY_DRIVE",
              folderUrl: folderUrl(row.gdriveRootId),
              quotaLimitBytes: row.quotaLimitBytes === null ? null : Number(row.quotaLimitBytes),
              quotaUsedBytes: row.quotaUsedBytes === null ? null : Number(row.quotaUsedBytes),
            }
          : null,
        streamUsage: isDrive ? await streamUsage(row.orgId) : null,
      };
    },
  );

  // ── Test a configuration without saving it ─────────────────────────────────
  // Used by the setup form's "Test connection" button and by organization creation
  // before its transaction opens.
  app.post(
    "/storage/test",
    { preHandler: app.authenticate },
    async (req): Promise<StorageTestResult> => {
      const body = storageConfigSchema.parse(req.body);
      if (!storageKekConfigured()) {
        return {
          ok: false,
          steps: [],
          error:
            "This platform is not configured to hold storage credentials safely yet (STORAGE_KEK " +
            "is not set). Contact the Knowledge Base team.",
        };
      }
      if (!allow(`test:${req.profileId}`, 20, 60_000)) throw tooMany();
      if (body.adapter === "gdrive") {
        const pending = await usablePending(body.connectionId, req.profileId);
        return testPending(pending);
      }
      return testConnection(
        {
          endpoint: body.endpoint.replace(/\/+$/, ""),
          bucket: body.bucket,
          region: body.region || "us-east-1",
          accessKeyId: body.accessKeyId,
          secretAccessKey: body.secretAccessKey,
          forcePathStyle: body.forcePathStyle,
        },
        body.prefix,
      );
    },
  );

  // ── Connect or reconfigure ─────────────────────────────────────────────────
  // Supreme-gated: the same password that protects the escrowed encryption key
  // protects the decision about where the ciphertext goes (§9.3).
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/storage",
    { preHandler: [app.authenticate, requireSupreme] },
    async (req, reply) => {
      if (!(await isOrgOwner(req.profileId, req.params.id))) {
        return reply
          .status(403)
          .send({ error: "Only this organization's owners can configure its storage" });
      }
      const body = storageConfigSchema.parse(req.body);
      const org = await db.organization.findUnique({ where: { id: req.params.id } });
      if (org?.isKvep) {
        return reply.status(400).send({ error: "An employee-perk organization uses Knowledge Vault's own storage." });
      }
      if (body.adapter === "gdrive") {
        const outcome = await connectGdrive(req.params.id, body, req.profileId);
        if (!outcome.ok) return reply.status(400).send(outcome.result);
        await audit(req.params.id, "storage.connect", {
          actorProfileId: req.profileId,
          ip: req.ip,
          detail: { adapter: "gdrive", account: outcome.row.gdriveAccountEmail, folder: outcome.row.gdriveRootId },
        });
        return { ok: true, status: outcome.row.status, encryption: outcome.row.encryption };
      }

      const outcome = await connectStorage(req.params.id, body);
      if (!outcome.ok) return reply.status(400).send(outcome.result);

      await audit(req.params.id, "storage.connect", {
        actorProfileId: req.profileId,
        ip: req.ip,
        // Never the credentials — only where they point.
        detail: { endpoint: outcome.row.endpoint, bucket: outcome.row.bucket },
      });
      return { ok: true, status: outcome.row.status, encryption: outcome.row.encryption };
    },
  );

  // ── Replace credentials on a live S3 backend ───────────────────────────────
  app.put<{ Params: { id: string } }>(
    "/orgs/:id/storage/credentials",
    { preHandler: [app.authenticate, requireSupreme] },
    async (req, reply) => {
      if (!(await isOrgOwner(req.profileId, req.params.id))) {
        return reply
          .status(403)
          .send({ error: "Only this organization's owners can configure its storage" });
      }
      const row = await storageFor(req.params.id);
      if (!row) return reply.status(404).send({ error: "No storage is connected" });
      if (row.adapter !== "s3" || !row.endpoint || !row.bucket) {
        return reply.status(400).send({ error: "Google Drive is reconnected by signing in with Google again." });
      }
      const body = storageCredentialsSchema.parse(req.body);

      const result = await testConnection(
        {
          endpoint: row.endpoint,
          bucket: row.bucket,
          region: row.region,
          accessKeyId: body.accessKeyId,
          secretAccessKey: body.secretAccessKey,
          forcePathStyle: row.forcePathStyle,
        },
        row.prefix,
      );
      if (!result.ok) return reply.status(400).send(result);

      await db.orgStorage.update({
        where: { id: row.id },
        data: {
          accessKeyIdEnc: sealCredential(req.params.id, body.accessKeyId),
          secretKeyEnc: sealCredential(req.params.id, body.secretAccessKey),
          status: "ACTIVE",
          lastCheckAt: new Date(),
          lastError: null,
          degradedAt: null,
        },
      });
      await audit(req.params.id, "storage.credentials_replaced", {
        actorProfileId: req.profileId,
        ip: req.ip,
      });
      return { ok: true };
    },
  );

  // ── Re-check health on demand ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/storage/check",
    { preHandler: app.authenticate },
    async (req, reply) => {
      if (!(await isOrgOwner(req.profileId, req.params.id))) {
        return reply.status(403).send({ error: "Only this organization's owners can do that" });
      }
      const row = await storageFor(req.params.id);
      if (!row) return reply.status(404).send({ error: "No storage is connected" });
      if (!allow(`check:${req.params.id}`, 10, 60_000)) throw tooMany();
      // The same sweep the nightly job runs, so the owners' message on a transition in
      // or out of the degraded state is sent exactly as it would be at night.
      await runHealthChecks([row.orgId]);
      const after = await storageFor(req.params.id);
      return { status: after?.status ?? row.status, error: after?.lastError ?? null };
    },
  );

  // ── Revoke every outstanding streaming ticket ──────────────────────────────
  // The kill switch: anything already handed out — a document open in a tab, an upload
  // in progress — stops working on its next request.
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/storage/revoke-tickets",
    { preHandler: [app.authenticate, requireSupreme] },
    async (req, reply) => {
      if (!(await isOrgOwner(req.profileId, req.params.id))) {
        return reply.status(403).send({ error: "Only this organization's owners can do that" });
      }
      const row = await storageFor(req.params.id);
      if (!row) return reply.status(404).send({ error: "No storage is connected" });
      await db.orgStorage.update({ where: { id: row.id }, data: { ticketEpoch: { increment: 1 } } });
      await audit(req.params.id, "storage.tickets_revoked", { actorProfileId: req.profileId, ip: req.ip });
      return { ok: true };
    },
  );

  // ── Upload ticket ──────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/storage/upload-url",
    { preHandler: app.authenticate },
    async (req, reply): Promise<UploadTicket> => {
      const body = uploadTicketSchema.parse(req.body);
      if (!(await isMember(req.profileId, req.params.id))) {
        return reply.status(404).send({ error: "Organization not found" }) as never;
      }
      if (!allow(`upload:${req.profileId}`, 30, 60_000)) throw tooMany();
      // Authorization for *publishing* is enforced when the course is created; this
      // ticket only lets a member of the organization write one object into their own
      // organization's storage, under a key we choose.
      const row = await requireWritableStorage(req.params.id);
      if (body.bytes > MAX_OBJECT_BYTES) {
        return reply
          .status(413)
          .send({ error: `Files are capped at ${MAX_OBJECT_BYTES / (1024 * 1024)} MB` }) as never;
      }

      if (row.adapter === "gdrive") {
        const encrypted = row.encryption === "ENCRYPTED";
        return beginGdriveUpload(row, body, req.profileId, encrypted ? dekFor(row) : null, mintObjectKey);
      }

      const encrypted = row.encryption === "ENCRYPTED";
      const objectKey = mintObjectKey(encrypted);
      const uploadUrl = presign(
        s3ConfigFor(row),
        "PUT",
        fullKey(row, objectKey),
        TICKET_TTL_SECONDS,
      );

      const ticket: UploadTicket = {
        objectKey,
        transport: "presigned",
        uploadUrl,
        headers: {},
        encrypted,
        frameBytes: KVBLOB_FRAME_BYTES,
        expiresInSeconds: TICKET_TTL_SECONDS,
      };

      if (encrypted) {
        // The file key travels over this already-authenticated channel and is scoped to
        // this one object. The ciphertext never touches us.
        const fileKey = newFileKey();
        const wrappedKey = wrapFileKey(dekFor(row), fileKey, objectKey);
        ticket.fileKey = fileKey.toString("base64");
        ticket.nonceBase = randomBytes(8).toString("base64");
        // Written into the object's own header, so the data key alone opens it (§9.11).
        ticket.wrappedKey = wrappedKey;
        ticket.dekVersion = 1;
        await db.storageObject.create({
          data: {
            orgId: req.params.id,
            objectKey,
            sha256: "",
            bytes: 0,
            mime: body.mime,
            filename: body.filename,
            encrypted: true,
            wrappedKey,
          },
        });
      } else {
        await db.storageObject.create({
          data: {
            orgId: req.params.id,
            objectKey,
            sha256: "",
            bytes: 0,
            mime: body.mime,
            filename: body.filename,
            encrypted: false,
          },
        });
      }
      return ticket;
    },
  );

  // ── Commit: the browser confirms the upload landed ─────────────────────────
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/storage/commit",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = uploadCommitSchema.parse(req.body);
      if (!(await isMember(req.profileId, req.params.id))) {
        return reply.status(404).send({ error: "Organization not found" });
      }
      const row = await requireWritableStorage(req.params.id);
      const pending = await db.storageObject.findUnique({
        where: { orgId_objectKey: { orgId: req.params.id, objectKey: body.objectKey } },
      });
      if (!pending) return reply.status(404).send({ error: "No pending upload for that object" });
      if (pending.courseId) return reply.status(409).send({ error: "That upload is already attached to a document" });

      if (row.adapter === "gdrive") {
        const updated = await commitGdriveUpload(row, pending, body);
        return { storageObjectId: updated.id, objectKey: updated.objectKey };
      }

      // Confirm the object really is in their storage at the size claimed, before any
      // course points at it.
      const { headObject } = await import("./s3.js");
      const head = await headObject(s3ConfigFor(row), fullKey(row, body.objectKey));
      if (!head.exists) {
        return reply
          .status(422)
          .send({ error: "That upload did not arrive in your storage — please try again" });
      }

      const updated = await db.storageObject.update({
        where: { id: pending.id },
        data: {
          sha256: body.sha256,
          bytes: body.bytes,
          mime: body.mime,
          filename: body.filename,
        },
      });
      return { storageObjectId: updated.id, objectKey: updated.objectKey };
    },
  );

  // ── Migration off our Postgres (§9.12) ─────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/storage/migrate",
    { preHandler: app.authenticate },
    async (req, reply) => {
      if (!(await isOrgOwner(req.profileId, req.params.id))) {
        return reply.status(403).send({ error: "Only this organization's owners can do that" });
      }
      const result = await migrateInlineFiles(req.params.id);
      return result;
    },
  );

  // ── Google sign-in (§9.16) ─────────────────────────────────────────────────

  /** Whether this platform can offer Google Drive at all. */
  app.get("/storage/google/status", { preHandler: app.authenticate }, async () => ({
    configured: googleConfigured() && storageKekConfigured(),
    gatewayExternal: gatewayIsExternal(),
  }));

  /** Start a sign-in. The browser opens the returned URL in a pop-up. */
  app.post("/storage/google/authorize", { preHandler: app.authenticate }, async (req, reply) => {
    const body = gdriveAuthorizeSchema.parse(req.body);
    if (!googleConfigured() || !storageKekConfigured()) {
      return reply.status(503).send({
        error:
          "Google Drive is not set up on this platform yet — its Google sign-in client is missing. Contact the Knowledge Base team.",
      });
    }
    if (!allow(`gauth:${req.profileId}`, 10, 60_000)) throw tooMany();
    if (body.intent === "reconnect") {
      if (!body.orgId || !(await isOrgOwner(req.profileId, body.orgId))) {
        return reply.status(403).send({ error: "Only this organization's owners can reconnect its storage" });
      }
    }
    return {
      url: buildAuthorizeUrl({
        profileId: req.profileId,
        intent: body.intent,
        ...(body.intent === "reconnect" ? { orgId: body.orgId } : {}),
      }),
    };
  });

  /**
   * Google sends the browser back here. There is no session on this request — the sealed
   * state says who started the sign-in, and the grant is filed under that profile only.
   */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/storage/google/callback",
    async (req, reply) => {
      reply.header("referrer-policy", "no-referrer").header("cache-control", "no-store");
      if (req.query.error) {
        const message =
          req.query.error === "access_denied"
            ? "Google sign-in was cancelled, so nothing was connected."
            : "Google did not complete the sign-in.";
        return reply.redirect(donePage({ error: message }));
      }
      if (!req.query.code || !req.query.state) {
        return reply.redirect(donePage({ error: "The sign-in reply from Google was incomplete. Try again." }));
      }
      try {
        const state = readState(req.query.state);
        const grant = await exchangeCode(req.query.code, state.verifier);
        const pending = await db.storagePendingConnection.create({
          data: {
            profileId: state.profileId,
            purpose: state.intent === "reconnect" && state.orgId ? state.orgId : "create",
            credentialEnc: "",
            accountEmail: grant.email,
            hostedDomain: grant.hostedDomain,
            expiresAt: new Date(Date.now() + PENDING_TTL_MS),
          },
        });
        // Sealed under its own id: usable only through this pending row, and re-sealed to
        // the organization when the connection is saved.
        await db.storagePendingConnection.update({
          where: { id: pending.id },
          data: { credentialEnc: sealValue(pendingKey(pending), grant.refreshToken) },
        });
        primeAccessToken(pendingKey(pending), grant.accessToken, grant.expiresAt);
        return reply.redirect(donePage({ connection: pending.id }));
      } catch (err) {
        req.log.warn({ err }, "google sign-in failed");
        const message = err instanceof Error ? err.message : "Google sign-in failed.";
        return reply.redirect(donePage({ error: message.slice(0, 300) }));
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/storage/google/connections/:id",
    { preHandler: app.authenticate },
    async (req): Promise<GdriveConnectionView> => {
      const p = await usablePending(req.params.id, req.profileId);
      return {
        connectionId: p.id,
        accountEmail: p.accountEmail,
        hostedDomain: p.hostedDomain,
        isWorkspace: !!p.hostedDomain,
        expiresAt: p.expiresAt.toISOString(),
      };
    },
  );

  /** Abandon a sign-in: remove its test folder and tell Google to forget the grant. */
  app.delete<{ Params: { id: string } }>(
    "/storage/google/connections/:id",
    { preHandler: app.authenticate },
    async (req) => {
      const p = await db.storagePendingConnection.findUnique({ where: { id: req.params.id } });
      if (!p || p.profileId !== req.profileId) return { ok: true };
      try {
        if (p.purpose === "create" && p.gdriveRootId) {
          await driveForPending(p).deleteFile(p.gdriveRootId).catch(() => {});
        }
        await revokeToken(openValue(pendingKey(p), p.credentialEnc)).catch(() => {});
      } finally {
        dropAccessToken(pendingKey(p));
        await db.storagePendingConnection.delete({ where: { id: p.id } }).catch(() => {});
      }
      return { ok: true };
    },
  );

  // ── Scheduled health sweep, called by the nightly job ──────────────────────
  app.post("/jobs/storage-health", async (req, reply) => {
    const secret = process.env.JOB_SECRET;
    if (secret && req.headers["x-job-secret"] !== secret) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    return runHealthChecks();
  });
}
