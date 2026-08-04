import { createHash, createHmac } from "node:crypto";

// A minimal S3 client: AWS Signature Version 4 over fetch(), with presigning.
//
// Why not the AWS SDK. We need six operations (PUT, GET, HEAD, DELETE, list, presign)
// and the SDK would add tens of megabytes to a deploy that runs on a 512 MB free
// instance. SigV4 is a deterministic, fully specified algorithm and the connection
// test exercises every part of it against the customer's real endpoint before their
// backend is ever activated.
//
// Works against anything S3-compatible: MinIO (what we recommend on a NAS), Amazon S3,
// Cloudflare R2, Google Cloud Storage in interoperability mode, Wasabi, Backblaze B2
// and DigitalOcean Spaces.

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

const SERVICE = "s3";
const UNSIGNED = "UNSIGNED-PAYLOAD";

/** RFC 3986 escaping. S3 signing needs this, and encodeURIComponent leaves !'()* alone. */
function uriEscape(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Escape an object key path segment-by-segment — slashes stay slashes. */
function escapeKey(key: string): string {
  return key.split("/").map(uriEscape).join("/");
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function lowerKeyed(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = String(v);
  return out;
}

function amzDate(now: Date): { stamp: string; date: string } {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { stamp, date: stamp.slice(0, 8) };
}

function signingKey(secret: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), SERVICE), "aws4_request");
}

