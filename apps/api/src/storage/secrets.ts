import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Credential vault + envelope encryption for organization-provided storage
// (docs/structure.md §9.5).
//
// Two separate jobs live here:
//
//  1. SEALING THEIR CREDENTIALS. The access key and secret they give us are encrypted
//     with STORAGE_KEK, which lives in the environment and never in the database. A
//     database dump on its own must not be enough to reach a customer's storage.
//
//  2. ENVELOPE ENCRYPTION OF CONTENT. Per-file key (FK) → per-org data key (DEK) →
//     wrapped by the platform KEK. The Supreme-wrapped copy of the DEK is computed at
//     .main export time from the live password and is deliberately never persisted:
//     storing it would turn every database dump into an offline attack on a
//     human-chosen password, which is exactly what keeping the KEK outside the
//     database is meant to prevent.

const KEK_ENV = "STORAGE_KEK";

/**
 * The platform key-encryption key. A 32-byte secret supplied as hex or base64.
 *
 * In production it is required — refusing to boot is far better than silently
 * encrypting every customer credential under a key that vanishes on the next deploy.
 * In development an absent key derives a stable one from JWT_SECRET so a local stack
 * works out of the box; anything sealed that way is worthless in production, which is
 * the intent.
 */
function platformKek(): Buffer {
  const raw = process.env[KEK_ENV]?.trim();
  if (raw) {
    const buf = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, "hex")
      : Buffer.from(raw, "base64");
    if (buf.length !== 32) {
      throw new Error(`${KEK_ENV} must be 32 bytes (64 hex chars or base64) — got ${buf.length}`);
    }
    return buf;
  }
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    throw new Error(
      `${KEK_ENV} is not set. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return createHash("sha256").update(`dev-storage-kek:${process.env.JWT_SECRET ?? "local"}`).digest();
}

/** True when a usable KEK is configured — the storage setup form checks this first. */
export function storageKekConfigured(): boolean {
  try {
    platformKek();
    return true;
  } catch {
    return false;
  }
}

// ── Generic AES-256-GCM sealing ──────────────────────────────────────────────
// Layout: iv(12) ‖ tag(16) ‖ ciphertext, base64. Used for credentials and for
// wrapping the DEK.

function seal(key: Buffer, plaintext: Buffer, aad?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function open(key: Buffer, sealed: string, aad?: string): Buffer {
  const raw = Buffer.from(sealed, "base64");
  if (raw.length < 28) throw new Error("Sealed value is truncated");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
}

/**
 * Seal one of the organization's storage credentials.
 *
 * `orgId` is bound in as additional authenticated data, so a sealed secret lifted from
 * one organization's row cannot be pasted into another's and still decrypt.
 */
export function sealCredential(orgId: string, value: string): string {
  return seal(platformKek(), Buffer.from(value, "utf8"), `cred:${orgId}`);
}

export function openCredential(orgId: string, sealed: string): string {
  try {
    return open(platformKek(), sealed, `cred:${orgId}`).toString("utf8");
  } catch {
    throw Object.assign(
      new Error(
        "This organization's storage credentials could not be decrypted — the platform " +
          `key (${KEK_ENV}) has changed or is missing. Re-enter the credentials in storage settings.`,
      ),
      { statusCode: 503 },
    );
  }
}

// ── The organization's data key ──────────────────────────────────────────────

/** A fresh 256-bit data key for an organization. Generated once, at activation. */
export function newDek(): Buffer {
  return randomBytes(32);
}

export function wrapDekForPlatform(orgId: string, dek: Buffer): string {
  return seal(platformKek(), dek, `dek:${orgId}`);
}

export function unwrapDekFromPlatform(orgId: string, wrapped: string): Buffer {
  try {
    return open(platformKek(), wrapped, `dek:${orgId}`);
  } catch {
    throw Object.assign(
      new Error(
        `This organization's encryption key could not be unwrapped — the platform key (${KEK_ENV}) ` +
          "has changed or is missing. Documents stay encrypted and safe; restore the key to read them.",
      ),
      { statusCode: 503 },
    );
  }
}

/**
 * Wrap the DEK under a key derived from the Supreme password, for escrow into the
 * organization's `.main` file. Computed at export time and never stored (§9.5).
 *
 * scrypt matches the .main container's own derivation, so a recovery tool needs one
 * KDF rather than two.
 */
export function wrapDekForSupreme(dek: Buffer, supremePassword: string, saltB64: string): string {
  // Imported lazily: node:crypto's scryptSync is synchronous and costly, and this path
  // runs only on .main export.
  const { scryptSync } = require("node:crypto") as typeof import("node:crypto");
  const key = scryptSync(supremePassword, Buffer.from(saltB64, "base64"), 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return seal(key, dek);
}

// ── Per-file keys ────────────────────────────────────────────────────────────

/** A fresh key for one object. One compromised file never unlocks the next. */
export function newFileKey(): Buffer {
  return randomBytes(32);
}

/** Wrap a file key under the org's DEK, for storage alongside the object record. */
export function wrapFileKey(dek: Buffer, fileKey: Buffer, objectKey: string): string {
  return seal(dek, fileKey, `fk:${objectKey}`);
}

export function unwrapFileKey(dek: Buffer, wrapped: string, objectKey: string): Buffer {
  try {
    return open(dek, wrapped, `fk:${objectKey}`);
  } catch {
    throw Object.assign(new Error("This object's key could not be unwrapped"), { statusCode: 500 });
  }
}

/** Constant-time compare for integrity hashes. */
export function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
