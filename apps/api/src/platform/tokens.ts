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
}

export async function issueAdminToken(admin: {
  id: string;
  username: string;
  displayName: string;
}): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({ username: admin.username, name: admin.displayName })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_TTL_SECONDS}s`)
    .sign(secret);
  return { token, expiresIn: ADMIN_TTL_SECONDS };
}

export async function verifyAdminToken(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: AUDIENCE });
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}
