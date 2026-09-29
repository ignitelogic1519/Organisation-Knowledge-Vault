import { z } from "zod";

// Organization-provided storage contracts — docs/structure.md §9.
//
// This module holds the parts the API and the browser must agree on exactly: the
// on-disk object format, the setup form's shape, and the views the storage screens
// render. The crypto itself is implemented twice — node:crypto on the server,
// Web Crypto in the browser — against the format described here.

// ── The .kvblob object format (§9.5) ─────────────────────────────────────────
//
//   magic "KVBLOB01" (8 bytes)
//   headerLength      (4 bytes, little-endian)
//   header JSON       (headerLength bytes, PLAINTEXT — carries no secrets)
//   frame 0, frame 1, …
//
// Each frame is `nonceBase(8) ‖ counter(4, big-endian)` as its 12-byte AES-GCM nonce,
// followed by ciphertext ‖ tag(16). Frames are sealed independently so a reader can
// decrypt incrementally.
//
// Framing is not optional. Web Crypto's AES-GCM has no streaming interface —
// `crypto.subtle.encrypt()` takes one buffer and returns one buffer — so an unframed
// 200 MB file would need 200 MB of memory twice and would crash a mid-range phone.
// Frame boundaries also line up with S3 multipart part sizes.
//
// THIS FORMAT IS FIXED. Changing it means re-encrypting every object already written.

export const KVBLOB_MAGIC = "KVBLOB01";
export const KVBLOB_FRAME_BYTES = 4 * 1024 * 1024;
export const KVBLOB_TAG_BYTES = 16;
export const KVBLOB_NONCE_BYTES = 12;

export interface KvblobHeader {
  /** Format version. Bumped only for a breaking change to the frame layout. */
  v: 1;
  alg: "AES-256-GCM";
  /** Plaintext bytes per frame (the final frame may be shorter). */
  frame: number;
  /** Base64 of the 8-byte nonce base; the per-frame counter completes the nonce. */
  nonceBase: string;
  /** Plaintext length, so a reader can size its output before decrypting. */
  size: number;
  /** SHA-256 of the plaintext, verified after decryption (§9.4). */
  sha256: string;
  mime: string;
  filename: string;
  /**
   * This object's file key, wrapped under the organization's data key (AES-256-GCM,
   * authenticated with `fk:<ok>`). Optional and additive: readers that predate it ignore
   * it. It makes every object self-describing, so the data key escrowed in `.main` opens
   * it with no help from our database (docs/structure.md §9.11).
   */
  wk?: string;
  /** The object key the wrapped key is bound to. Content-free: `objects/2026/09/<hex>.kvblob`. */
  ok?: string;
  /** Which version of the organization's data key wrapped `wk`. 1 until a key is rotated. */
  dv?: number;
}

/** Total encrypted length for a given plaintext size — used to sanity-check uploads. */
export function kvblobFrameCount(size: number, frameBytes = KVBLOB_FRAME_BYTES): number {
  return size === 0 ? 1 : Math.ceil(size / frameBytes);
}

/** Frame size for new objects on Google Drive: small frames make video start and seek fast. */
export const KVBLOB_STREAM_FRAME_BYTES = 256 * 1024;

/**
 * Stands in for the plaintext SHA-256 in a header the server lays out before the browser
 * has hashed the file. Same length as a real digest, so the header's length — and with
 * it the exact stored size — is known before a single byte is sent.
 */
export const KVBLOB_SHA256_PLACEHOLDER = "0".repeat(64);

/** UTF-8 length of a string, without depending on TextEncoder (not in every target). */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // a surrogate pair is one 4-byte code point
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/** Bytes before frame 0: magic, the 4-byte length, and the header JSON. */
export function kvblobHeaderBytes(headerJson: string): number {
  return KVBLOB_MAGIC.length + 4 + utf8Length(headerJson);
}

/** Exact stored length of a .kvblob: header, plaintext, and one 16-byte tag per frame. */
export function kvblobCipherBytes(size: number, headerBytes: number, frameBytes: number): number {
  return headerBytes + size + kvblobFrameCount(size, frameBytes) * KVBLOB_TAG_BYTES;
}

/**
 * The stored-byte range that holds a plaintext range [start, end] (inclusive) of a
 * .kvblob, and the frames it spans. What a streaming reader asks storage for when a video
 * player asks it for plaintext bytes (docs/structure.md §9.16).
 */
