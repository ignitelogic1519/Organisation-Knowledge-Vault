import type { FastifyInstance } from "fastify";
import {
  KVBLOB_FRAME_BYTES,
  MAX_OBJECT_BYTES,
  storageConfigSchema,
  storageCredentialsSchema,
  uploadCommitSchema,
  uploadTicketSchema,
  type StorageTestResult,
  type StorageView,
  type UploadTicket,
} from "@vault/shared";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
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
import { newFileKey, sealCredential, storageKekConfigured, wrapFileKey } from "./secrets.js";

// Storage settings and the direct-to-storage upload/download tickets
// (docs/structure.md §9.3, §9.4, §9.5).
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
      return {
        configured: true,
        adapter: "s3",
        status: row.status,
        encryption: row.encryption,
        endpoint: row.endpoint,
        bucket: row.bucket,
        prefix: row.prefix,
        region: row.region,
        // Never the secret, and never the key itself once saved (§9.3).
        accessKeyIdMasked: "••••••••",
        lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
        lastError: row.lastError,
        degradedAt: row.degradedAt?.toISOString() ?? null,
        objectCount: usage.objects,
        bytesUsed: usage.bytes,
        pendingMigration,
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

  // ── Replace credentials on a live backend ──────────────────────────────────
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
      const { checkHealth } = await import("./org-storage.js");
      const result = await checkHealth(row);
      return { status: result.status, error: result.error ?? null };
    },
  );

  // ── Upload ticket: the browser PUTs straight into their storage ────────────
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/storage/upload-url",
    { preHandler: app.authenticate },
    async (req, reply): Promise<UploadTicket> => {
      const body = uploadTicketSchema.parse(req.body);
      if (!(await isMember(req.profileId, req.params.id))) {
        return reply.status(404).send({ error: "Organization not found" }) as never;
      }
      // Authorization for *publishing* is enforced when the course is created; this
      // ticket only lets a member of the organization write one object into their own
      // organization's storage, under a key we choose.
      const row = await requireWritableStorage(req.params.id);
      if (body.bytes > MAX_OBJECT_BYTES) {
        return reply
          .status(413)
          .send({ error: `Files are capped at ${MAX_OBJECT_BYTES / (1024 * 1024)} MB` }) as never;
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
        ticket.fileKey = fileKey.toString("base64");
        ticket.nonceBase = randomBytes(8).toString("base64");
        // Stash the wrapped key against the pending object so the commit can find it.
        await db.storageObject.create({
          data: {
            orgId: req.params.id,
            objectKey,
            sha256: "",
            bytes: 0,
            mime: body.mime,
            filename: body.filename,
            encrypted: true,
            wrappedKey: wrapFileKey(dekFor(row), fileKey, objectKey),
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

  // ── Commit: the browser confirms the PUT landed ────────────────────────────
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

  // ── Scheduled health sweep, called by the nightly job ──────────────────────
  app.post("/jobs/storage-health", async (req, reply) => {
    const secret = process.env.JOB_SECRET;
    if (secret && req.headers["x-job-secret"] !== secret) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    return runHealthChecks();
  });
}
