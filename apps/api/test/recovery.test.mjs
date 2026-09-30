// The recovery promise, tested (docs/structure.md §9.11): an organization's storage, its
// .main file and its Supreme password open every encrypted document with no help from
// Knowledge Vault — using recovery-tool/kv-recover.mjs, a separate program with no
// dependencies, exactly as a customer would run it.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

process.env.STORAGE_KEK ??= randomBytes(32).toString("hex");
const { sealContainer } = await import("../dist/vault-files/container.js");
const { encryptToKvblob } = await import("../dist/storage/kvblob.js");
const { newDek, newFileKey, wrapFileKey } = await import("../dist/storage/secrets.js");

const TOOL = new URL("../../../recovery-tool/kv-recover.mjs", import.meta.url).pathname;

test("the recovery tool opens encrypted documents from storage + .main + password alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "kv-recover-"));
  const drive = join(dir, "Knowledge Vault — Acme", "objects", "2026-09");
  mkdirSync(drive, { recursive: true });
  const dek = newDek();

  // A document whose key travels in its own header (every object written from now on)…
  const a = Buffer.from("Arm lockout procedure — step one: isolate the arm.");
  const keyA = newFileKey();
  const objA = "objects/2026/09/aaaa.kvblob";
  const blobA = encryptToKvblob(a, keyA, {
    mime: "text/plain", filename: "Lockout.txt", frameBytes: 262144,
    wrappedKey: wrapFileKey(dek, keyA, objA), objectKey: objA,
  }).blob;
  writeFileSync(join(drive, "aaaa.kvblob"), blobA);

  // …and one written before that, whose key is only in the .main index.
  const b = randomBytes(700_000);
  const keyB = newFileKey();
  const objB = "objects/2026/08/bbbb.kvblob";
  writeFileSync(join(drive, "bbbb.kvblob"), encryptToKvblob(b, keyB, { mime: "video/mp4", filename: "Induction.mp4" }).blob);

  const main = sealContainer("Supreme-Passw0rd!", { scope: "main", orgNumber: 100 }, {
    org: { name: "Acme" },
    storage: {
      adapter: "gdrive", encryption: "ENCRYPTED", dataKey: dek.toString("base64"), dataKeyVersion: 1, location: {},
      objects: [{ objectKey: objB, remoteId: "x", wrappedKey: wrapFileKey(dek, keyB, objB), filename: "Induction.mp4", mime: "video/mp4", sha256: "", bytes: b.length, encrypted: true }],
    },
  });
  writeFileSync(join(dir, "Acme.main"), main);

  const out = join(dir, "recovered");
  execFileSync(process.execPath, [TOOL, "--main", join(dir, "Acme.main"), "--in", join(dir, "Knowledge Vault — Acme"), "--out", out], {
    env: { ...process.env, KV_SUPREME_PASSWORD: "Supreme-Passw0rd!" },
    stdio: "pipe",
  });
  assert.deepEqual(readdirSync(out).sort(), ["Induction.mp4", "Lockout.txt"]);
  assert.ok(readFileSync(join(out, "Lockout.txt")).equals(a));
  assert.ok(readFileSync(join(out, "Induction.mp4")).equals(b));
});

test("the recovery tool refuses the wrong password and writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "kv-recover-"));
  writeFileSync(join(dir, "x.main"), sealContainer("right", { scope: "main", orgNumber: 1 }, { storage: null }));
  mkdirSync(join(dir, "in"));
  assert.throws(() =>
    execFileSync(process.execPath, [TOOL, "--main", join(dir, "x.main"), "--in", join(dir, "in"), "--out", join(dir, "out")], {
      env: { ...process.env, KV_SUPREME_PASSWORD: "wrong" },
      stdio: "pipe",
    }),
  );
});
