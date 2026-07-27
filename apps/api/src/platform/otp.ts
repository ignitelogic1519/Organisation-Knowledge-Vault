import { createHash, randomInt } from "node:crypto";

// One-time access codes (org-creation OTPs and restore keys). 8 characters from an
// unambiguous alphabet (no O/0/I/1/L) so they're easy to read aloud/share. Stored only
// as a SHA-256 hash; the plaintext is shown to the admin once and delivered to the user
// via an in-app notification.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateOtp(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function otpMatches(input: string, hash: string): boolean {
  return hashOtp(input) === hash;
}
