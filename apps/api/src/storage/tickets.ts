import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { derivedPlatformKey } from "./secrets.js";

// Streaming tickets (docs/structure.md §9.16).
//
// The API decides who may read or write an object; the streaming gateway only carries
// bytes. A ticket is how the decision travels from one to the other: signed by the API,
// scoped to ONE object (or one upload), short-lived, and carrying the organization's
// ticket epoch so every outstanding ticket can be revoked at once.
//
// Ed25519 rather than an HMAC, so a gateway running on another machine can verify
// tickets with the public key alone — a compromised gateway cannot mint them.

export interface TicketClaims {
  /** Organization. */
  o: string;
  /** Subject: a StorageObject id (read) or a StorageUploadSession id (upload). */
  s: string;
  /** Mode: read or upload. A read ticket never opens an upload and vice versa. */
  m: "r" | "u";
  /** Expiry, seconds since the epoch. */
  e: number;
  /** The organization's ticket epoch when this was issued. */
  g: number;
  /** The profile it was issued to — for the audit trail and per-person limits. */
  p: string;
  /** Download allowed (the owner's per-document switch). */
  d?: 0 | 1;
}

const PREFIX = "KVT1";
// PKCS#8 wrapper for a raw 32-byte Ed25519 seed.
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");

let cached: { priv: KeyObject; pub: KeyObject } | null = null;

function keys(): { priv: KeyObject; pub: KeyObject } {
  if (cached) return cached;
  // A dedicated secret when the operator sets one; otherwise derived from the platform
  // key with HKDF, so no new secret has to be configured for the in-process gateway.
  const secret = process.env.STREAM_TICKET_SECRET?.trim();
  const seed = secret
    ? createHash("sha256").update(`kv-stream-ticket:${secret}`).digest()
    : derivedPlatformKey("stream-ticket-ed25519");
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), format: "der", type: "pkcs8" });
  cached = { priv, pub: createPublicKey(priv) };
  return cached;
}

/** The public key a separately hosted gateway verifies with (SPKI, PEM). */
export function ticketPublicKeyPem(): string {
  return keys().pub.export({ format: "pem", type: "spki" }).toString();
}

export function signTicket(claims: TicketClaims): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signed = `${PREFIX}.${payload}`;
  const sig = sign(null, Buffer.from(signed, "utf8"), keys().priv).toString("base64url");
  return `${signed}.${sig}`;
}

const refuse = (message: string) => Object.assign(new Error(message), { statusCode: 401 });

/**
 * Verify a ticket's signature and expiry. The caller still checks that the ticket names
 * the object being asked for, and that its epoch is current.
 */
export function readTicket(raw: string | undefined | null): TicketClaims {
  if (!raw) throw refuse("This link needs a ticket. Reopen the document.");
  const parts = raw.trim().split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) throw refuse("This ticket is not valid. Reopen the document.");
  const ok = verify(
    null,
    Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
    keys().pub,
    Buffer.from(parts[2]!, "base64url"),
  );
  if (!ok) throw refuse("This ticket is not valid. Reopen the document.");
  let claims: TicketClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as TicketClaims;
  } catch {
    throw refuse("This ticket is not valid. Reopen the document.");
  }
  if (!claims.e || claims.e * 1000 < Date.now()) {
    throw refuse("This ticket has expired. Reopen the document to get a fresh one.");
  }
  return claims;
}

/** `Authorization: KVT <ticket>`, or `?t=<ticket>` for the one case a header cannot be set. */
export function ticketFrom(headers: Record<string, unknown>, query: Record<string, unknown>): string | null {
  const auth = typeof headers.authorization === "string" ? headers.authorization : "";
  if (auth.startsWith("KVT ")) return auth.slice(4);
  return typeof query.t === "string" ? query.t : null;
}
