import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

// The encrypted container shared by .main and .bkp files (docs/architecture.md §5).
// Layout: [magic 8B][header-length 4B LE][header JSON][AES-256-GCM iv 12B][tag 16B][ciphertext]
// Key derivation: scrypt over the password with a random salt kept in the (plaintext) header.
// The platform stores neither key nor password — whoever holds file + password can decrypt,
// forever. The header carries a formatVersion so future schemas ship import migrations.

const MAGIC = Buffer.from("KVAULT01");
// v2 adds the signed plan snapshot to .main payloads (docs/pricing.md). v1 files stay
// readable — the reader tolerates a lower formatVersion and the revive path treats a
// missing/legacy plan claim as "needs a fresh plan".
export const FORMAT_VERSION = 2;

export interface ContainerHeader {
  formatVersion: number;
  scope: "main" | "bkp";
  orgNumber: number;
  structureHash?: string; // .bkp restore gate
  exportedAt: string;
  saltB64: string;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}

export function sealContainer(
  password: string,
  header: Omit<ContainerHeader, "saltB64" | "formatVersion" | "exportedAt">,
  payload: unknown,
): Buffer {
  const salt = randomBytes(16);
  const fullHeader: ContainerHeader = {
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    saltB64: salt.toString("base64"),
    ...header,
  };
  const headerBuf = Buffer.from(JSON.stringify(fullHeader), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(headerBuf.length);
  return Buffer.concat([MAGIC, lenBuf, headerBuf, iv, cipher.getAuthTag(), ciphertext]);
}

export function readHeader(file: Buffer): ContainerHeader {
  if (!file.subarray(0, 8).equals(MAGIC)) {
    throw Object.assign(new Error("Not a Knowledge Vault file"), { statusCode: 400 });
  }
  const headerLen = file.readUInt32LE(8);
  const header = JSON.parse(file.subarray(12, 12 + headerLen).toString("utf8")) as ContainerHeader;
  if (header.formatVersion > FORMAT_VERSION) {
    throw Object.assign(
      new Error("This file was exported by a newer version of the platform"),
      { statusCode: 400 },
    );
  }
  return header;
}

export function openContainer<T>(file: Buffer, password: string): { header: ContainerHeader; payload: T } {
  const header = readHeader(file);
  const headerLen = file.readUInt32LE(8);
  let offset = 12 + headerLen;
  const iv = file.subarray(offset, offset + 12);
  const tag = file.subarray(offset + 12, offset + 28);
  const ciphertext = file.subarray(offset + 28);
  const key = deriveKey(password, Buffer.from(header.saltB64, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw Object.assign(new Error("Wrong password or corrupted file"), { statusCode: 401 });
  }
  return { header, payload: JSON.parse(plaintext.toString("utf8")) as T };
}

/** Structural fingerprint for the .bkp identical-structure gate (docs/structure.md §5.2). */
export function structureFingerprint(node: {
  path: string;
  roleNumber: number;
  childRoleNumbers: number[];
}): string {
  const normalized = JSON.stringify({
    path: node.path,
    roleNumber: node.roleNumber,
    children: [...node.childRoleNumbers].sort((a, b) => a - b),
  });
  return createHash("sha256").update(normalized).digest("hex");
}
