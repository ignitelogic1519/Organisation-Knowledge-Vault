import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { env } from "../env.js";
import { openValue, sealValue } from "./secrets.js";

// Google sign-in (OAuth 2.0 with PKCE) and a minimal Google Drive REST client
// (docs/structure.md §9.16).
//
// Why not googleapis. We need a dozen Drive calls and one token exchange; the SDK is
// tens of megabytes on a 512 MB free instance, and every call below is a plain,
// documented HTTPS request we can test against a fake.
//
// The only scope requested is `drive.file`: Google lets the app see files it created
// itself and nothing else in the account. If every secret we hold leaked, the rest of a
// customer's Drive would still be out of reach. It is also a non-sensitive scope, so the
// consent screen needs no Google review.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = ["openid", "email", DRIVE_SCOPE];

/**
 * The endpoints, overridable so tests and local walk-throughs can point the whole flow
 * at a fake Google. Never in production: there, a stray override would send customers'
 * Google grants somewhere other than Google, so it is ignored.
 */
function endpoints() {
  const override = (name: string) => (env.isProd ? "" : process.env[name]?.trim() || "");
  return {
    auth: override("GOOGLE_AUTH_URL") || "https://accounts.google.com/o/oauth2/v2/auth",
    token: override("GOOGLE_TOKEN_URL") || "https://oauth2.googleapis.com/token",
    revoke: override("GOOGLE_REVOKE_URL") || "https://oauth2.googleapis.com/revoke",
    drive: override("GOOGLE_DRIVE_API") || "https://www.googleapis.com/drive/v3",
    upload: override("GOOGLE_DRIVE_UPLOAD") || "https://www.googleapis.com/upload/drive/v3",
  };
}

/** Where this API is reachable from the internet. Render sets RENDER_EXTERNAL_URL itself. */
export function apiPublicUrl(): string {
  const raw =
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    `http://localhost:${env.port}`;
  return raw.replace(/\/+$/, "");
}

export function googleRedirectUri(): string {
  return `${apiPublicUrl()}/storage/google/callback`;
}

function clientId(): string {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
}
function clientSecret(): string {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
}

/** True when the operator has registered an OAuth client — the storage form checks this. */
export function googleConfigured(): boolean {
  return !!clientId() && !!clientSecret();
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * What kind of failure this is decides what happens next: a definitive one degrades the
 * organization at once, a transient one only after it has lasted (§9.8), and a rate limit
 * never degrades anything.
 */
export type DriveFailure =
  | "auth" // the grant is gone: revoked, expired, account deleted
  | "permission" // the grant exists but may not do this
  | "quota" // their Drive is full
  | "rate" // Google is throttling us — wait, never degrade
  | "download-quota" // one file downloaded too often; Google locks it for about a day
  | "not-found"
  | "transient" // 5xx, timeouts, network
  | "invalid"; // a request we built wrong

export class DriveError extends Error {
  constructor(
    message: string,
    readonly failure: DriveFailure,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "DriveError";
  }
  get definitive(): boolean {
    return this.failure === "auth" || this.failure === "permission" || this.failure === "quota";
  }
}

async function describe(res: Response): Promise<DriveError> {
  const text = await res.text().catch(() => "");
  let reason: string | undefined;
  let message: string | undefined;
  try {
    const body = JSON.parse(text) as {
      error?: { message?: string; errors?: { reason?: string }[] } | string;
      error_description?: string;
    };
    if (typeof body.error === "object") {
      reason = body.error.errors?.[0]?.reason;
      message = body.error.message;
    } else if (typeof body.error === "string") {
      reason = body.error;
      message = body.error_description;
    }
  } catch {
    // not JSON — keep the status
  }
  const s = res.status;
  if (s === 401 || reason === "invalid_grant" || reason === "authError") {
    return new DriveError(
      "Knowledge Vault's access to this Google account has been removed or has expired. An owner can reconnect it in storage settings.",
      "auth",
      s,
      reason,
    );
  }
  if (reason === "storageQuotaExceeded" || reason === "quotaExceeded") {
    return new DriveError("This Google Drive is full. Free some space in the account, or add storage to it.", "quota", s, reason);
  }
  if (reason === "downloadQuotaExceeded") {
    return new DriveError(
      "Google has temporarily limited downloads of this file because it was opened very often. It usually lifts within a day.",
      "download-quota",
      s,
      reason,
    );
  }
  if (s === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new DriveError("Google is limiting requests right now. Try again in a moment.", "rate", s, reason);
  }
  if (s === 404) {
    return new DriveError("That file is not in the Google Drive any more.", "not-found", s, reason);
  }
  if (s === 403) {
    return new DriveError(
      message
        ? `Google refused: ${message}`
        : "Google refused this request — the connected account may no longer have access to the Knowledge Vault folder.",
      "permission",
      s,
      reason,
    );
  }
  if (s >= 500) {
    return new DriveError("Google Drive is having trouble right now. Try again shortly.", "transient", s, reason);
  }
  return new DriveError(message ? `Google Drive: ${message}` : `Google Drive returned HTTP ${s}`, "invalid", s, reason);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── OAuth: the sign-in round trip ────────────────────────────────────────────

const STATE_AAD = "gdrive-oauth-state";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  /** The profile that started the sign-in: the grant belongs to them and no one else. */
  profileId: string;
  intent: "create" | "reconnect";
  orgId?: string;
  verifier: string;
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/**
 * The URL that starts the Google sign-in. The state carries the PKCE verifier and who
 * asked, sealed under the platform key — so it cannot be read, forged or replayed after
 * ten minutes, and nothing has to be stored until Google answers.
 */
export function buildAuthorizeUrl(input: Omit<OAuthState, "verifier" | "exp">): string {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state: OAuthState = { ...input, verifier, exp: Date.now() + STATE_TTL_MS };
  const sealed = Buffer.from(sealValue(STATE_AAD, JSON.stringify(state)), "base64").toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    // A refresh token, so access continues after this sign-in — and asked for every
    // time, because Google only returns one on a fresh consent.
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "false",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: sealed,
  });
  return `${endpoints().auth}?${params.toString()}`;
}

