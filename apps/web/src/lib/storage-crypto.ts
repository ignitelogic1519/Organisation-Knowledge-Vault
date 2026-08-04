import {
  KVBLOB_MAGIC,
  KVBLOB_TAG_BYTES,
  type DownloadTicket,
  type KvblobHeader,
  type UploadTicket,
} from "@vault/shared";

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
  const res = await fetch(ticket.downloadUrl);
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? "This document's access link has expired — reopen the document to get a fresh one."
        : `Your storage returned ${res.status} for this document.`,
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