export function kvblobCipherRange(
  start: number,
  end: number,
  meta: { size: number; frameBytes: number; headerBytes: number },
): { firstFrame: number; lastFrame: number; cipherStart: number; cipherEnd: number } {
  const last = Math.min(end, meta.size - 1);
  const firstFrame = Math.floor(start / meta.frameBytes);
  const lastFrame = Math.floor(last / meta.frameBytes);
  const stride = meta.frameBytes + KVBLOB_TAG_BYTES;
  const lastLen = Math.min(meta.frameBytes, meta.size - lastFrame * meta.frameBytes);
  return {
    firstFrame,
    lastFrame,
    cipherStart: meta.headerBytes + firstFrame * stride,
    cipherEnd: meta.headerBytes + lastFrame * stride + lastLen + KVBLOB_TAG_BYTES - 1,
  };
}

// ── Limits (§9.12) ───────────────────────────────────────────────────────────

/** Maximum object size once bytes are off Postgres. */
export const MAX_OBJECT_BYTES = 200 * 1024 * 1024;

/** The legacy inline (Postgres) ceiling, still applied to orgs without storage. */
export const MAX_INLINE_BYTES = 10 * 1024 * 1024;

/**
 * Upload chunk size through the streaming gateway. Google's resumable uploads need every
 * chunk but the last to be a multiple of 256 KiB; 8 MiB keeps round trips few without
 * holding much in memory on either side.
 */
export const GATEWAY_CHUNK_BYTES = 8 * 1024 * 1024;

// ── Setup form (§9.3) ────────────────────────────────────────────────────────

export const STORAGE_ADAPTERS = [
  {
    key: "s3",
    /** What the organization sees in the dropdown. */
    label: "NAS",
    blurb:
      "Your own NAS, running Silo. Files go straight from your people's browsers to your " +
      "hardware — we never hold them, and you pay nobody for storage.",
  },
  {
    key: "gdrive",
    label: "Google Drive",
    blurb:
      "A folder in your Google Drive — a personal Google account or Google Workspace. " +
      "Knowledge Vault can only see the files it creates there, never the rest of your Drive.",
  },
] as const;

export type StorageAdapterKey = (typeof STORAGE_ADAPTERS)[number]["key"];

export const encryptionPostureSchema = z.enum(["ENCRYPTED", "PLAIN"]);
export type EncryptionPosture = z.infer<typeof encryptionPostureSchema>;

/** An S3-compatible backend (shown as NAS). */
export const s3StorageConfigSchema = z.object({
  adapter: z.literal("s3"),
  endpoint: z
    .string()
    .trim()
    .min(1, "Enter your storage address")
    .refine((v) => /^https?:\/\//i.test(v), "The address must start with https://")
    .refine(
      (v) => /^https:\/\//i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)/i.test(v),
      "Plain http:// is only allowed for localhost — use https:// so credentials are not sent in the clear",
    ),
  bucket: z
    .string()
    .trim()
    .min(1, "Enter the bucket name")
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*$/, "Bucket names are lowercase letters, digits, dots and dashes"),
  region: z.string().trim().max(40).default("us-east-1"),
  prefix: z.string().trim().max(200).default(""),
  forcePathStyle: z.boolean().default(true),
  accessKeyId: z.string().trim().min(1, "Enter the access key ID").max(200),
  secretAccessKey: z.string().trim().min(1, "Enter the secret access key").max(400),
  encryption: encryptionPostureSchema.default("ENCRYPTED"),
});
export type S3StorageConfigInput = z.infer<typeof s3StorageConfigSchema>;

/**
 * Google Drive (docs/structure.md §9.16). Nothing secret travels in this: the Google
 * sign-in has already happened, and `connectionId` names the sealed grant it produced,
 * which only the profile that signed in can use.
 */
export const gdriveStorageConfigSchema = z.object({
  adapter: z.literal("gdrive"),
  connectionId: z.string().uuid("Connect a Google account first"),
  encryption: encryptionPostureSchema.default("ENCRYPTED"),
  /**
   * The owner has read that files in a My Drive belong to that Google account — and
   * leave with it. Required for every My Drive connection.
   */
  acknowledgedPersonalOwnership: z.boolean().default(false),
});
export type GdriveStorageConfigInput = z.infer<typeof gdriveStorageConfigSchema>;

/**
 * Either backend. A config with no `adapter` is an S3 one — every client written before
 * Google Drive existed sends exactly that.
 */
