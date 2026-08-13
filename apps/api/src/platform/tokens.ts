import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";

// Super-admin sessions are a SEPARATE realm from user access tokens: same signing key,
// but a distinct audience so a user token can never authenticate as an admin (or vice
// versa). Short-lived; the console simply re-logs in when it expires.

const ADMIN_TTL_SECONDS = 8 * 3600;
const AUDIENCE = "kv-platform-admin";
const secret = new TextEncoder().encode(env.jwtSecret);

export interface AdminClaims {
  sub: string; // PlatformAdmin.id
  username: string;
  name: string;
  /** This sign-in, so the console's idle timeout can be pinned to it (§8.8). */
  sid?: string;
}

export async function issueAdminToken(admin: {
  id: string;
  username: string;
  displayName: string;
}): Promise<{ token: string; expiresIn: number; sessionId: string }> {
  const sessionId = randomBytes(16).toString("hex");
  const token = await new SignJWT({
    username: admin.username,
    name: admin.displayName,
    sid: sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL_SECONDS}s`)
    .sign(secret);
  return { token, expiresIn: ADMIN_TTL_SECONDS, sessionId };
}

export async function verifyAdminToken(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: AUDIENCE });
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      name: payload.name as string,
      sid: typeof payload.sid === "string" ? payload.sid : undefined,
    };
  } catch {
    return null;
  }
}
