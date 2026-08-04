// Storage tests — run with `pnpm --filter @vault/api test:storage` (build first).
//
// These cover the three things that are expensive to get wrong and impossible to spot
// by reading:
//
//   1. The envelope crypto round-trips, and refuses tampered or misattributed data.
//   2. The .kvblob format is byte-identical between the browser (Web Crypto) and the
//      server (node:crypto). If those ever drift, documents uploaded from a browser
//      become unreadable on the server — the path exam marking and migration depend on.
//   3. Our SigV4 signing matches the reference signature AWS publishes. A wrong
//      signature fails against real storage with a baffling error, so this is checked
//      against a known-good vector rather than against itself.
//
// Node 22's globalThis.crypto IS the Web Crypto API, so the browser mirror below
// exercises the same primitives the browser will.

import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

process.env.STORAGE_KEK ??= randomBytes(32).toString("hex");

const {
  decryptFromKvblob,
  encryptToKvblob,
} = await import("../dist/storage/kvblob.js");
const {
  newDek,
  newFileKey,
  openCredential,
  sealCredential,
  unwrapDekFromPlatform,
  unwrapFileKey,
  wrapDekForPlatform,
  wrapFileKey,
} = await import("../dist/storage/secrets.js");
const { presign } = await import("../dist/storage/s3.js");

const FRAME = 4 * 1024 * 1024;
const TAG = 16;

// ── Credential vault ─────────────────────────────────────────────────────────

test("credentials round-trip and stay bound to their organization", () => {
  const sealed = sealCredential("org-1", "SECRETKEY123");
  assert.equal(openCredential("org-1", sealed), "SECRETKEY123");
  assert.ok(!sealed.includes("SECRETKEY123"), "the sealed form must not leak the plaintext");
  // A secret lifted from one org's row must not decrypt under another's.
  assert.throws(() => openCredential("org-2", sealed));
});

test("keys round-trip, and a file key is bound to its object", () => {
  const dek = newDek();
  assert.ok(unwrapDekFromPlatform("org-1", wrapDekForPlatform("org-1", dek)).equals(dek));

  const fileKey = newFileKey();
  const wrapped = wrapFileKey(dek, fileKey, "objects/2026/08/a.kvblob");
  assert.ok(unwrapFileKey(dek, wrapped, "objects/2026/08/a.kvblob").equals(fileKey));
  assert.throws(() => unwrapFileKey(dek, wrapped, "objects/2026/08/other.kvblob"));
});

// ── The object format ────────────────────────────────────────────────────────

test("kvblob round-trips across every frame boundary", () => {
  const sizes = [0, 1, 5000, FRAME - 1, FRAME, FRAME + 1, Math.floor(FRAME * 3.5)];
  for (const size of sizes) {
    const data = randomBytes(size);
    const key = newFileKey();
    const sealed = encryptToKvblob(data, key, { mime: "application/pdf", filename: "t.pdf" });
    assert.ok(
      decryptFromKvblob(sealed.blob, key).data.equals(data),
      `size ${size} did not round-trip`,
    );
  }
});

test("a tampered object is rejected rather than shown", () => {
  const data = randomBytes(100_000);
  const key = newFileKey();
  const blob = encryptToKvblob(data, key, { mime: "application/pdf", filename: "t.pdf" }).blob;

  const flipped = Buffer.from(blob);
  flipped[flipped.length - 30] ^= 0xff;
  assert.throws(() => decryptFromKvblob(flipped, key));

  assert.throws(() => decryptFromKvblob(blob, newFileKey()), "the wrong key must not decrypt");
});

// ── Browser ⇄ server interop ─────────────────────────────────────────────────

const enc = new TextEncoder();

