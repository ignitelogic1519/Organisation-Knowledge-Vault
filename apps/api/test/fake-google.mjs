// A fake Google — OAuth 2.0 and the part of the Drive API Knowledge Vault uses — for
// tests and for walking the whole Google Drive flow locally without a Google account
// (docs/structure.md §9.16).
//
// It behaves the way the real services do where it matters: PKCE is checked, refresh
// tokens can be revoked (and then fail with invalid_grant), resumable uploads answer
// 308 with a Range header, downloads honour byte ranges, every content write makes a new
// revision, and files carry private app properties.
//
//   node test/fake-google.mjs            # standalone on :4999 (FAKE_GOOGLE_PORT to change)
//
// Point the API at it with:
//   GOOGLE_AUTH_URL=http://localhost:4999/o/oauth2/v2/auth
//   GOOGLE_TOKEN_URL=http://localhost:4999/token
//   GOOGLE_REVOKE_URL=http://localhost:4999/revoke
//   GOOGLE_DRIVE_API=http://localhost:4999/drive/v3
//   GOOGLE_DRIVE_UPLOAD=http://localhost:4999/upload/drive/v3
//   GOOGLE_OAUTH_CLIENT_ID=fake-client  GOOGLE_OAUTH_CLIENT_SECRET=fake-secret
//
// Controls for a local walk-through (never part of the real API):
//   GET  /__fake/files        every file, with its size and whether it is in the trash
//   POST /__fake/revoke-all   as if the owner removed Knowledge Vault from their account

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const FOLDER = "application/vnd.google-apps.folder";

