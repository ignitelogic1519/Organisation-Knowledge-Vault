import {
  GATEWAY_CHUNK_BYTES,
  KVBLOB_MAGIC,
  KVBLOB_SHA256_PLACEHOLDER,
  KVBLOB_TAG_BYTES,
  type DownloadTicket,
  type KvblobHeader,
  type UploadTicket,
} from "@vault/shared";
import { sha256 as sha256Incremental } from "@noble/hashes/sha2";

// Browser-side encryption for organization-provided storage (docs/structure.md §9.5).
//
// This is what keeps the bandwidth bill at zero AND keeps plaintext out of our servers:
// the browser encrypts before uploading straight to the organization's storage, and
// decrypts after downloading straight from it. Our API only ever handles the key for
// one object, over its already-authenticated channel.
//
// The frame layout is fixed in @vault/shared and matches the server codec byte for byte.

const enc = new TextEncoder();
const dec = new TextDecoder();

function nonceFor(base: Uint8Array, counter: number): Uint8Array<ArrayBuffer> {
  const nonce = new Uint8Array(new ArrayBuffer(12));
  nonce.set(base.subarray(0, 8), 0);
  new DataView(nonce.buffer).setUint32(8, counter, false);
  return nonce;
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  // Chunked: String.fromCharCode(...) on a 200 MB array blows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", b64ToBytes(keyB64), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** SHA-256 of the plaintext, hex — the integrity hash recorded with the object. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf: ArrayBuffer = data instanceof Uint8Array ? data.slice().buffer : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Encrypt a file into the framed .kvblob format.
 *
 * Frames matter: Web Crypto's AES-GCM has no streaming mode, so encrypting a 200 MB
 * file in one call would need 200 MB of memory twice and would crash a phone. Each
 * 4 MB frame is sealed on its own under a counter-derived nonce.
 */
export async function encryptFile(
  file: File,
  ticket: UploadTicket,
): Promise<{ body: Blob; sha256: string }> {
  const plaintext = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  const hash = await sha256Hex(plaintext);

  if (!ticket.encrypted || !ticket.fileKey || !ticket.nonceBase) {
    // PLAIN posture: the file goes up as itself, readable in their storage by anyone
    // they have given storage access to. Their informed choice (§9.5).
    return { body: new Blob([plaintext as BlobPart]), sha256: hash };
  }

  const key = await importKey(ticket.fileKey);
  const nonceBase = b64ToBytes(ticket.nonceBase);
  const header: KvblobHeader = {
    v: 1,
    alg: "AES-256-GCM",
    frame: ticket.frameBytes,
    nonceBase: ticket.nonceBase,
    size: plaintext.length,
    sha256: hash,
    mime: file.type || "application/octet-stream",
    filename: file.name,
    // The file key, wrapped under the organization's data key, travels with the object
    // so the key escrowed in .main opens it without our database (§9.11).
    ...(ticket.wrappedKey ? { wk: ticket.wrappedKey, ok: ticket.objectKey, dv: ticket.dekVersion ?? 1 } : {}),
  };

  const headerBytes = enc.encode(JSON.stringify(header));
  const lenBytes = new Uint8Array(4);
  new DataView(lenBytes.buffer).setUint32(0, headerBytes.length, true);

  const parts: BlobPart[] = [enc.encode(KVBLOB_MAGIC), lenBytes, headerBytes];
  const frameCount = Math.max(1, Math.ceil(plaintext.length / ticket.frameBytes));
  for (let i = 0; i < frameCount; i += 1) {
    const slice = plaintext.slice(i * ticket.frameBytes, (i + 1) * ticket.frameBytes);
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonceFor(nonceBase, i), tagLength: KVBLOB_TAG_BYTES * 8 },
      key,
      slice,
    );
    parts.push(sealed);
  }

  return { body: new Blob(parts), sha256: hash };
}

/**
 * Fetch an object straight from the organization's storage and decrypt it here.
 *
 * The ciphertext never passes through Knowledge Vault, and neither does the plaintext.
 */
