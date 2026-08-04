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
}

/** Total encrypted length for a given plaintext size — used to sanity-check uploads. */
export function kvblobFrameCount(size: number, frameBytes = KVBLOB_FRAME_BYTES): number {
  return size === 0 ? 1 : Math.ceil(size / frameBytes);
}

// ── Limits (§9.12) ───────────────────────────────────────────────────────────

/** Maximum object size once bytes are off Postgres. */
export const MAX_OBJECT_BYTES = 200 * 1024 * 1024;

/** The legacy inline (Postgres) ceiling, still applied to orgs without storage. */
export const MAX_INLINE_BYTES = 10 * 1024 * 1024;

// ── Setup form (§9.3) ────────────────────────────────────────────────────────

export const STORAGE_ADAPTERS = [
  {
    key: "s3",
    /** What the organization sees in the dropdown. */
    label: "NAS",
    blurb:
      "Your own NAS, running MinIO. Files go straight from your people's browsers to your " +
      "hardware — we never hold them, and you pay nobody for storage.",
  },
] as const;

export type StorageAdapterKey = (typeof STORAGE_ADAPTERS)[number]["key"];

export const encryptionPostureSchema = z.enum(["ENCRYPTED", "PLAIN"]);
export type EncryptionPosture = z.infer<typeof encryptionPostureSchema>;

export const storageConfigSchema = z.object({
  adapter: z.literal("s3").default("s3"),
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
export type StorageConfigInput = z.infer<typeof storageConfigSchema>;

/** Replacing credentials on a live backend — everything else stays as configured. */
export const storageCredentialsSchema = z.object({
  accessKeyId: z.string().trim().min(1, "Enter the access key ID").max(200),
  secretAccessKey: z.string().trim().min(1, "Enter the secret access key").max(400),
});

// ── Views ────────────────────────────────────────────────────────────────────

export type StorageStatus = "UNCONFIGURED" | "ACTIVE" | "DEGRADED";

export interface StorageView {
  configured: boolean;
  adapter: StorageAdapterKey | null;
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
  step: "reach" | "write" | "read" | "compare" | "delete" | "public";
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

/** What the browser needs to PUT one object straight into the org's storage. */
export interface UploadTicket {
  objectKey: string;
  uploadUrl: string;
  /** Headers that MUST be sent with the PUT for the signature to verify. */
  headers: Record<string, string>;
  encrypted: boolean;
  /** Base64 AES-256 key for this object; absent when the posture is PLAIN. */
  fileKey?: string;
  nonceBase?: string;
  frameBytes: number;
  expiresInSeconds: number;
}

/** What the browser needs to GET and decrypt one object. */
export interface DownloadTicket {
  downloadUrl: string;
  encrypted: boolean;
  fileKey?: string;
  mime: string;
  filename: string;
  bytes: number;
  sha256: string;
  expiresInSeconds: number;
}

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
  sha256: z.string().trim().regex(/^[0-9a-f]{64}$/, "Expected a SHA-256 hex digest"),
  bytes: z.number().int().positive().max(MAX_OBJECT_BYTES),
  filename: z.string().trim().min(1).max(300),
  mime: z.string().trim().min(1).max(200),
});
export type UploadCommitInput = z.infer<typeof uploadCommitSchema>;

/**
 * The IAM/bucket policy we tell the organization to apply, and the CORS rules their
 * browser uploads need. Rendered into the setup screen so nobody has to invent them.
 */
export function corsRulesFor(webOrigin: string): string {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [webOrigin],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
        MaxAgeSeconds: 3000,
      },
    ],
    null,
    2,
  );
}
