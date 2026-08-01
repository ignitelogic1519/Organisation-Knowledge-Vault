import { gzipSync, gunzipSync } from "node:zlib";
import { db } from "../db.js";

// The storage adapter PORT (docs/architecture.md §4). Each organization's media lives behind
// one of these; new backends (Google Drive when activated, NAS, S3) plug in here without
// touching course logic. storageRef JSON always carries { adapter: <name>, ... }.

export interface StorageRef {
  adapter: string;
  [key: string]: unknown;
}

export interface StoredContent {
  /** Either a URL the client can open… */
  url?: string;
  /** …or raw bytes served through our API… */
  file?: { filename: string; mime: string; data: Buffer };
  /** …or Studio-authored blocks rendered natively by the in-app viewer. */
  authored?: unknown;
  /** The authored document's theme, when its author set one. */
  theme?: unknown;
}

const MAX_INLINE_BYTES = 10 * 1024 * 1024;

export const storage = {
  /** External link "storage" — video/audio/docs hosted anywhere (YouTube, Drive share, …). */
  async saveLink(url: string): Promise<StorageRef> {
    return { adapter: "link", url };
  },

  /** Inline adapter: small files in Postgres — capped at 10 MB. Bytes are gzip-compressed
   *  at rest (transparently inflated on read) so the DB stays lean; the user always sees
   *  the original, correctly-formatted file. */
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
        new Error("Inline storage is capped at 10 MB — host larger media as a LINK course"),
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

  /** Studio-authored interactive documents: the blocks (and the document's theme) live
   *  inside the ref itself — nothing external to fetch when a reader opens it. */
  async saveAuthored(blocks: unknown, theme?: unknown): Promise<StorageRef> {
    return { adapter: "authored", blocks, ...(theme ? { theme } : {}) };
  },

  async resolve(ref: StorageRef): Promise<StoredContent> {
    switch (ref.adapter) {
      case "link":
        return { url: String(ref.url) };
      case "authored":
        return { authored: ref.blocks, theme: ref.theme };
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
