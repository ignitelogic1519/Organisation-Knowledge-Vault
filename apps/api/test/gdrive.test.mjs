// Google Drive storage tests — run with `pnpm --filter @vault/api test` (build first).
//
// Everything here runs against test/fake-google.mjs, an in-process stand-in for Google's
// OAuth and Drive APIs that behaves the way the real ones do where it matters: PKCE,
// revocable refresh tokens, 308 resumable sessions, byte ranges, revisions.
//
// They cover the parts that are expensive to get wrong and hard to see by reading:
//
//   1. Streaming tickets: signed, scoped, expiring, and not forgeable.
//   2. The range arithmetic a streaming reader uses to find frames — checked against
//      real encrypted objects, frame by frame.
//   3. The header template: the server fixes a stored object's exact size before the
//      browser has hashed the file, so its byte count must be exact, Unicode included.
//   4. The Drive client and the OAuth round trip, including a revoked grant surfacing as
//      a definitive "auth" failure — the thing that degrades an organization.
//   5. The connection test, end to end.

import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { startFakeGoogle } from "./fake-google.mjs";

process.env.STORAGE_KEK ??= randomBytes(32).toString("hex");
const google = await startFakeGoogle({ email: "owner@example.com" });
Object.assign(process.env, google.env, { API_PUBLIC_URL: "http://api.test" });
after(() => google.close());

const shared = await import("@vault/shared");
const { signTicket, readTicket } = await import("../dist/storage/tickets.js");
const { encryptToKvblob } = await import("../dist/storage/kvblob.js");
const g = await import("../dist/storage/google.js");
const { testDrive } = await import("../dist/storage/gdrive-store.js");
const { parseRange } = await import("../dist/storage/gateway.js");

// ── 1 · Tickets ───────────────────────────────────────────────────────────────

test("a ticket round-trips and keeps its claims", () => {
  const claims = { o: "org", s: "obj", m: "r", e: Math.floor(Date.now() / 1000) + 60, g: 3, p: "prof", d: 0 };
  assert.deepEqual(readTicket(signTicket(claims)), claims);
});

test("an expired ticket is refused", () => {
  const t = signTicket({ o: "org", s: "obj", m: "r", e: Math.floor(Date.now() / 1000) - 1, g: 0, p: "p" });
  assert.throws(() => readTicket(t), /expired/);
});

test("a ticket whose claims were edited is refused", () => {
  const t = signTicket({ o: "org", s: "obj", m: "r", e: Math.floor(Date.now() / 1000) + 60, g: 0, p: "p" });
  const [prefix, , sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ o: "org", s: "OTHER", m: "r", e: 9999999999, g: 0, p: "p" })).toString("base64url");
  assert.throws(() => readTicket(`${prefix}.${forged}.${sig}`), /not valid/);
  assert.throws(() => readTicket("nonsense"), /not valid/);
  assert.throws(() => readTicket(undefined), /needs a ticket/);
});

// ── 2 · Range arithmetic against real objects ─────────────────────────────────

function nonceFor(base, i) {
  const n = Buffer.alloc(12);
  base.copy(n, 0, 0, 8);
  n.writeUInt32BE(i, 8);
  return n;
}

test("a plaintext range maps to exactly the frames that hold it", () => {
  const frame = shared.KVBLOB_STREAM_FRAME_BYTES;
  for (const size of [1, frame - 1, frame, frame + 1, 3 * frame + 12345]) {
    const plain = randomBytes(size);
    const key = randomBytes(32);
    const sealed = encryptToKvblob(plain, key, { mime: "video/mp4", filename: "clip.mp4", frameBytes: frame });
    const meta = { size, frameBytes: frame, headerBytes: sealed.headerBytes };
    assert.equal(sealed.blob.length, shared.kvblobCipherBytes(size, sealed.headerBytes, frame));
    const base = Buffer.from(sealed.header.nonceBase, "base64");
    for (let k = 0; k < 20; k += 1) {
      const start = Math.floor(Math.random() * size);
      const end = Math.min(size - 1, start + Math.floor(Math.random() * 2 * frame));
      const r = shared.kvblobCipherRange(start, end, meta);
      const slice = sealed.blob.subarray(r.cipherStart, r.cipherEnd + 1);
      const parts = [];
      let at = 0;
      for (let f = r.firstFrame; f <= r.lastFrame; f += 1) {
        const len = Math.min(frame, size - f * frame);
        const d = createDecipheriv("aes-256-gcm", key, nonceFor(base, f));
        d.setAuthTag(slice.subarray(at + len, at + len + 16));
        parts.push(d.update(slice.subarray(at, at + len)), d.final());
        at += len + 16;
      }
      assert.equal(at, slice.length, "the range holds whole frames and nothing else");
      const got = Buffer.concat(parts).subarray(start - r.firstFrame * frame, end - r.firstFrame * frame + 1);
      assert.ok(got.equals(plain.subarray(start, end + 1)));
    }
  }
});