export async function fetchAndDecrypt(ticket: DownloadTicket): Promise<Uint8Array> {
  const res = await fetch(ticket.downloadUrl, {
    // Through the gateway the ticket goes in a header, never in the URL.
    headers: ticket.transport === "gateway" && ticket.ticket ? { authorization: `KVT ${ticket.ticket}` } : {},
  });
  if (!res.ok) {
    let message = "";
    if (ticket.transport === "gateway") {
      message = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "";
    }
    throw new Error(
      message ||
        (res.status === 403 || res.status === 401
          ? "This document's access link has expired — reopen the document to get a fresh one."
          : `Your storage returned ${res.status} for this document.`),
    );
  }
  const raw = new Uint8Array(await res.arrayBuffer()) as Uint8Array<ArrayBuffer>;

  if (!ticket.encrypted || !ticket.fileKey) {
    if (ticket.sha256) {
      const actual = await sha256Hex(raw);
      if (actual !== ticket.sha256) throw new Error(integrityMessage);
    }
    return raw;
  }

  const magic = dec.decode(raw.subarray(0, 8));
  if (magic !== KVBLOB_MAGIC) {
    throw new Error(
      "This document is not in the expected format — it may have been replaced in your storage.",
    );
  }
  const headerLen = new DataView(raw.buffer, raw.byteOffset).getUint32(8, true);
  const header = JSON.parse(dec.decode(raw.subarray(12, 12 + headerLen))) as KvblobHeader;
  // Our records are the authority on an object's shape; a stored header that disagrees
  // has been tampered with and is refused (§9.16).
  if (header.size !== ticket.bytes || (ticket.sha256 && header.sha256 !== ticket.sha256)) {
    throw new Error(integrityMessage);
  }

  const key = await importKey(ticket.fileKey);
  const nonceBase = b64ToBytes(header.nonceBase);
  const out = new Uint8Array(new ArrayBuffer(header.size));
  const frameCount = Math.max(1, Math.ceil(header.size / header.frame));

  let offset = 12 + headerLen;
  let written = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const plainLen = Math.min(header.frame, Math.max(0, header.size - i * header.frame));
    const cipherLen = plainLen + KVBLOB_TAG_BYTES;
    if (offset + cipherLen > raw.length) {
      throw new Error("This document is incomplete — the download was cut short.");
    }
    const frame = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonceFor(nonceBase, i), tagLength: KVBLOB_TAG_BYTES * 8 },
      key,
      raw.slice(offset, offset + cipherLen),
    );
    out.set(new Uint8Array(frame), written);
    written += plainLen;
    offset += cipherLen;
  }

  // Their storage is now the weak link in a way ours was not: a silently corrupted file
  // must be a clear error, never a broken PDF (§9.4).
  if ((await sha256Hex(out)) !== header.sha256) throw new Error(integrityMessage);
  return out;
}

const integrityMessage =
  "This document failed its integrity check — the copy in your storage does not match what " +
  "was uploaded, so it has not been shown. Contact your organization's owner.";

/**
 * Upload one file straight into the organization's storage.
 *
 * Returns what the course-create call needs to attach it. The bytes go browser →
 * their storage; our API sees only the key and the hash.
 */
export async function uploadToOrgStorage(
  file: File,
  ticket: UploadTicket,
  commit: (payload: {
    objectKey: string;
    sha256: string;
    bytes: number;
    filename: string;
    mime: string;
  }) => Promise<{ storageObjectId: string }>,
): Promise<{ storageObjectId: string }> {
  const { body, sha256 } = await encryptFile(file, ticket);

  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: ticket.headers,
    body,
  });
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? "Your storage rejected the upload. The access key may not have write permission, " +
          "or the upload link expired before the file finished."
        : `Your storage rejected the upload (HTTP ${res.status}). If this keeps happening, ` +
          "check the CORS rules on the bucket.",
    );
  }

  return commit({
    objectKey: ticket.objectKey,
    sha256,
    bytes: file.size,
    filename: file.name,
    mime: file.type || "application/octet-stream",
  });
}

export { bytesToB64 };

// ── Uploads through the streaming gateway (Google Drive, §9.16) ───────────────

const READ_BYTES = 4 * 1024 * 1024;
const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Pass 1: the plaintext's SHA-256, read in slices — the file is never held whole. */
async function hashFile(file: File, onProgress?: (fraction: number) => void): Promise<string> {
  const h = sha256Incremental.create();
  for (let at = 0; at < file.size; at += READ_BYTES) {
    h.update(new Uint8Array(await file.slice(at, at + READ_BYTES).arrayBuffer()));
    onProgress?.(Math.min(1, (at + READ_BYTES) / Math.max(1, file.size)));
  }
  return toHex(h.digest());
}

/** Pass 2: the exact bytes to store, produced a piece at a time. */
async function* storedBytes(file: File, ticket: UploadTicket, plainSha: string): AsyncGenerator<Uint8Array> {
  if (!ticket.encrypted) {
    for (let at = 0; at < file.size; at += READ_BYTES) {
      yield new Uint8Array(await file.slice(at, at + READ_BYTES).arrayBuffer());
    }
    return;
  }
  if (!ticket.fileKey || !ticket.nonceBase || !ticket.headerTemplate) {
    throw new Error("The upload ticket is missing its encryption details.");
  }
  // The server laid the header out already; only the hash is ours to fill in, and it is
  // exactly as long as the placeholder, so the stored size stays what was announced.
  const headerBytes = enc.encode(ticket.headerTemplate.replace(KVBLOB_SHA256_PLACEHOLDER, plainSha));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, headerBytes.length, true);
  yield enc.encode(KVBLOB_MAGIC);
  yield len;
  yield headerBytes;

  const key = await importKey(ticket.fileKey);
  const nonceBase = b64ToBytes(ticket.nonceBase);
  const frame = ticket.frameBytes;
  const frames = Math.max(1, Math.ceil(file.size / frame));
  for (let i = 0; i < frames; i += 1) {
    const plain = new Uint8Array(await file.slice(i * frame, (i + 1) * frame).arrayBuffer());
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonceFor(nonceBase, i), tagLength: KVBLOB_TAG_BYTES * 8 },
      key,
      plain,
    );
    yield new Uint8Array(sealed);
  }
}