export const storageConfigSchema = z.preprocess(
  (v) =>
    v && typeof v === "object" && !("adapter" in (v as Record<string, unknown>))
      ? { ...(v as Record<string, unknown>), adapter: "s3" }
      : v,
  z.discriminatedUnion("adapter", [s3StorageConfigSchema, gdriveStorageConfigSchema]),
);
export type StorageConfigInput = S3StorageConfigInput | GdriveStorageConfigInput;

/** Replacing credentials on a live backend — everything else stays as configured. */
export const storageCredentialsSchema = z.object({
  accessKeyId: z.string().trim().min(1, "Enter the access key ID").max(200),
  secretAccessKey: z.string().trim().min(1, "Enter the secret access key").max(400),
});

// ── Views ────────────────────────────────────────────────────────────────────

export type StorageStatus = "UNCONFIGURED" | "ACTIVE" | "DEGRADED";

/** Why storage is degraded, so the message names the actual problem (§9.8). */
export type StorageDegradedReason =
  | "AUTH_REVOKED"
  | "PERMISSION"
  | "ROOT_MISSING"
  | "QUOTA_FULL"
  | "UNREACHABLE"
  | "KEY";

export interface GdriveStorageDetails {
  accountEmail: string;
  /** Set when the account belongs to a Google Workspace domain. */
  hostedDomain: string | null;
  target: "MY_DRIVE";
  /** Opens the Knowledge Vault folder in Google Drive. */
  folderUrl: string | null;
  quotaLimitBytes: number | null;
  quotaUsedBytes: number | null;
}

/** What the streaming gateway has carried for this organization this month. */
export interface StreamUsageView {
  month: string;
  bytes: number;
  /** This organization's monthly allowance; streaming pauses when it is reached. */
  limitBytes: number;
}

export interface StorageView {
  configured: boolean;
  adapter: StorageAdapterKey | null;
  degradedReason?: StorageDegradedReason | null;
  gdrive?: GdriveStorageDetails | null;
  streamUsage?: StreamUsageView | null;
  status: StorageStatus;
  encryption: EncryptionPosture | null;
  endpoint: string | null;
  bucket: string | null;
  prefix: string | null;
  region: string | null;
  /** Never the secret itself — the form shows •••• and offers Replace (§9.3). */
  accessKeyIdMasked: string | null;
  lastCheckAt: string | null;
  lastError: string | null;
  degradedAt: string | null;
  objectCount: number;
  bytesUsed: number;
  /** Files still held in our Postgres, waiting to migrate (§9.12). */
  pendingMigration: number;
}

/** One step of the connection test, so a failure names the exact stage that broke. */
export interface StorageTestStep {
  step: "reach" | "folder" | "write" | "read" | "compare" | "delete" | "public" | "quota";
  label: string;
  ok: boolean;
  detail?: string;
}

export interface StorageTestResult {
  ok: boolean;
  steps: StorageTestStep[];
  /** Present when ok === false: the single sentence to show the operator. */
  error?: string;
  /** Concrete next action, e.g. the CORS JSON to paste. */
  hint?: string;
}

/**
 * How the bytes travel. `presigned`: straight between the browser and S3-compatible
 * storage. `gateway`: through Knowledge Vault's streaming gateway, because Google Drive
 * has no per-file signed links and its upload endpoint cannot be reached from a browser.
 */
export type ByteTransport = "presigned" | "gateway";

/** What the browser needs to upload one object into the org's storage. */
export interface UploadTicket {
  objectKey: string;
  transport: ByteTransport;
  /** presigned: the PUT URL. gateway: the gateway URL chunks are PUT to. */
  uploadUrl: string;
  /** Headers that MUST be sent with the PUT for the signature to verify. */
  headers: Record<string, string>;
  encrypted: boolean;
  /** Base64 AES-256 key for this object; absent when the posture is PLAIN. */
  fileKey?: string;
  nonceBase?: string;
  frameBytes: number;
  expiresInSeconds: number;
  /** The file key wrapped under the org's data key, written into the header (§9.11). */
  wrappedKey?: string;
  dekVersion?: number;
  /**
   * gateway only: the header JSON exactly as it must be written, with
   * KVBLOB_SHA256_PLACEHOLDER where the plaintext hash goes. Its length fixes the stored
   * size before anything is sent.
   */
  headerTemplate?: string;
  /** gateway only: the exact number of bytes the upload must deliver. */
  cipherBytes?: number;
  /** gateway only: sent as `Authorization: KVT <ticket>` with every chunk. */
  ticket?: string;
  /** gateway only: bytes per chunk (a multiple of 256 KiB). */
  chunkBytes?: number;
}