// ── 3 · The header template fixes the stored size ─────────────────────────────

test("the header's byte count is exact, whatever the file is called", () => {
  for (const filename of ["plain.pdf", "Überprüfung — été 2026.pdf", "报告📄.pdf", "a\ud800b.pdf".replace("\ud800", "�")]) {
    const header = {
      v: 1, alg: "AES-256-GCM", frame: 262144, nonceBase: "AAAAAAAAAAA=", size: 10,
      sha256: shared.KVBLOB_SHA256_PLACEHOLDER, mime: "application/pdf", filename,
      wk: "d2s=", ok: "objects/2026/09/x.kvblob", dv: 1,
    };
    const json = JSON.stringify(header);
    assert.equal(shared.kvblobHeaderBytes(json), 8 + 4 + Buffer.byteLength(json, "utf8"));
    const filled = json.replace(shared.KVBLOB_SHA256_PLACEHOLDER, createHash("sha256").update("x").digest("hex"));
    assert.equal(Buffer.byteLength(filled), Buffer.byteLength(json), "filling the hash never changes the length");
  }
});

test("byte ranges are parsed the way HTTP defines them", () => {
  assert.deepEqual(parseRange("bytes=0-", 100), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseRange("bytes=90-500", 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(parseRange("bytes=100-", 100), "invalid");
  assert.equal(parseRange("bytes=5-1", 100), "invalid");
  assert.equal(parseRange("bytes=0-1,5-6", 100), "invalid");
  assert.equal(parseRange(undefined, 100), null);
});

// ── 4 · OAuth and the Drive client ────────────────────────────────────────────

async function signIn() {
  const url = g.buildAuthorizeUrl({ profileId: "profile-1", intent: "create" });
  assert.ok(url.includes("scope=openid+email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file"));
  assert.ok(url.includes("code_challenge_method=S256"));
  const res = await fetch(url, { redirect: "manual" });
  const back = new URL(res.headers.get("location"));
  assert.equal(back.origin + back.pathname, "http://api.test/storage/google/callback");
  const state = g.readState(back.searchParams.get("state"));
  assert.equal(state.profileId, "profile-1");
  return g.exchangeCode(back.searchParams.get("code"), state.verifier);
}

test("the sign-in round trip yields a lasting grant for the right account", async () => {
  const grant = await signIn();
  assert.equal(grant.email, "owner@example.com");
  assert.ok(grant.refreshToken.startsWith("rt-"));
});

test("a tampered sign-in state is refused", () => {
  assert.throws(() => g.readState("bm90LWEtc3RhdGU"), /not valid/);
});

test("the sign-in returns to the site that started it, sealed in the state", () => {
  const url = new URL(
    g.buildAuthorizeUrl({ profileId: "p", intent: "create", returnTo: "https://kv.example.app" }),
  );
  assert.equal(g.readState(url.searchParams.get("state")).returnTo, "https://kv.example.app");
});

test("only a real web origin is accepted as the place to return to", () => {
  // WEB_ORIGIN, when set, is the answer — CORS admits nothing else.
  assert.equal(g.signInReturnOrigin("https://other.example", "https://kv.example.app/"), "https://kv.example.app");
  // Otherwise the browser's Origin header: https anywhere, http only on the developer's machine.
  assert.equal(g.signInReturnOrigin("https://kv.example.app"), "https://kv.example.app");
  assert.equal(g.signInReturnOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(g.signInReturnOrigin("http://kv.example.app"), undefined);
  assert.equal(g.signInReturnOrigin("javascript:alert(1)"), undefined);
  assert.equal(g.signInReturnOrigin("null"), undefined);
  assert.equal(g.signInReturnOrigin(undefined), undefined);
});

function driveFor(refreshToken, key = `t:${randomBytes(4).toString("hex")}`) {
  return new g.Drive(() => g.accessToken(key, () => refreshToken), () => g.dropAccessToken(key));
}

test("a resumable upload in two chunks lands whole, and reads back by range", async () => {
  const grant = await signIn();
  const drive = driveFor(grant.refreshToken);
  const [id] = await drive.generateIds(1);
  const body = randomBytes(512 * 1024 + 7);
  const uri = await drive.startResumable({ id, name: "x.kvblob", appProperties: { kvOrg: "100" } }, body.length, "application/octet-stream");
  const first = await g.putChunk(uri, body.subarray(0, 256 * 1024), 0, 256 * 1024, body.length);
  assert.equal(first.confirmed, 256 * 1024);
  assert.equal(first.file, undefined);
  const status = await g.querySession(uri, body.length);
  assert.equal(status.confirmed, 256 * 1024, "an interrupted upload resumes from what Google holds");
  const rest = body.subarray(256 * 1024);
  const done = await g.putChunk(uri, rest, 256 * 1024, rest.length, body.length);
  assert.equal(done.file.id, id);
  const meta = await drive.getFile(id, "id,size,sha256Checksum,headRevisionId");
  assert.equal(Number(meta.size), body.length);
  assert.equal(meta.sha256Checksum, createHash("sha256").update(body).digest("hex"));
  await drive.keepRevisionForever(id, meta.headRevisionId);
  const part = Buffer.from(await (await drive.download(id, { revisionId: meta.headRevisionId, range: { start: 1000, end: 1999 } })).arrayBuffer());
  assert.ok(part.equals(body.subarray(1000, 2000)));
});

test("a pinned revision keeps serving what we wrote after someone replaces the file", async () => {
  const grant = await signIn();
  const drive = driveFor(grant.refreshToken);
  const original = Buffer.from("the original document");
  const f = await drive.createSmall({ name: "doc.bin" }, original, "application/octet-stream");
  const pinned = (await drive.getFile(f.id, "headRevisionId")).headRevisionId;
  google.replaceContent(f.id, Buffer.from("something else entirely"));
  const head = Buffer.from(await (await drive.download(f.id)).arrayBuffer());
  const kept = Buffer.from(await (await drive.download(f.id, { revisionId: pinned })).arrayBuffer());
  assert.notDeepEqual(head, original);
  assert.ok(kept.equals(original));
});

test("a revoked grant is a definitive auth failure, not a transient one", async () => {
  const grant = await signIn();
  const drive = driveFor(grant.refreshToken);
  await drive.about();
  await g.revokeToken(grant.refreshToken);
  await assert.rejects(drive.about(), (err) => err instanceof g.DriveError && err.failure === "auth" && err.definitive);
});

test("rate limits are retried, and never reported as definitive", async () => {
  const grant = await signIn();
  const drive = driveFor(grant.refreshToken);
  google.state.failNext.push({ match: /GET \/drive\/v3\/about/, status: 429, reason: "rateLimitExceeded" });
  const about = await drive.about();
  assert.equal(about.email, "owner@example.com", "the retry succeeded");
});

// ── 5 · The connection test ───────────────────────────────────────────────────

test("the connection test creates the folder once, and passes on every rerun", async () => {
  const grant = await signIn();
  const drive = driveFor(grant.refreshToken);
  const first = await testDrive(drive, {}, { folderName: "Knowledge Vault" });
  assert.equal(first.result.ok, true, JSON.stringify(first.result));
  assert.deepEqual(first.result.steps.map((s) => s.step), ["reach", "folder", "write", "read", "compare", "public", "quota"]);
  assert.ok(first.ids.rootId && first.ids.objectsId && first.ids.healthFileId);
  const before = google.state.files.size;
  const again = await testDrive(drive, first.ids, { folderName: "Knowledge Vault" });
  assert.equal(again.result.ok, true);
  assert.equal(google.state.files.size, before, "a rerun creates nothing new — no probes piling up");
});

test("a folder shared with anyone is refused", async () => {
  const grant = await signIn();
  const drive = driveFor(grant.refreshToken);
  const first = await testDrive(drive, {}, { folderName: "Knowledge Vault" });
  google.state.files.get(first.ids.rootId).permissions.push({ type: "anyone", role: "reader" });
  const again = await testDrive(drive, first.ids, { folderName: "Knowledge Vault" });
  assert.equal(again.result.ok, false);
  assert.equal(again.result.steps.at(-1).step, "public");
});

test("a trashed folder is put back by the connection test", async () => {
  const grant = await signIn();
  const drive = driveFor(grant.refreshToken);
  const first = await testDrive(drive, {}, { folderName: "Knowledge Vault" });
  google.state.files.get(first.ids.rootId).trashed = true;
  const again = await testDrive(drive, first.ids, { folderName: "Knowledge Vault" });
  assert.equal(again.result.ok, true);
  assert.equal(google.state.files.get(first.ids.rootId).trashed, false);
});
