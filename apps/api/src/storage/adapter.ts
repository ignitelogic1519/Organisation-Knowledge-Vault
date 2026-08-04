import { gzipSync, gunzipSync } from "node:zlib";
import type { Prisma } from "@prisma/client";
import { MAX_INLINE_BYTES } from "@vault/shared";
import { db } from "../db.js";

// The storage adapter PORT (docs/architecture.md §4, docs/structure.md §9). Each
// organization's content lives behind one of these; storageRef JSON always carries
// { adapter: <name>, ... } and resolve() is the only thing that turns it into content.
//
// Adapters:
//   link         an external URL — we store nothing
//   authored     Studio blocks, inline in the ref
//   exam         Studio MCQ paper (questions AND answer key), inline in the ref
//   inline       small files in our Postgres — the legacy path, still used by orgs
//                that have not connected storage
//   s3           the organization's OWN S3-compatible storage (MinIO on their NAS,
//                and later S3/R2/GCS/Wasabi/B2/Spaces) — we hold only the pointer
//   unreachable  we know this exists, we cannot fetch it right now
//
// Deletion is part of the port. It did not used to be: four call sites reached past it
// to `db.storedFile.deleteMany` inside a transaction. A remote delete cannot run inside
// a Postgres transaction, so `queueDeletion` records the intent transactionally and the
// drain executes it afterwards (§9.10).

export interface StorageRef {
  adapter: string;
  [key: string]: unknown;
}

export interface StoredContent {
  /** Either a URL the client can open… */
  url?: string;
  /** …or raw bytes served through our API (inline adapter only)… */
  file?: { filename: string; mime: string; data: Buffer };
  /** …or Studio-authored blocks rendered natively by the in-app viewer… */
  authored?: unknown;
  /** …or a Studio-authored MCQ paper, delivered question by question by the exam routes… */
  exam?: unknown;
  /**
   * …or an object in the organization's own storage. The route mints a short-lived
   * download ticket for it; the bytes never pass through us.
   */
  object?: { storageObjectId: string; objectKey: string };
  /** The authored document's theme, when its author set one. */
  theme?: unknown;
}

export const storage = {
  /** External link "storage" — video/audio/docs hosted anywhere (YouTube, Drive share, …). */
  async saveLink(url: string): Promise<StorageRef> {
    return { adapter: "link", url };
  },

  /** Inline adapter: small files in Postgres — capped at 10 MB. Bytes are gzip-compressed
   *  at rest (transparently inflated on read) so the DB stays lean; the user always sees
   *  the original, correctly-formatted file.
   *
   *  This is now the fallback for organizations that have not connected their own
   *  storage. Once they have, uploads go to `s3` and these rows migrate across (§9.12). */
  async saveInline(
    orgId: string,
    filename: string,
    mime: string,
    base64: string,
  ): Promise<StorageRef> {
    const data = Buffer.from(base64, "base64");
    if (data.length === 0) throw Object.assign(new Error("Empty file"), { statusCode: 400 });
    if (data.length > MAX_INLINE_BYTES) {
      throw Object.assign(
        new Error(
          "Files are capped at 10 MB until this organization connects its own storage — " +
            "connect a NAS in storage settings to raise it to 200 MB, or host larger media as a LINK course",
        ),
        { statusCode: 413 },
      );
    }
    // Store the smaller of {gzipped, raw} — tiny/already-compressed files don't shrink
    const gz = gzipSync(data);
    const useGz = gz.length < data.length;
    const row = await db.storedFile.create({
      data: {
        orgId,
        filename,
        mime,
        size: data.length, // original size (what the user downloads)
        data: useGz ? gz : data,
      },
    });
    return { adapter: "inline", fileId: row.id, gz: useGz };
  },

  /** The organization's own storage: the browser has already uploaded the object
   *  directly, so all we record is where it is and what it should hash to. */
  async saveObject(storageObjectId: string, objectKey: string): Promise<StorageRef> {
    return { adapter: "s3", storageObjectId, objectKey };
  },

  /** Studio-authored interactive documents: the blocks (and the document's theme) live
   *  inside the ref itself — nothing external to fetch when a reader opens it. */
  async saveAuthored(blocks: unknown, theme?: unknown): Promise<StorageRef> {
    return { adapter: "authored", blocks, ...(theme ? { theme } : {}) };
  },

  /** Studio-authored MCQ exams: the questions AND the answer key live in the ref. It is
   *  never resolved straight to a candidate — /courses/:code/exam deals the paper without
   *  the key, and marking happens on the server. */
  async saveExam(exam: unknown, theme?: unknown): Promise<StorageRef> {
    return { adapter: "exam", exam, ...(theme ? { theme } : {}) };
  },

  async resolve(ref: StorageRef): Promise<StoredContent> {
    switch (ref.adapter) {
      case "link":
        return { url: String(ref.url) };
      case "authored":
        return { authored: ref.blocks, theme: ref.theme };
      case "exam":
        return { exam: ref.exam, theme: ref.theme };
      case "s3":
        return {
          object: {
            storageObjectId: String(ref.storageObjectId),
            objectKey: String(ref.objectKey),
          },
        };
      case "inline": {
        const row = await db.storedFile.findUnique({ where: { id: String(ref.fileId) } });
        if (!row) throw Object.assign(new Error("Stored file is missing"), { statusCode: 404 });
        const stored = Buffer.from(row.data);
        // Inflate when compressed; fall back to raw for legacy rows without the flag
        const data = ref.gz ? gunzipSync(stored) : stored;
        return { file: { filename: row.filename, mime: row.mime, data } };
      }
      case "unreachable":
        // Post-revival marker (docs/structure.md §5.1): media listed but needs reconnection
        throw Object.assign(
          new Error("This content is unreachable until the organization reconnects its storage"),
          { statusCode: 409 },
        );
      default:
        throw Object.assign(new Error(`Unknown storage adapter: ${ref.adapter}`), {
          statusCode: 500,
        });
    }
  },
};

// ── Deletion (§9.10) ─────────────────────────────────────────────────────────

/**
 * The database operations that release whatever a course's ref holds, as a list to
 * splice into an existing `db.$transaction([...])`.
 *
 * For `inline` this deletes the Postgres row outright. For `s3` it records a queue
 * entry — committed with the transaction, executed after it — because a remote delete
 * cannot participate in a database transaction and must survive a crash in between.
 */
export function deletionOpsFor(
  orgId: string,
  ref: { adapter?: string; fileId?: string; objectKey?: string; storageObjectId?: string } | null,
): Prisma.PrismaPromise<unknown>[] {
  if (!ref?.adapter) return [];
  if (ref.adapter === "inline" && ref.fileId) {
    return [db.storedFile.deleteMany({ where: { id: ref.fileId } })];
  }
  if (ref.adapter === "s3" && ref.objectKey) {
    return [
      db.storageDeletion.create({ data: { orgId, objectKey: ref.objectKey } }),
      db.storageObject.deleteMany({ where: { orgId, objectKey: ref.objectKey } }),
    ];
  }
  return [];
}