export function readState(raw: string): OAuthState {
  let state: OAuthState;
  try {
    state = JSON.parse(
      openValue(STATE_AAD, Buffer.from(raw, "base64url").toString("base64")),
    ) as OAuthState;
  } catch {
    throw Object.assign(new Error("This sign-in link is not valid. Start again from Knowledge Vault."), {
      statusCode: 400,
    });
  }
  if (!state.exp || state.exp < Date.now()) {
    throw Object.assign(new Error("This sign-in took too long and expired. Start again from Knowledge Vault."), {
      statusCode: 400,
    });
  }
  return state;
}

export interface GoogleGrant {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  email: string;
  hostedDomain: string | null;
}

/** The claims of an ID token we received directly from Google's token endpoint over TLS. */
function idTokenClaims(idToken: string): Record<string, unknown> {
  const part = idToken.split(".")[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Exchange the authorization code for tokens, and check Google granted what we need. */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleGrant> {
  let res: Response;
  try {
    res = await fetch(endpoints().token, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: googleRedirectUri(),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new DriveError("Could not reach Google to finish signing in. Try again.", "transient", 0);
  }
  if (!res.ok) throw await describe(res);
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
  };
  // Google's consent screen lets people untick individual permissions. Without Drive
  // access there is nothing to connect, so say so rather than failing later.
  const granted = (body.scope ?? "").split(/\s+/);
  if (!granted.includes(DRIVE_SCOPE)) {
    if (body.refresh_token) await revokeToken(body.refresh_token).catch(() => {});
    throw Object.assign(
      new Error(
        "Google did not grant access to Drive files. Sign in again and leave the Google Drive permission ticked.",
      ),
      { statusCode: 400 },
    );
  }
  if (!body.refresh_token || !body.access_token) {
    throw Object.assign(
      new Error(
        "Google did not return lasting access. Remove Knowledge Vault from your Google account's third-party access and connect again.",
      ),
      { statusCode: 400 },
    );
  }
  const claims = idTokenClaims(body.id_token ?? "");
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!email) {
    await revokeToken(body.refresh_token).catch(() => {});
    throw Object.assign(new Error("Google did not say which account signed in. Try again."), { statusCode: 400 });
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    email,
    hostedDomain: typeof claims.hd === "string" ? claims.hd : null,
  };
}

/** Tell Google to forget a grant. Used on disconnect, replacement and abandoned sign-ins. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(endpoints().revoke, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  });
}

// ── Access tokens: memory only, refreshed early, one refresh in flight ──────

const tokens = new Map<string, { token: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string>>();
/** Refresh this long before Google's expiry, so a long stream never meets a dead token. */
const EARLY_MS = 5 * 60 * 1000;

export function primeAccessToken(key: string, token: string, expiresAt: number): void {
  tokens.set(key, { token, expiresAt });
}

export function dropAccessToken(key: string): void {
  tokens.delete(key);
}

/**
 * A valid access token for one grant. `key` names the grant (an organization, or a
 * pending connection); `refreshToken` is only called when a refresh is actually needed,
 * so the sealed secret is opened as rarely as possible.
 */
export async function accessToken(key: string, refreshToken: () => string): Promise<string> {
  const cached = tokens.get(key);
  if (cached && cached.expiresAt - EARLY_MS > Date.now()) return cached.token;
  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    let res: Response;
    try {
      res = await fetch(endpoints().token, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId(),
          client_secret: clientSecret(),
          refresh_token: refreshToken(),
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new DriveError("Could not reach Google to renew access.", "transient", 0);
    }
    if (!res.ok) throw await describe(res);
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    const expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
    tokens.set(key, { token: body.access_token, expiresAt });
    return body.access_token;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

// ── Drive ────────────────────────────────────────────────────────────────────

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  md5Checksum?: string;
  sha256Checksum?: string;
  headRevisionId?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
  capabilities?: { canAddChildren?: boolean; canTrash?: boolean; canDelete?: boolean };
  webViewLink?: string;
}

export interface DriveFileMeta {
  id?: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  description?: string;
  copyRequiresWriterPermission?: boolean;
  writersCanShare?: boolean;
}

type Body = string | Buffer | Uint8Array | ReadableStream<Uint8Array> | undefined;

/**
 * A Drive client for one grant. `token` returns a live access token; `invalidate` drops
 * the cached one when Google refuses it mid-hour (revoked, password changed), so the next
 * call refreshes — and a revoked grant then surfaces as a definitive "auth" failure.
 */
export class Drive {
  constructor(
    private readonly token: () => Promise<string>,
    private readonly invalidate: () => void,
  ) {}

  private async request(
    method: string,
    url: string,
    opts: {
      headers?: Record<string, string>;
      body?: Body;
      /** Safe to repeat: retried on rate limits and 5xx with backoff. */
      idempotent?: boolean;
      timeoutMs?: number;
      /** Statuses handed back to the caller instead of thrown. */
      pass?: number[];
    } = {},
  ): Promise<Response> {
    const attempts = opts.idempotent ? 4 : 1;
    let refreshed = false;
    for (let attempt = 0; ; attempt += 1) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: { authorization: `Bearer ${await this.token()}`, ...opts.headers },
          body: opts.body as RequestInit["body"],
          // Streaming request bodies need half-duplex under undici.
          ...(opts.body instanceof ReadableStream ? { duplex: "half" } : {}),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        } as RequestInit);
      } catch (err) {
        if (err instanceof DriveError) throw err;
        if (attempt + 1 < attempts) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new DriveError("Could not reach Google Drive.", "transient", 0);
      }
      if (res.ok || opts.pass?.includes(res.status)) return res;
      if (res.status === 401 && !refreshed) {
        // A token Google no longer accepts: drop it and try once with a fresh one.
        refreshed = true;
        this.invalidate();
        attempt -= 1;
        await res.body?.cancel().catch(() => {});
        continue;
      }
      const err = await describe(res);
      if ((err.failure === "rate" || err.failure === "transient") && attempt + 1 < attempts) {
        await sleep(backoff(attempt));
        continue;
      }
      throw err;
    }
  }

  /** The account and its storage quota. The cheapest call that proves the grant works. */
  async about(): Promise<{ email: string | null; limit: number | null; usage: number }> {
    const res = await this.request(
      "GET",
      `${endpoints().drive}/about?fields=${encodeURIComponent("user(emailAddress),storageQuota(limit,usage)")}`,
      { idempotent: true },
    );
    const body = (await res.json()) as {
      user?: { emailAddress?: string };
      storageQuota?: { limit?: string; usage?: string };
    };
    return {
      email: body.user?.emailAddress ?? null,
      // No limit means unlimited (some Workspace plans).
      limit: body.storageQuota?.limit ? Number(body.storageQuota.limit) : null,
      usage: Number(body.storageQuota?.usage ?? 0),
    };
  }

  async generateIds(count: number): Promise<string[]> {
    const res = await this.request(
      "GET",
      `${endpoints().drive}/files/generateIds?count=${count}&space=drive&type=files`,
      { idempotent: true },
    );
    return ((await res.json()) as { ids: string[] }).ids;
  }

  async getFile(id: string, fields: string): Promise<DriveFile> {
    const res = await this.request(
      "GET",
      `${endpoints().drive}/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`,
      { idempotent: true },
    );
    return (await res.json()) as DriveFile;
  }

  /** Create a folder or a metadata-only file. */
  async createMetadata(meta: DriveFileMeta): Promise<DriveFile> {
    const res = await this.request(
      "POST",
      `${endpoints().drive}/files?supportsAllDrives=true&fields=id,name,headRevisionId`,
      { headers: { "content-type": "application/json" }, body: JSON.stringify(meta), pass: [409] },
    );
    if (res.status === 409 && meta.id) return this.getFile(meta.id, "id,name,headRevisionId");
    return (await res.json()) as DriveFile;
  }

  async updateMetadata(id: string, patch: Partial<DriveFileMeta> & { trashed?: boolean }): Promise<DriveFile> {
    const res = await this.request(
      "PATCH",
      `${endpoints().drive}/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,trashed,name`,
      { headers: { "content-type": "application/json" }, body: JSON.stringify(patch), idempotent: true },
    );
    return (await res.json()) as DriveFile;
  }

  /** Create a small file in one request (probe, health file, map). */
  async createSmall(meta: DriveFileMeta, content: Buffer, mime: string): Promise<DriveFile> {
    const boundary = `kv${randomBytes(12).toString("hex")}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
          `--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await this.request(
      "POST",
      `${endpoints().upload}/files?uploadType=multipart&supportsAllDrives=true&fields=id,headRevisionId,size`,
      { headers: { "content-type": `multipart/related; boundary=${boundary}` }, body, pass: [409] },
    );
    if (res.status === 409 && meta.id) return this.getFile(meta.id, "id,headRevisionId,size");
    return (await res.json()) as DriveFile;
  }

  /** Replace a small file's content in one request. */
  async updateSmall(id: string, content: Buffer, mime: string): Promise<DriveFile> {
    const res = await this.request(
      "PATCH",
      `${endpoints().upload}/files/${encodeURIComponent(id)}?uploadType=media&supportsAllDrives=true&fields=id,headRevisionId,size`,
      { headers: { "content-type": mime }, body: content, idempotent: true },
    );
    return (await res.json()) as DriveFile;
  }

  /**
   * Open a resumable upload session. The returned URI is a capability for exactly this
   * one file: it is sealed before it is stored, and never sent to a browser.
   */
  async startResumable(meta: DriveFileMeta, totalBytes: number, mime: string): Promise<string> {
    const res = await this.request(
      "POST",
      `${endpoints().upload}/files?uploadType=resumable&supportsAllDrives=true&fields=id,size,headRevisionId,sha256Checksum,md5Checksum`,
      {
        headers: {
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": mime,
          "x-upload-content-length": String(totalBytes),
        },
        body: JSON.stringify(meta),
      },
    );
    const location = res.headers.get("location");
    await res.body?.cancel().catch(() => {});
    if (!location) throw new DriveError("Google did not open an upload session.", "transient", res.status);
    return location;
  }

  /** Download a file, or one revision of it, optionally one byte range of it. */
  async download(
    id: string,
    opts: { revisionId?: string | null; range?: { start: number; end: number } | null } = {},
  ): Promise<Response> {
    const base = opts.revisionId
      ? `${endpoints().drive}/files/${encodeURIComponent(id)}/revisions/${encodeURIComponent(opts.revisionId)}?alt=media`
      : `${endpoints().drive}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
    return this.request("GET", base, {
      headers: {
        // Speed over compression: identity, so byte ranges mean what they say.
        "accept-encoding": "identity",
        ...(opts.range ? { range: `bytes=${opts.range.start}-${opts.range.end}` } : {}),
      },
      idempotent: true,
      timeoutMs: 60_000,
    });
  }

  /** Keep the revision we wrote even after someone uploads a new version over it. */
  async keepRevisionForever(id: string, revisionId: string): Promise<void> {
    const res = await this.request(
      "PATCH",
      `${endpoints().drive}/files/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}`,
      { headers: { "content-type": "application/json" }, body: JSON.stringify({ keepForever: true }), idempotent: true },
    );
    await res.body?.cancel().catch(() => {});
  }

  /** Delete permanently. A file that is already gone counts as deleted. */
  async deleteFile(id: string): Promise<void> {
    const res = await this.request(
      "DELETE",
      `${endpoints().drive}/files/${encodeURIComponent(id)}?supportsAllDrives=true`,
      { idempotent: true, pass: [404] },
    );
    await res.body?.cancel().catch(() => {});
  }

  /** Files carrying one app property value. The properties are private to this app. */
  async listByProperty(
    key: string,
    value: string,
    pageToken?: string,
  ): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    const q = `appProperties has { key='${key}' and value='${value.replace(/'/g, "\\'")}' }`;
    const params = new URLSearchParams({
      q,
      spaces: "drive",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields: "nextPageToken,files(id,name,size,trashed,headRevisionId,mimeType,appProperties)",
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await this.request("GET", `${endpoints().drive}/files?${params.toString()}`, { idempotent: true });
    return (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
  }

  async permissions(id: string): Promise<{ type: string; role: string }[]> {
    const res = await this.request(
      "GET",
      `${endpoints().drive}/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true&fields=permissions(type,role)`,
      { idempotent: true },
    );
    return ((await res.json()) as { permissions?: { type: string; role: string }[] }).permissions ?? [];
  }
}

function backoff(attempt: number): number {
  // Google's guidance: truncated exponential backoff with jitter.
  return Math.min(8_000, 400 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

// ── Resumable session: chunk transfer (no Authorization — the URI is the capability) ──

export interface ChunkResult {
  /** Bytes Google has confirmed, counted from 0. */
  confirmed: number;
  /** Present when the upload is complete. */
  file?: DriveFile;
}

function confirmedFrom(res: Response): number {
  // "bytes=0-8388607" — the last byte Google holds, inclusive.
  const range = res.headers.get("range");
  const m = range ? /bytes=0-(\d+)/.exec(range) : null;
  return m ? Number(m[1]) + 1 : 0;
}

/** Send one chunk of a resumable upload. The body may be a stream; nothing is buffered. */
export async function putChunk(
  sessionUri: string,
  body: Readable | Buffer,
  start: number,
  length: number,
  total: number,
): Promise<ChunkResult> {
  let res: Response;
  try {
    res = await fetch(sessionUri, {
      method: "PUT",
      headers: {
        "content-length": String(length),
        "content-range": length === 0 ? `bytes */${total}` : `bytes ${start}-${start + length - 1}/${total}`,
      },
      body: body instanceof Readable ? (Readable.toWeb(body) as ReadableStream<Uint8Array>) : body,
      ...(body instanceof Readable ? { duplex: "half" } : {}),
      signal: AbortSignal.timeout(120_000),
    } as RequestInit);
  } catch {
    throw new DriveError("The upload to Google Drive was interrupted.", "transient", 0);
  }
  if (res.status === 308) {
    await res.body?.cancel().catch(() => {});
    return { confirmed: confirmedFrom(res) };
  }
  if (res.status === 200 || res.status === 201) {
    return { confirmed: total, file: (await res.json()) as DriveFile };
  }
  if (res.status === 404 || res.status === 410) {
    await res.body?.cancel().catch(() => {});
    throw new DriveError("This upload session has expired. Start the upload again.", "not-found", res.status);
  }
  throw await describe(res);
}

/** Ask Google how much of an interrupted upload it holds. */
export async function querySession(sessionUri: string, total: number): Promise<ChunkResult> {
  return putChunk(sessionUri, Buffer.alloc(0), 0, 0, total);
}
