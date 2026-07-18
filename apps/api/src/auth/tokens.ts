import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { AuthTokens, PublicProfile } from "@vault/shared";
import type { Profile } from "@prisma/client";
import { db } from "../db.js";
import { env } from "../env.js";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;
const secret = new TextEncoder().encode(env.jwtSecret);

export interface AccessClaims {
  sub: string;
  email: string;
  name: string;
  verified: boolean;
}

export function toPublicProfile(p: Profile): PublicProfile {
  return {
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    emailVerified: p.emailVerifiedAt !== null,
    hasPassword: p.passwordHash !== null,
    googleLinked: p.googleId !== null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueTokens(profile: Profile): Promise<AuthTokens> {
  const accessToken = await new SignJWT({
    email: profile.email,
    name: profile.displayName,
    verified: profile.emailVerifiedAt !== null,
  } satisfies Omit<AccessClaims, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(profile.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret);

  const refreshToken = randomBytes(48).toString("base64url");
  await db.refreshToken.create({
    data: {
      profileId: profile.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
    },
  });

  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      verified: payload.verified as boolean,
    };
  } catch {
    return null;
  }
}

/** Rotation: the presented token is revoked and a fresh pair is issued. */
export async function rotateRefreshToken(presented: string): Promise<Profile | null> {
  const row = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(presented) },
    include: { profile: true },
  });
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  await db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return row.profile;
}

export async function revokeRefreshToken(presented: string): Promise<void> {
  await db.refreshToken.updateMany({
    where: { tokenHash: hashToken(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
