#!/usr/bin/env node
// Knowledge Vault recovery tool (docs/structure.md §9.11).
//
// Opens an organization's encrypted documents with nothing but:
//   · the files from its storage (a Google Drive folder downloaded as-is, or a NAS bucket),
//   · its .main file,
//   · its Supreme password.
// No Knowledge Vault server, account or network connection is involved. Node 18+ only —
// no dependencies — so it can be read end to end before it is trusted.
//
//   node kv-recover.mjs --main "Acme.main" --in ./downloaded-folder --out ./recovered
//
// The Supreme password is read from the terminal (or KV_SUPREME_PASSWORD). Readable
// (non-encrypted) documents need no tool at all: they are ordinary files already.

import { createDecipheriv, createHash, scryptSync } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { createInterface } from "node:readline";

const CONTAINER_MAGIC = "KVAULT01";
const BLOB_MAGIC = "KVBLOB01";
const TAG = 16;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function askPassword() {
  if (process.env.KV_SUPREME_PASSWORD) return process.env.KV_SUPREME_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide what is typed.
  rl._writeToOutput = (s) => rl.output.write(s.includes("Supreme password") ? s : "");
  return new Promise((resolve) => rl.question("Supreme password: ", (a) => { rl.close(); process.stdout.write("\n"); resolve(a); }));
}

/** .main: [magic 8][header length 4 LE][header JSON][iv 12][tag 16][ciphertext] */
function openMain(file, password) {
  if (file.subarray(0, 8).toString("ascii") !== CONTAINER_MAGIC) die("That is not a Knowledge Vault .main file.");
  const headerLen = file.readUInt32LE(8);
  const header = JSON.parse(file.subarray(12, 12 + headerLen).toString("utf8"));
  if (header.scope !== "main") die("That is a .bkp file. Recovery needs the organization's .main file.");
  const at = 12 + headerLen;
  const key = scryptSync(password, Buffer.from(header.saltB64, "base64"), 32, { N: 16384, r: 8, p: 1 });
  const d = createDecipheriv("aes-256-gcm", key, file.subarray(at, at + 12));
  d.setAuthTag(file.subarray(at + 12, at + 28));
  try {
    return JSON.parse(Buffer.concat([d.update(file.subarray(at + 28)), d.final()]).toString("utf8"));
  } catch {
    die("Wrong Supreme password, or the .main file is damaged.");
  }
}

/** A sealed value: base64 of iv(12) ‖ tag(16) ‖ ciphertext, authenticated with `aad`. */
function openSealed(key, sealed, aad) {
  const raw = Buffer.from(sealed, "base64");
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  if (aad) d.setAAD(Buffer.from(aad, "utf8"));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}

function nonce(base, i) {
  const n = Buffer.alloc(12);
  base.copy(n, 0, 0, 8);
  n.writeUInt32BE(i, 8);
  return n;
}

function decryptBlob(blob, fileKey) {
  const headerLen = blob.readUInt32LE(8);
  const h = JSON.parse(blob.subarray(12, 12 + headerLen).toString("utf8"));
  const base = Buffer.from(h.nonceBase, "base64");
  const frames = Math.max(1, Math.ceil(h.size / h.frame));
  const out = [];
  let at = 12 + headerLen;
  for (let i = 0; i < frames; i += 1) {
    const len = Math.min(h.frame, Math.max(0, h.size - i * h.frame));
    const d = createDecipheriv("aes-256-gcm", fileKey, nonce(base, i));
    d.setAuthTag(blob.subarray(at + len, at + len + TAG));
    out.push(d.update(blob.subarray(at, at + len)), d.final());
    at += len + TAG;
  }
  const data = Buffer.concat(out);
  if (createHash("sha256").update(data).digest("hex") !== h.sha256) {
    throw new Error("failed its integrity check — the copy in storage has been altered");
  }
  return { data, header: h };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function freeName(dir, name) {
  const clean = name.replace(/[\u0000-\u001f/\\:*?"<>|]/g, "_") || "document";
  let candidate = join(dir, clean);
  const ext = extname(clean);
  for (let i = 2; existsSync(candidate); i += 1) {
    candidate = join(dir, `${clean.slice(0, clean.length - ext.length)} (${i})${ext}`);
  }
  return candidate;
}

const mainPath = arg("main");
const inDir = arg("in");
const outDir = arg("out") ?? "./recovered";
if (!mainPath || !inDir) {
  die('Usage: node kv-recover.mjs --main "Organization.main" --in <storage folder> [--out <folder>]');
}

const payload = openMain(readFileSync(mainPath), await askPassword());
const storage = payload.storage;
if (!storage) die("This .main file has no storage section — it was exported before storage escrow existed, or the organization kept its documents on Knowledge Vault's own storage.");
if (!storage.dataKey) {
  console.log("This organization stored readable files. Nothing needs decrypting — the files in its storage are the documents.");
  process.exit(0);
}
const dek = Buffer.from(storage.dataKey, "base64");
// Objects written before keys travelled in headers are found through the .main index.
const byName = new Map(storage.objects.map((o) => [basename(o.objectKey), o]));

mkdirSync(outDir, { recursive: true });
let opened = 0;
let failed = 0;
for (const path of walk(inDir)) {
  const blob = readFileSync(path);
  if (blob.subarray(0, 8).toString("ascii") !== BLOB_MAGIC) continue;
  const headerLen = blob.readUInt32LE(8);
  const h = JSON.parse(blob.subarray(12, 12 + headerLen).toString("utf8"));
  const indexed = byName.get(basename(path));
  const wrapped = h.wk ?? indexed?.wrappedKey;
  const objectKey = h.ok ?? indexed?.objectKey;
  if (!wrapped || !objectKey) {
    console.warn(`  ? ${basename(path)}: no key for it in the file or in .main — skipped`);
    failed += 1;
    continue;
  }
  try {
    const fileKey = openSealed(dek, wrapped, `fk:${objectKey}`);
    const { data, header } = decryptBlob(blob, fileKey);
    const target = freeName(outDir, header.filename || indexed?.filename || basename(path, ".kvblob"));
    writeFileSync(target, data);
    console.log(`  ✓ ${basename(target)}`);
    opened += 1;
  } catch (err) {
    console.warn(`  ✗ ${basename(path)}: ${err.message}`);
    failed += 1;
  }
}
console.log(`\n${opened} document(s) recovered into ${outDir}${failed ? `; ${failed} could not be opened` : ""}.`);
