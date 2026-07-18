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
  /** …or raw bytes served through our API. */
  file?: { filename: string; mime: string; data: Buffer };
}

const MAX_INLINE_BYTES = 2 * 1024 * 1024;

export const storage = {
  /** External link "storage" — video/audio/docs hosted anywhere (YouTube, Drive share, …). */
  async saveLink(url: string): Promise<StorageRef> {
    return { adapter: "link", url };
  },

  /** Inline adapter: small files in Postgres — free-tier friendly, capped at 2 MB. */
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
        new Error("Inline storage is capped at 2 MB — host larger media as a LINK course"),
        { statusCode: 413 },
      );
    }
    const row = await db.storedFile.create({
      data: { orgId, filename, mime, size: data.length, data },
    });
    return { adapter: "inline", fileId: row.id };
  },

  async resolve(ref: StorageRef): Promise<StoredContent> {
    switch (ref.adapter) {
      case "link":
        return { url: String(ref.url) };
      case "inline": {
        const row = await db.storedFile.findUnique({ where: { id: String(ref.fileId) } });
        if (!row) throw Object.assign(new Error("Stored file is missing"), { statusCode: 404 });
        return { file: { filename: row.filename, mime: row.mime, data: Buffer.from(row.data) } };
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