interface ChunkReply {
  confirmed: number;
  done: boolean;
  error?: string;
}

async function putToGateway(
  ticket: UploadTicket,
  body: Uint8Array<ArrayBuffer> | null,
  start: number,
  total: number,
): Promise<{ status: number; reply: ChunkReply }> {
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: {
      authorization: `KVT ${ticket.ticket}`,
      "content-type": "application/octet-stream",
      "content-range": body ? `bytes ${start}-${start + body.length - 1}/${total}` : `bytes */${total}`,
    },
    body: body ?? new Uint8Array(0),
  });
  const reply = (await res.json().catch(() => ({}))) as ChunkReply;
  return { status: res.status, reply };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send one chunk, resuming from whatever Google already holds if the connection drops.
 * Returns the offset Google has confirmed after it.
 */
async function sendChunk(
  ticket: UploadTicket,
  chunk: Uint8Array<ArrayBuffer>,
  start: number,
  total: number,
): Promise<number> {
  let offset = start;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const piece = chunk.subarray(offset - start);
    try {
      const { status, reply } = await putToGateway(ticket, piece as Uint8Array<ArrayBuffer>, offset, total);
      if (status === 200) return reply.confirmed;
      if (status === 409 && typeof reply.confirmed === "number") {
        if (reply.confirmed < start) {
          throw Object.assign(new Error("Part of the upload was lost on the way. Upload the file again."), { final: true });
        }
        offset = reply.confirmed; // Google already holds some of this chunk: send the rest
        if (offset >= start + chunk.length) return offset;
        continue;
      }
      if (status === 429 || status === 401 || status === 403 || status === 410 || status === 413 || status === 400) {
        throw Object.assign(new Error(reply.error ?? `The upload was refused (${status}).`), { final: true });
      }
    } catch (err) {
      if ((err as { final?: boolean }).final) throw err;
      // A dropped connection: fall through and ask what arrived.
    }
    await pause(Math.min(8000, 500 * 2 ** attempt));
    const { status, reply } = await putToGateway(ticket, null, 0, total).catch(() => ({ status: 0, reply: { confirmed: offset, done: false } }));
    if (status === 200) {
      if (reply.done || reply.confirmed >= start + chunk.length) return reply.confirmed;
      if (reply.confirmed < start) {
        throw new Error("Part of the upload was lost on the way. Upload the file again.");
      }
      offset = reply.confirmed;
    }
  }
  throw new Error("The upload kept failing. Check the connection and try again — nothing was published.");
}

/**
 * Upload one file to Google Drive through the streaming gateway: hash it, encrypt it
 * frame by frame when the posture is ENCRYPTED, and send it in resumable chunks. Memory
 * stays at one chunk, whatever the file size.
 */
export async function uploadViaGateway(
  file: File,
  ticket: UploadTicket,
  commit: (payload: {
    objectKey: string;
    sha256: string;
    cipherSha256: string;
    bytes: number;
    filename: string;
    mime: string;
  }) => Promise<{ storageObjectId: string }>,
  onProgress?: (stage: "preparing" | "encrypting" | "uploading", fraction: number) => void,
): Promise<{ storageObjectId: string }> {
  const total = ticket.cipherBytes ?? file.size;
  const chunkSize = ticket.chunkBytes ?? GATEWAY_CHUNK_BYTES;
  const plainSha = await hashFile(file, (f) => onProgress?.("preparing", f));

  const cipherHash = sha256Incremental.create();
  let chunk = new Uint8Array(new ArrayBuffer(chunkSize));
  let fill = 0;
  let sent = 0;
  const flush = async () => {
    if (fill === 0) return;
    const confirmed = await sendChunk(ticket, chunk.subarray(0, fill) as Uint8Array<ArrayBuffer>, sent, total);
    sent += fill;
    if (confirmed < sent) throw new Error("Google Drive did not keep the whole chunk. Upload the file again.");
    fill = 0;
    chunk = new Uint8Array(new ArrayBuffer(chunkSize));
    onProgress?.("uploading", sent / total);
  };

  for await (const piece of storedBytes(file, ticket, plainSha)) {
    cipherHash.update(piece);
    let at = 0;
    while (at < piece.length) {
      const take = Math.min(chunkSize - fill, piece.length - at);
      chunk.set(piece.subarray(at, at + take), fill);
      fill += take;
      at += take;
      if (fill === chunkSize) await flush();
    }
    if (ticket.encrypted) onProgress?.("encrypting", (sent + fill) / total);
  }
  await flush();
  if (sent !== total) {
    throw new Error("The file changed while it was being uploaded. Choose it again and retry.");
  }

  return commit({
    objectKey: ticket.objectKey,
    sha256: plainSha,
    cipherSha256: toHex(cipherHash.digest()),
    bytes: file.size,
    filename: file.name,
    mime: file.type || "application/octet-stream",
  });
}
