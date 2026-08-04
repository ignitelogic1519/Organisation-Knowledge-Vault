import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  KVBLOB_FRAME_BYTES,
  KVBLOB_MAGIC,
  KVBLOB_TAG_BYTES,
  type KvblobHeader,
} from "@vault/shared";
import { hashesMatch, sha256Hex, unwrapFileKey, wrapFileKey } from "./secrets.js";

// Server-side codec for the .kvblob object format (docs/structure.md §9.5).
//
// The browser is the normal place encryption and decryption happen — that is what keeps
// bytes off our infrastructure and plaintext out of our memory. This module exists for
// the paths where the server unavoidably handles content:
//
//   · migrating files that are already in our Postgres up to the org's storage
//   · loading an exam paper to mark an attempt (the answer key must never reach a browser)
//   · the standalone recovery tool's reference implementation
//
// The frame layout is fixed. Changing it means re-encrypting every object ever written,
// so it is specified in @vault/shared and shared verbatim with the browser.

const NONCE_BASE_BYTES = 8;

function nonceFor(base: Buffer, counter: number): Buffer {
  const nonce = Buffer.alloc(12);
  base.copy(nonce, 0, 0, NONCE_BASE_BYTES);
  nonce.writeUInt32BE(counter, NONCE_BASE_BYTES);
  return nonce;
}

export interface SealedBlob {
  blob: Buffer;
  header: KvblobHeader;
  /** Wrap this object's key under the org DEK, once its final key is known. */
  wrapFileKey: (dek: Buffer, objectKey: string) => string;
}

/**
 * Encrypt a buffer into the framed .kvblob format.
 *
 * Each frame is sealed independently under a nonce derived from `nonceBase ‖ counter`,
 * so a reader can decrypt incrementally instead of holding two copies of a 200 MB file.
 */
export function encryptToKvblob(
  plaintext: Buffer,
  fileKey: Buffer,
  meta: { mime: string; filename: string; sha256?: string },
): SealedBlob {
  const nonceBase = randomBytes(NONCE_BASE_BYTES);
  const header: KvblobHeader = {
    v: 1,
    alg: "AES-256-GCM",
    frame: KVBLOB_FRAME_BYTES,
    nonceBase: nonceBase.toString("base64"),
    size: plaintext.length,
    sha256: meta.sha256 ?? sha256Hex(plaintext),
    mime: meta.mime,
    filename: meta.filename,
  };

  const headerBuf = Buffer.from(JSON.stringify(header), "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(headerBuf.length);

  const frames: Buffer[] = [];
  // A zero-length file still produces one (empty) frame, so the reader's loop is
  // uniform and an empty object is distinguishable from a truncated one.
  const frameCount = Math.max(1, Math.ceil(plaintext.length / KVBLOB_FRAME_BYTES));
  for (let i = 0; i < frameCount; i += 1) {
    const slice = plaintext.subarray(i * KVBLOB_FRAME_BYTES, (i + 1) * KVBLOB_FRAME_BYTES);
    const cipher = createCipheriv("aes-256-gcm", fileKey, nonceFor(nonceBase, i));
    frames.push(cipher.update(slice), cipher.final(), cipher.getAuthTag());
  }

  return {
    blob: Buffer.concat([Buffer.from(KVBLOB_MAGIC, "ascii"), lenBuf, headerBuf, ...frames]),
    header,
    wrapFileKey: (dek, objectKey) => wrapFileKey(dek, fileKey, objectKey),
  };
}

export function readKvblobHeader(blob: Buffer): { header: KvblobHeader; bodyOffset: number } {
  const magic = blob.subarray(0, 8).toString("ascii");
  if (magic !== KVBLOB_MAGIC) {
    throw Object.assign(new Error("This object is not in the Knowledge Vault format"), {
      statusCode: 422,
    });
  }
  const headerLen = blob.readUInt32LE(8);
  const header = JSON.parse(blob.subarray(12, 12 + headerLen).toString("utf8")) as KvblobHeader;
  if (header.v !== 1) {
    throw Object.assign(new Error(`Unsupported object format version ${header.v}`), {
      statusCode: 422,
    });
  }
  return { header, bodyOffset: 12 + headerLen };
}

/**
 * Decrypt a .kvblob and verify its plaintext hash.
 *
 * A hash mismatch is raised as an error rather than returned as content: their storage
 * is now the weak link in a way ours was not, and a silently corrupted file should be a
 * clear failure, not a broken PDF (§9.4).
 */
export function decryptFromKvblob(blob: Buffer, fileKey: Buffer): { data: Buffer; header: KvblobHeader } {
  const { header, bodyOffset } = readKvblobHeader(blob);
  const nonceBase = Buffer.from(header.nonceBase, "base64");
  const frameCount = Math.max(1, Math.ceil(header.size / header.frame));

  const out: Buffer[] = [];
  let offset = bodyOffset;
  for (let i = 0; i < frameCount; i += 1) {
    const plainLen = Math.min(header.frame, Math.max(0, header.size - i * header.frame));
    const cipherLen = plainLen + KVBLOB_TAG_BYTES;
    if (offset + cipherLen > blob.length) {
      throw Object.assign(new Error("This object is truncated — the download did not complete"), {
        statusCode: 422,
      });
    }
    const body = blob.subarray(offset, offset + plainLen);
    const tag = blob.subarray(offset + plainLen, offset + cipherLen);
    const decipher = createDecipheriv("aes-256-gcm", fileKey, nonceFor(nonceBase, i));
    decipher.setAuthTag(tag);
    out.push(decipher.update(body), decipher.final());
    offset += cipherLen;
  }

  const data = Buffer.concat(out);
  if (!hashesMatch(sha256Hex(data), header.sha256)) {
    throw Object.assign(
      new Error(
        "This document failed its integrity check — the copy in your storage does not match " +
          "what was uploaded. It has not been shown, in case it has been altered.",
      ),
      { statusCode: 422 },
    );
  }
  return { data, header };
}

/** Decrypt using a wrapped key from a StorageObject row. */
export function decryptWithWrappedKey(
  blob: Buffer,
  dek: Buffer,
  wrappedKey: string,
  objectKey: string,
): Buffer {
  return decryptFromKvblob(blob, unwrapFileKey(dek, wrappedKey, objectKey)).data;
}