function nonceFor(base, counter) {
  const nonce = new Uint8Array(new ArrayBuffer(12));
  nonce.set(base.subarray(0, 8), 0);
  new DataView(nonce.buffer).setUint32(8, counter, false);
  return nonce;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mirror of apps/web/src/lib/storage-crypto.ts `encryptFile`. */
async function browserEncrypt(plaintext, keyBytes, nonceBase) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const header = {
    v: 1,
    alg: "AES-256-GCM",
    frame: FRAME,
    nonceBase: Buffer.from(nonceBase).toString("base64"),
    size: plaintext.length,
    sha256: await sha256Hex(plaintext),
    mime: "application/pdf",
    filename: "browser.pdf",
  };
  const headerBytes = enc.encode(JSON.stringify(header));
  const lenBytes = new Uint8Array(4);
  new DataView(lenBytes.buffer).setUint32(0, headerBytes.length, true);

  const parts = [enc.encode("KVBLOB01"), lenBytes, headerBytes];
  const frames = Math.max(1, Math.ceil(plaintext.length / FRAME));
  for (let i = 0; i < frames; i += 1) {
    parts.push(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: nonceFor(nonceBase, i), tagLength: TAG * 8 },
          key,
          plaintext.slice(i * FRAME, (i + 1) * FRAME),
        ),
      ),
    );
  }
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

test("what a browser encrypts, the server can decrypt", async () => {
  for (const size of [10, 100_000, FRAME, FRAME * 2 + 12345]) {
    const data = new Uint8Array(randomBytes(size));
    const keyBytes = new Uint8Array(newFileKey());
    const blob = await browserEncrypt(data, keyBytes, new Uint8Array(randomBytes(8)));
    assert.ok(
      Buffer.from(data).equals(decryptFromKvblob(blob, Buffer.from(keyBytes)).data),
      `size ${size} did not survive browser → server`,
    );
  }
});

test("what the server encrypts, a browser can decrypt", async () => {
  for (const size of [50_000, FRAME + 999]) {
    const data = randomBytes(size);
    const fileKey = newFileKey();
    const blob = encryptToKvblob(data, fileKey, { mime: "application/pdf", filename: "s.pdf" }).blob;

    const raw = new Uint8Array(blob);
    const headerLen = new DataView(raw.buffer, raw.byteOffset).getUint32(8, true);
    const header = JSON.parse(new TextDecoder().decode(raw.subarray(12, 12 + headerLen)));
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(fileKey),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const nonceBase = new Uint8Array(Buffer.from(header.nonceBase, "base64"));
    const out = new Uint8Array(new ArrayBuffer(header.size));
    let offset = 12 + headerLen;
    let written = 0;
    const frames = Math.max(1, Math.ceil(header.size / header.frame));
    for (let i = 0; i < frames; i += 1) {
      const plainLen = Math.min(header.frame, Math.max(0, header.size - i * header.frame));
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonceFor(nonceBase, i), tagLength: TAG * 8 },
        key,
        raw.slice(offset, offset + plainLen + TAG),
      );
      out.set(new Uint8Array(decrypted), written);
      written += plainLen;
      offset += plainLen + TAG;
    }
    assert.ok(data.equals(Buffer.from(out)), `size ${size} did not survive server → browser`);
  }
});

// ── SigV4 ────────────────────────────────────────────────────────────────────

test("presigned URLs match the signature AWS publishes for its own example", () => {
  // From "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)".
  // Checking against an external known-good value is the point: a self-consistent
  // signature that real storage rejects would otherwise pass a test suite happily.
  const FIXED = new Date("2013-05-24T00:00:00Z");
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      return args.length ? new RealDate(...args) : new RealDate(FIXED);
    }
    static now() {
      return FIXED.getTime();
    }
  };
  try {
    const url = presign(
      {
        endpoint: "https://s3.amazonaws.com",
        bucket: "examplebucket",
        region: "us-east-1",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        forcePathStyle: false,
      },
      "GET",
      "test.txt",
      86400,
    );
    assert.match(url, /^https:\/\/examplebucket\.s3\.amazonaws\.com\/test\.txt\?/);
    assert.equal(
      /X-Amz-Signature=([0-9a-f]+)/.exec(url)?.[1],
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  } finally {
    globalThis.Date = RealDate;
  }
});

test("path-style addressing puts the bucket in the path, for MinIO", () => {
  const url = presign(
    {
      endpoint: "https://nas.example.com",
      bucket: "kv",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      forcePathStyle: true,
    },
    "PUT",
    "objects/2026/08/a.kvblob",
    300,
  );
  assert.ok(url.startsWith("https://nas.example.com/kv/objects/2026/08/a.kvblob?"));
  assert.match(url, /X-Amz-Expires=300/);
  assert.match(url, /X-Amz-Signature=[0-9a-f]{64}/);
});
