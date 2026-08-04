import { gunzipSync } from "node:zlib";
import type { OrgStorage } from "@prisma/client";
import { db } from "../db.js";
import { notify } from "../courses/helpers.js";
import { deleteObject, putObject } from "./s3.js";
import { checkHealth, fullKey, mintObjectKey, s3ConfigFor, storageFor } from "./org-storage.js";
import { encryptToKvblob } from "./kvblob.js";
import { dekFor } from "./org-storage.js";
import { newFileKey, sha256Hex } from "./secrets.js";

// Background storage work, all driven from the nightly job (POST /jobs/run) and, for
// the deletion queue, opportunistically after a delete. Every one of these is safe to
// run twice.

// ── The deletion queue (§9.10) ───────────────────────────────────────────────

const MAX_DELETE_ATTEMPTS = 8;

/**
 * Execute queued remote deletes. A course delete commits the queue row inside its
 * transaction; this drains it afterwards, so a crash between the two leaves work to
 * retry rather than an object billed to the customer forever.
 *
 * Backs off exponentially and gives up after MAX_DELETE_ATTEMPTS, leaving the row for
 * the reconciliation report rather than deleting it silently.
 */
export async function drainDeletionQueue(limit = 50): Promise<{ done: number; failed: number }> {
  const due = await db.storageDeletion.findMany({
    where: { nextTryAt: { lte: new Date() }, attempts: { lt: MAX_DELETE_ATTEMPTS } },
    orderBy: { nextTryAt: "asc" },
    take: limit,
  });

  let done = 0;
  let failed = 0;
  const byOrg = new Map<string, OrgStorage | null>();

  for (const row of due) {
    if (!byOrg.has(row.orgId)) byOrg.set(row.orgId, await storageFor(row.orgId));
    const store = byOrg.get(row.orgId) ?? null;

    // No storage configured any more (the org disconnected or was purged): there is
    // nothing left for us to delete, so the entry has done its job.
    if (!store) {
      await db.storageDeletion.delete({ where: { id: row.id } });
      done += 1;
      continue;
    }

    try {
      await deleteObject(s3ConfigFor(store), fullKey(store, row.objectKey));
      await db.storageDeletion.delete({ where: { id: row.id } });
      done += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      // 1 min, 2, 4, 8 … capped at a day
      const backoffMs = Math.min(60_000 * 2 ** attempts, 86_400_000);
      await db.storageDeletion.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: err instanceof Error ? err.message : String(err),
          nextTryAt: new Date(Date.now() + backoffMs),
        },
      });
      failed += 1;
    }
  }
  return { done, failed };
}

/** Fire-and-forget drain, used right after a delete so the common case is immediate. */
export function drainSoon(): void {
  void drainDeletionQueue(10).catch(() => {
    // The nightly job will pick it up — never let cleanup break the request that
    // triggered it.
  });
}

// ── Orphan collection (§9.10) ────────────────────────────────────────────────

/** An upload ticket that was never committed is abandoned after this long. */
const ABANDONED_UPLOAD_MS = 24 * 60 * 60 * 1000;

/**
 * Objects nothing points at. Unlike the old StoredFile table, StorageObject carries a real
 * course link, so this is an indexed query rather than a scan of every course's storageRef
 * JSON.
 *
 * Two kinds of orphan, and both cost the organization money if left:
 *
 *  · **Deleted course.** The object outlived whatever referenced it.
 *  · **Abandoned upload.** A ticket was issued and the browser then failed, or the person
 *    closed the tab, or the course form was never submitted. The row still holds a key,
 *    and their storage may well hold the bytes.
 */
export async function collectOrphans(limit = 200): Promise<number> {
  const candidates = await db.storageObject.findMany({
    where: { courseId: { not: null } },
    select: { id: true, orgId: true, objectKey: true, courseId: true },
    take: limit,
  });
  const courseIds = [...new Set(candidates.map((c) => c.courseId!))];
  const alive = new Set(
    (await db.course.findMany({ where: { id: { in: courseIds } }, select: { id: true } })).map(
      (c) => c.id,
    ),
  );

  const orphans = candidates.filter((c) => !alive.has(c.courseId!));

  // Uncommitted tickets past the grace period. The window has to be generous: someone
  // uploading 200 MB over a slow connection is mid-flight, not abandoned.
  const abandoned = await db.storageObject.findMany({
    where: {
      courseId: null,
      createdAt: { lt: new Date(Date.now() - ABANDONED_UPLOAD_MS) },
    },
    select: { id: true, orgId: true, objectKey: true },
    take: limit,
  });

  for (const orphan of [...orphans, ...abandoned]) {
    await db.$transaction([
      db.storageDeletion.create({ data: { orgId: orphan.orgId, objectKey: orphan.objectKey } }),
      db.storageObject.delete({ where: { id: orphan.id } }),
    ]);
  }
  return orphans.length + abandoned.length;
}

// ── Scheduled health check (§9.8) ────────────────────────────────────────────

/**
 * Re-test every connected backend. On a transition into or out of DEGRADED, the
 * organization's owners get a high-priority message — the state must never present as
 * data loss, because it is not.
 */