export async function startFakeGoogle({ port = 0, email = "owner@example.com", quotaLimit = 2 * 1024 ** 4 } = {}) {
  const state = {
    email,
    hostedDomain: null,
    quotaLimit,
    codes: new Map(), // code -> { challenge, redirectUri, state }
    refresh: new Map(), // refresh token -> { revoked }
    access: new Map(), // access token -> { refresh }
    files: new Map(), // id -> file
    sessions: new Map(), // sid -> { meta, total, received: Buffer[] , size }
    failNext: [], // queued failures: { match: RegExp, status, reason }
    counts: { downloads: 0, rangeDownloads: 0 },
  };

  const id = () => randomBytes(12).toString("base64url");
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const driveError = (res, status, reason, message = reason) =>
    json(res, status, { error: { code: status, message, errors: [{ reason, message }] } });
  const readBody = (req) =>
    new Promise((resolve) => {
      const parts = [];
      req.on("data", (c) => parts.push(c));
      req.on("end", () => resolve(Buffer.concat(parts)));
    });
  const usage = () => [...state.files.values()].reduce((n, f) => n + (f.content?.length ?? 0), 0);

  function newRevision(file, content) {
    const rev = `r${id()}`;
    file.revisions.set(rev, content);
    file.content = content;
    file.headRevisionId = rev;
    return rev;
  }
  function createFile(meta, content) {
    const fid = meta.id ?? id();
    if (state.files.has(fid)) return null;
    const file = {
      id: fid,
      name: meta.name ?? "untitled",
      mimeType: meta.mimeType ?? "application/octet-stream",
      parents: meta.parents ?? [],
      appProperties: { ...(meta.appProperties ?? {}) },
      trashed: false,
      revisions: new Map(),
      permissions: [{ type: "user", role: "owner" }],
      content: null,
      headRevisionId: undefined,
    };
    state.files.set(fid, file);
    if (content) newRevision(file, content);
    return file;
  }
  function view(file) {
    const out = {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      parents: file.parents,
      trashed: file.trashed,
      appProperties: file.appProperties,
      capabilities: { canAddChildren: file.mimeType === FOLDER, canTrash: true, canDelete: true },
    };
    if (file.content) {
      out.size = String(file.content.length);
      out.md5Checksum = createHash("md5").update(file.content).digest("hex");
      out.sha256Checksum = createHash("sha256").update(file.content).digest("hex");
      out.headRevisionId = file.headRevisionId;
    }
    return out;
  }
  function authorized(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (!m) return false;
    const a = state.access.get(m[1]);
    return !!a && !state.refresh.get(a.refresh)?.revoked;
  }
  function sendContent(req, res, content) {
    state.counts.downloads += 1;
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      state.counts.rangeDownloads += 1;
      const start = Number(range[1]);
      const end = range[2] === "" ? content.length - 1 : Math.min(Number(range[2]), content.length - 1);
      res.writeHead(206, {
        "content-type": "application/octet-stream",
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${content.length}`,
      });
      return res.end(content.subarray(start, end + 1));
    }
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(content.length) });
    res.end(content);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const base = `http://${req.headers.host}`;

    // Injected failures, for testing how the platform degrades.
    const fi = state.failNext.findIndex((f) => f.match.test(`${req.method} ${path}${url.search}`));
    if (fi >= 0) {
      const f = state.failNext.splice(fi, 1)[0];
      await readBody(req);
      if (f.reason === "invalid_grant") return json(res, 400, { error: "invalid_grant" });
      return driveError(res, f.status, f.reason);
    }

    // ── Walk-through controls ────────────────────────────────────────────
    if (path === "/__fake/files" && req.method === "GET") {
      return json(res, 200, {
        files: [...state.files.values()].map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          bytes: f.content ? f.content.length : 0,
          trashed: !!f.trashed,
          appProperties: f.appProperties,
        })),
      });
    }
    if (path === "/__fake/revoke-all" && req.method === "POST") {
      for (const r of state.refresh.values()) r.revoked = true;
      return json(res, 200, { revoked: state.refresh.size });
    }

    // ── OAuth ────────────────────────────────────────────────────────────
    if (path === "/o/oauth2/v2/auth") {
      const code = id();
      state.codes.set(code, {
        challenge: url.searchParams.get("code_challenge"),
        redirectUri: url.searchParams.get("redirect_uri"),
        scope: url.searchParams.get("scope"),
      });
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }
    if (path === "/token" && req.method === "POST") {
      const form = new URLSearchParams((await readBody(req)).toString());
      if (form.get("grant_type") === "authorization_code") {
        const c = state.codes.get(form.get("code"));
        state.codes.delete(form.get("code"));
        const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
        if (!c || c.challenge !== challenge || c.redirectUri !== form.get("redirect_uri")) {
          return json(res, 400, { error: "invalid_grant" });
        }
        const refresh = `rt-${id()}`;
        const access = `at-${id()}`;
        state.refresh.set(refresh, { revoked: false });
        state.access.set(access, { refresh });
        const claims = { email: state.email, email_verified: true, ...(state.hostedDomain ? { hd: state.hostedDomain } : {}) };
        const idToken = `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
        return json(res, 200, {
          access_token: access,
          refresh_token: refresh,
          expires_in: 3599,
          scope: c.scope,
          id_token: idToken,
          token_type: "Bearer",
        });
      }
      if (form.get("grant_type") === "refresh_token") {
        const r = state.refresh.get(form.get("refresh_token"));
        if (!r || r.revoked) return json(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        const access = `at-${id()}`;
        state.access.set(access, { refresh: form.get("refresh_token") });
        return json(res, 200, { access_token: access, expires_in: 3599, token_type: "Bearer" });
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }
    if (path === "/revoke" && req.method === "POST") {
      const form = new URLSearchParams((await readBody(req)).toString());
      const r = state.refresh.get(form.get("token"));
      if (r) r.revoked = true;
      return json(res, 200, {});
    }

    // ── Resumable session (no Authorization — the URI is the capability) ────
    const sess = /^\/upload-session\/([\w-]+)$/.exec(path);
    if (sess && req.method === "PUT") {
      const s = state.sessions.get(sess[1]);
      const body = await readBody(req);
      if (!s) return driveError(res, 404, "notFound");
      const cr = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+|\*)$/.exec(req.headers["content-range"] ?? "");
      if (!cr) return driveError(res, 400, "badContentRange");
      if (cr[1] !== undefined) {
        const start = Number(cr[1]);
        if (start !== s.size) return driveError(res, 400, "outOfOrder");
        s.received.push(body);
        s.size += body.length;
      }
      const total = cr[3] === "*" ? null : Number(cr[3]);
      if (total !== null && s.size === total) {
        const file = createFile(s.meta, Buffer.concat(s.received)) ?? state.files.get(s.meta.id);
        state.sessions.delete(sess[1]);
        return json(res, 200, view(file));
      }
      res.writeHead(308, s.size > 0 ? { range: `bytes=0-${s.size - 1}` } : {});
      return res.end();
    }

    // Everything below needs a live access token.
    if (!path.startsWith("/drive/v3") && !path.startsWith("/upload/drive/v3")) return driveError(res, 404, "notFound");
    if (!authorized(req)) return driveError(res, 401, "authError", "Invalid Credentials");

    // ── Uploads ──────────────────────────────────────────────────────────
    if (path === "/upload/drive/v3/files" && req.method === "POST") {
      const type = url.searchParams.get("uploadType");
      const body = await readBody(req);
      if (type === "resumable") {
        const meta = JSON.parse(body.toString() || "{}");
        if (meta.id && state.files.has(meta.id)) return driveError(res, 409, "fileIdInUse");
        const total = Number(req.headers["x-upload-content-length"] ?? 0);
        if (usage() + total > state.quotaLimit) return driveError(res, 403, "storageQuotaExceeded");
        const sid = id();
        state.sessions.set(sid, { meta, received: [], size: 0 });
        res.writeHead(200, { location: `${base}/upload-session/${sid}` });
        return res.end();
      }
      if (type === "multipart") {
        const boundary = /boundary=([^;]+)/.exec(req.headers["content-type"] ?? "")?.[1];
        const text = body.toString("latin1");
        const parts = text.split(`--${boundary}`).slice(1, -1);
        const meta = JSON.parse(parts[0].split("\r\n\r\n").slice(1).join("\r\n\r\n").trim());
        const raw = parts[1].slice(parts[1].indexOf("\r\n\r\n") + 4, parts[1].length - 2);
        const file = createFile(meta, Buffer.from(raw, "latin1"));
        if (!file) return driveError(res, 409, "fileIdInUse");
        return json(res, 200, view(file));
      }
      return driveError(res, 400, "badUploadType");
    }
    const media = /^\/upload\/drive\/v3\/files\/([\w-]+)$/.exec(path);
    if (media && req.method === "PATCH") {
      const file = state.files.get(media[1]);
      const body = await readBody(req);
      if (!file) return driveError(res, 404, "notFound");
      newRevision(file, body);
      return json(res, 200, view(file));
    }

    // ── Metadata ─────────────────────────────────────────────────────────
    if (path === "/drive/v3/about") {
      return json(res, 200, {
        user: { emailAddress: state.email },
        storageQuota: { limit: String(state.quotaLimit), usage: String(usage()) },
      });
    }
    if (path === "/drive/v3/files/generateIds") {
      const n = Number(url.searchParams.get("count") ?? 1);
      return json(res, 200, { ids: Array.from({ length: n }, () => `f${id()}`) });
    }
    if (path === "/drive/v3/files" && req.method === "POST") {
      const meta = JSON.parse((await readBody(req)).toString() || "{}");
      const file = createFile(meta, meta.mimeType === FOLDER ? null : Buffer.alloc(0));
      if (!file) return driveError(res, 409, "fileIdInUse");
      return json(res, 200, view(file));
    }
    if (path === "/drive/v3/files" && req.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const m = /appProperties has \{ key='(\w+)' and value='([^']*)' \}/.exec(q);
      const files = [...state.files.values()]
        .filter((f) => (m ? f.appProperties[m[1]] === m[2] : true))
        .map(view);
      return json(res, 200, { files });
    }
    const rev = /^\/drive\/v3\/files\/([\w-]+)\/revisions\/([\w-]+)$/.exec(path);
    if (rev) {
      const file = state.files.get(rev[1]);
      if (!file || !file.revisions.has(rev[2])) return driveError(res, 404, "notFound");
      if (req.method === "PATCH") {
        await readBody(req);
        return json(res, 200, { id: rev[2], keepForever: true });
      }
      if (url.searchParams.get("alt") === "media") return sendContent(req, res, file.revisions.get(rev[2]));
      return json(res, 200, { id: rev[2] });
    }
    const perm = /^\/drive\/v3\/files\/([\w-]+)\/permissions$/.exec(path);
    if (perm) {
      const file = state.files.get(perm[1]);
      if (!file) return driveError(res, 404, "notFound");
      return json(res, 200, { permissions: file.permissions });
    }
    const one = /^\/drive\/v3\/files\/([\w-]+)$/.exec(path);
    if (one) {
      const file = state.files.get(one[1]);
      if (req.method === "DELETE") {
        if (!file) return driveError(res, 404, "notFound");
        state.files.delete(one[1]);
        res.writeHead(204);
        return res.end();
      }
      if (!file) return driveError(res, 404, "notFound");
      if (req.method === "PATCH") {
        const patch = JSON.parse((await readBody(req)).toString() || "{}");
        if (patch.name) file.name = patch.name;
        if (typeof patch.trashed === "boolean") file.trashed = patch.trashed;
        if (patch.appProperties) Object.assign(file.appProperties, patch.appProperties);
        return json(res, 200, view(file));
      }
      if (url.searchParams.get("alt") === "media") return sendContent(req, res, file.content ?? Buffer.alloc(0));
      return json(res, 200, view(file));
    }
    return driveError(res, 404, "notFound");
  });

  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    state,
    env: {
      GOOGLE_AUTH_URL: `${url}/o/oauth2/v2/auth`,
      GOOGLE_TOKEN_URL: `${url}/token`,
      GOOGLE_REVOKE_URL: `${url}/revoke`,
      GOOGLE_DRIVE_API: `${url}/drive/v3`,
      GOOGLE_DRIVE_UPLOAD: `${url}/upload/drive/v3`,
      GOOGLE_OAUTH_CLIENT_ID: "fake-client",
      GOOGLE_OAUTH_CLIENT_SECRET: "fake-secret",
    },
    /** Replace one file's content in place, as someone using "Manage versions" would. */
    replaceContent(fileId, content) {
      const f = state.files.get(fileId);
      if (f) newRevision(f, content);
    },
    revokeAll() {
      for (const r of state.refresh.values()) r.revoked = true;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

if (process.argv[1] && process.argv[1].endsWith("fake-google.mjs")) {
  const g = await startFakeGoogle({ port: Number(process.env.FAKE_GOOGLE_PORT ?? 4999) });
  console.log(`fake Google listening on ${g.url}`);
  for (const [k, v] of Object.entries(g.env)) console.log(`${k}=${v}`);
}