/** The bucket-aware base URL and the path prefix the key hangs off. */
function endpointFor(cfg: S3Config): { origin: string; host: string; basePath: string } {
  const url = new URL(cfg.endpoint.replace(/\/+$/, ""));
  if (cfg.forcePathStyle) {
    return { origin: url.origin, host: url.host, basePath: `/${cfg.bucket}` };
  }
  const host = `${cfg.bucket}.${url.host}`;
  return { origin: `${url.protocol}//${host}`, host, basePath: "" };
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Sign a request with SigV4 in the Authorization header (used for our own server-side
 * calls). `payloadHash` must be the hex SHA-256 of the body, or UNSIGNED-PAYLOAD.
 */
function signRequest(
  cfg: S3Config,
  method: string,
  key: string,
  payloadHash: string,
  extraHeaders: Record<string, string> = {},
  query: Record<string, string> = {},
): SignedRequest {
  const { origin, host, basePath } = endpointFor(cfg);
  const { stamp, date } = amzDate(new Date());
  const canonicalUri = `${basePath}/${escapeKey(key)}`.replace(/\/+/g, "/");

  // Canonical headers are lowercase-keyed and sorted; normalise once so the string we
  // sign and the headers we send can never drift apart.
  const headers = lowerKeyed({
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
    ...extraHeaders,
  });
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((h) => `${h}:${headers[h]!.trim()}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEscape(k)}=${uriEscape(query[k]!)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${date}/${cfg.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    stamp,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(cfg.secretAccessKey, date, cfg.region), stringToSign).toString("hex");

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const qs = canonicalQuery ? `?${canonicalQuery}` : "";
  return { url: `${origin}${canonicalUri}${qs}`, headers };
}

/**
 * A presigned URL: the signature travels in the query string, so a browser can use it
 * with no credentials of its own.
 *
 * These are bearer tokens — anyone holding one can reach that single object until it
 * expires. Short lifetimes, one object each, minted per view, never logged or stored
 * (docs/structure.md §9.5).
 */
export function presign(
  cfg: S3Config,
  method: "GET" | "PUT",
  key: string,
  expiresInSeconds: number,
  signedHeaders: Record<string, string> = {},
): string {
  const { origin, host, basePath } = endpointFor(cfg);
  const { stamp, date } = amzDate(new Date());
  const canonicalUri = `${basePath}/${escapeKey(key)}`.replace(/\/+/g, "/");
  const scope = `${date}/${cfg.region}/${SERVICE}/aws4_request`;

  const headers = lowerKeyed({ host, ...signedHeaders });
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((h) => `${h}:${headers[h]!.trim()}\n`).join("");
  const signedHeaderList = sortedHeaderKeys.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaderList,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEscape(k)}=${uriEscape(query[k]!)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    UNSIGNED,
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = hmac(signingKey(cfg.secretAccessKey, date, cfg.region), stringToSign).toString("hex");

  return `${origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class S3Error extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "S3Error";
  }
}

/** Turn an S3 XML error body into something an operator can act on. */
function describe(status: number, body: string): S3Error {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1];
  const message = /<Message>([^<]+)<\/Message>/.exec(body)?.[1];
  const friendly: Record<string, string> = {
    InvalidAccessKeyId: "The access key ID is not recognised by your storage.",
    SignatureDoesNotMatch:
      "The secret access key is wrong, or your storage server's clock is out of sync with ours.",
    NoSuchBucket: "That bucket does not exist on your storage — create it first.",
    AccessDenied: "The access key exists but is not allowed to do this on that bucket.",
    RequestTimeTooSkewed:
      "Your storage server's clock is too far from real time — fix its NTP settings.",
    NoSuchKey: "That object is no longer in your storage.",
  };
  return new S3Error(
    (code && friendly[code]) || message || `Storage returned HTTP ${status}`,
    status,
    code,
  );
}

async function call(
  cfg: S3Config,
  method: string,
  key: string,
  body?: Buffer,
  extraHeaders: Record<string, string> = {},
  query: Record<string, string> = {},
): Promise<Response> {
  const payloadHash = body ? sha256Hex(body) : sha256Hex("");
  const signed = signRequest(cfg, method, key, payloadHash, extraHeaders, query);
  let res: Response;
  try {
    res = await fetch(signed.url, {
      method,
      headers: signed.headers,
      // Buffer is a Uint8Array; undici accepts it directly as the request body.
      body: body ? new Uint8Array(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    // No HTTP response at all: DNS, TLS, refused connection, or a timeout. This is the
    // failure a NAS that is not actually reachable from the internet produces.
    const reason = err instanceof Error ? err.message : String(err);
    throw new S3Error(
      `Could not reach your storage at ${cfg.endpoint} — ${reason}. Check the address is ` +
        "publicly reachable over HTTPS and that its certificate is valid.",
      0,
      "Unreachable",
    );
  }
  if (!res.ok && res.status !== 404) {
    throw describe(res.status, await res.text().catch(() => ""));
  }
  return res;
}

// ── Operations ───────────────────────────────────────────────────────────────

export async function putObject(
  cfg: S3Config,
  key: string,
  body: Buffer,
  mime = "application/octet-stream",
): Promise<void> {
  const res = await call(cfg, "PUT", key, body, { "content-type": mime });
  if (!res.ok) throw describe(res.status, await res.text().catch(() => ""));
}

export async function getObject(cfg: S3Config, key: string): Promise<Buffer> {
  const res = await call(cfg, "GET", key);
  if (res.status === 404) throw new S3Error("That object is not in your storage", 404, "NoSuchKey");
  return Buffer.from(await res.arrayBuffer());
}

export async function headObject(
  cfg: S3Config,
  key: string,
): Promise<{ exists: boolean; bytes: number }> {
  const res = await call(cfg, "HEAD", key);
  if (res.status === 404) return { exists: false, bytes: 0 };
  return { exists: true, bytes: Number(res.headers.get("content-length") ?? 0) };
}

export async function deleteObject(cfg: S3Config, key: string): Promise<void> {
  await call(cfg, "DELETE", key);
}

/** List keys under a prefix. Paginated; returns totals for the usage panel. */
export async function listObjects(
  cfg: S3Config,
  prefix: string,
  maxKeys = 1000,
): Promise<{ keys: string[]; bytes: number; truncated: boolean }> {
  const res = await call(cfg, "GET", "", undefined, {}, {
    "list-type": "2",
    prefix,
    "max-keys": String(maxKeys),
  });
  const xml = await res.text();
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!);
  const bytes = [...xml.matchAll(/<Size>(\d+)<\/Size>/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  return { keys, bytes, truncated: /<IsTruncated>true<\/IsTruncated>/.test(xml) };
}

/**
 * Is this bucket readable without credentials? A public bucket makes every permission
 * rule in the platform decorative, so activation refuses one (§9.4).
 *
 * Probes the object anonymously: a 200 means anyone on the internet can read it.
 */
export async function isPubliclyReadable(cfg: S3Config, key: string): Promise<boolean> {
  const { origin, basePath } = endpointFor(cfg);
  const url = `${origin}${basePath}/${escapeKey(key)}`.replace(/([^:])\/+/g, "$1/");
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    // Unreachable anonymously is the safe answer — it is not public.
    return false;
  }
}