export async function runHealthChecks(): Promise<{ checked: number; degraded: number }> {
  const rows = await db.orgStorage.findMany({ where: { status: { not: "UNCONFIGURED" } } });
  let degraded = 0;

  for (const row of rows) {
    const result = await checkHealth(row);
    if (result.status === "DEGRADED") degraded += 1;
    if (!result.changed) continue;

    const owners = await db.placement.findMany({
      where: { kind: "OWNER", membership: { orgId: row.orgId } },
      select: { membership: { select: { profileId: true } } },
    });
    const profileIds = [...new Set(owners.map((o) => o.membership.profileId))];

    for (const profileId of profileIds) {
      if (result.status === "DEGRADED") {
        await notify(
          profileId,
          row.orgId,
          "storage_degraded",
          { error: result.error ?? "" },
          {
            subject: "Your storage is not reachable",
            body:
              `Knowledge Vault cannot reach this organization's storage. ${result.error ?? ""}\n\n` +
              "Nothing has been lost. Existing documents will open again as soon as the " +
              "connection is restored, and new uploads are paused until then. Deadline and " +
              "overdue processing is paused too, so nobody is marked late for a document they " +
              "could not open.",
            priority: "HIGH",
          },
        ).catch(() => {});
      } else {
        await notify(
          profileId,
          row.orgId,
          "storage_recovered",
          {},
          {
            subject: "Your storage is reachable again",
            body:
              "Knowledge Vault can reach this organization's storage again. Documents open as " +
              "normal, uploads have resumed, and deadline processing has restarted.",
            priority: "HIGH",
          },
        ).catch(() => {});
      }
    }
  }
  return { checked: rows.length, degraded };
}

// ── Migration off StoredFile (§9.12) ─────────────────────────────────────────

/**
 * Move files still held in our Postgres onto the organization's own storage: copy up,
 * verify the hash, rewrite the storageRef, drop the row. Resumable and one object at a
 * time, so it can be interrupted at any point without losing anything.
 *
 * Verify-then-drop is the whole point of the ordering — the Postgres row is only
 * deleted once the object is confirmed readable in their storage.
 */
export async function migrateInlineFiles(
  orgId: string,
  limit = 25,
): Promise<{ moved: number; remaining: number; errors: string[] }> {
  const store = await storageFor(orgId);
  if (!store || store.status !== "ACTIVE") {
    return { moved: 0, remaining: await pendingMigrationCount(orgId), errors: [] };
  }

  const courses = await db.course.findMany({
    where: { orgId, storageRef: { path: ["adapter"], equals: "inline" } },
    select: { id: true, storageRef: true },
    take: limit,
  });

  const cfg = s3ConfigFor(store);
  const encrypted = store.encryption === "ENCRYPTED";
  const dek = encrypted ? dekFor(store) : null;
  const errors: string[] = [];
  let moved = 0;

  for (const course of courses) {
    const ref = course.storageRef as { adapter?: string; fileId?: string; gz?: boolean };
    if (ref.adapter !== "inline" || !ref.fileId) continue;

    try {
      const file = await db.storedFile.findUnique({ where: { id: ref.fileId } });
      if (!file) continue;

      const plaintext = ref.gz ? gunzipSync(Buffer.from(file.data)) : Buffer.from(file.data);
      const sha256 = sha256Hex(plaintext);
      const objectKey = mintObjectKey(encrypted);

      let body: Buffer = plaintext;
      let wrappedKey: string | null = null;
      if (encrypted && dek) {
        const fileKey = newFileKey();
        const sealed = encryptToKvblob(plaintext, fileKey, {
          mime: file.mime,
          filename: file.filename,
          sha256,
        });
        body = sealed.blob;
        wrappedKey = sealed.wrapFileKey(dek, objectKey);
      }

      await putObject(cfg, fullKey(store, objectKey), body, "application/octet-stream");

      // Verify before dropping: the object must be readable back out of their storage.
      const { headObject } = await import("./s3.js");
      const head = await headObject(cfg, fullKey(store, objectKey));
      if (!head.exists || head.bytes !== body.length) {
        throw new Error("The uploaded object did not read back at the expected size");
      }

      await db.$transaction([
        db.storageObject.create({
          data: {
            orgId,
            objectKey,
            sha256,
            bytes: plaintext.length,
            mime: file.mime,
            filename: file.filename,
            encrypted,
            courseId: course.id,
            ...(wrappedKey ? { wrappedKey } : {}),
          },
        }),
        db.course.update({
          where: { id: course.id },
          data: { storageRef: { adapter: "s3", objectKey, storageObjectId: "" } },
        }),
        db.storedFile.deleteMany({ where: { id: ref.fileId } }),
      ]);
      moved += 1;
    } catch (err) {
      errors.push(`${course.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { moved, remaining: await pendingMigrationCount(orgId), errors };
}

export async function pendingMigrationCount(orgId: string): Promise<number> {
  return db.course.count({
    where: { orgId, storageRef: { path: ["adapter"], equals: "inline" } },
  });
}