/** How a streaming reader finds frames without fetching the header first. */
export interface StreamFacts {
  frameBytes: number;
  headerBytes: number;
  cipherBytes: number;
  nonceBase: string;
}

/** What the browser needs to GET (and, when encrypted, decrypt) one object. */
export interface DownloadTicket {
  transport: ByteTransport;
  downloadUrl: string;
  encrypted: boolean;
  fileKey?: string;
  mime: string;
  filename: string;
  bytes: number;
  sha256: string;
  expiresInSeconds: number;
  /** gateway only: sent as `Authorization: KVT <ticket>`. */
  ticket?: string;
  /** gateway only, and only when the stored layout is on record. */
  stream?: StreamFacts;
}

/** A Google sign-in that has completed and is waiting to be used (§9.16). */
export interface GdriveConnectionView {
  connectionId: string;
  accountEmail: string;
  hostedDomain: string | null;
  /** True for a Google Workspace account. */
  isWorkspace: boolean;
  expiresAt: string;
}

export const gdriveAuthorizeSchema = z.object({
  /** "create": for an organization not created yet. "reconnect": for an existing one. */
  intent: z.enum(["create", "reconnect"]),
  orgId: z.string().uuid().optional(),
});
export type GdriveAuthorizeInput = z.infer<typeof gdriveAuthorizeSchema>;

export const uploadTicketSchema = z.object({
  filename: z.string().trim().min(1).max(300),
  mime: z.string().trim().min(1).max(200),
  bytes: z
    .number()
    .int()
    .positive("The file is empty")
    .max(MAX_OBJECT_BYTES, `Files are capped at ${Math.floor(MAX_OBJECT_BYTES / (1024 * 1024))} MB`),
});
export type UploadTicketInput = z.infer<typeof uploadTicketSchema>;

/** Handed back after the browser's direct PUT succeeds, to attach the object to a course. */
export const uploadCommitSchema = z.object({
  objectKey: z.string().trim().min(1).max(500),
  /** SHA-256 of the bytes actually stored (the ciphertext when encrypted), gateway only. */
  cipherSha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/, "Expected a SHA-256 hex digest")
    .optional(),
  sha256: z.string().trim().regex(/^[0-9a-f]{64}$/, "Expected a SHA-256 hex digest"),
  bytes: z.number().int().positive().max(MAX_OBJECT_BYTES),
  filename: z.string().trim().min(1).max(300),
  mime: z.string().trim().min(1).max(200),
});
export type UploadCommitInput = z.infer<typeof uploadCommitSchema>;

// One CORS rule, written out in both of the formats storage servers accept.
const CORS_METHODS = ["GET", "PUT", "HEAD"];
// Content-Range and Accept-Ranges let a browser read a video by range from the bucket.
const CORS_EXPOSE = ["ETag", "Content-Length", "Content-Type", "Content-Range", "Accept-Ranges"];
const CORS_MAX_AGE_SECONDS = 3000;

/**
 * The IAM/bucket policy we tell the organization to apply, and the CORS rules their
 * browser uploads need. Rendered into the setup screen so nobody has to invent them.
 * This is the JSON form that dashboards such as R2's take.
 */
export function corsRulesFor(webOrigin: string): string {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [webOrigin],
        AllowedMethods: CORS_METHODS,
        AllowedHeaders: ["*"],
        ExposeHeaders: CORS_EXPOSE,
        MaxAgeSeconds: CORS_MAX_AGE_SECONDS,
      },
    ],
    null,
    2,
  );
}

/**
 * The same rule as an S3 `CORSConfiguration` document — the only form `mc cors set` reads,
 * so it is what the setup guide applies to Silo.
 */
export function corsXmlFor(webOrigin: string): string {
  const origin = webOrigin.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    "<CORSConfiguration>",
    "  <CORSRule>",
    `    <AllowedOrigin>${origin}</AllowedOrigin>`,
    ...CORS_METHODS.map((m) => `    <AllowedMethod>${m}</AllowedMethod>`),
    "    <AllowedHeader>*</AllowedHeader>",
    ...CORS_EXPOSE.map((h) => `    <ExposeHeader>${h}</ExposeHeader>`),
    `    <MaxAgeSeconds>${CORS_MAX_AGE_SECONDS}</MaxAgeSeconds>`,
    "  </CORSRule>",
    "</CORSConfiguration>",
  ].join("\n");
}
