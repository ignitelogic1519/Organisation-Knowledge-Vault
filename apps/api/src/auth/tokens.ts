import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { SESSION_ENDED, type AuthTokens, type PublicProfile, type SessionEndedCode } from "@vault/shared";
import type { Profile, Session } from "@prisma/client";
import { db } from "../db.js";
import { env } from "../env.js";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;
const secret = new TextEncoder().encode(env.jwtSecret);

/** Inactivity that ends a session — the whole point of this module (structure.md §8.8). */
export const IDLE_TIMEOUT_MS = env.sessionIdleMinutes * 60_000;
export const IDLE_TIMEOUT_SECONDS = env.sessionIdleMinutes * 60;

/** The window in words, so the message someone reads matches the policy in force. */
export function idleWindowLabel(minutes = env.sessionIdleMinutes): string {
  if (minutes === 60) return "an hour";
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

/** The message someone actually sees when their session ended while they were away. */
export const IDLE_MESSAGE = `Signed out after ${idleWindowLabel()} of inactivity — sign in again`;

export interface AccessClaims {
  sub: string;
  username: string;
  name: string;
  /** Session this token was minted for. Absent only on tokens issued before §8.8. */
  sid?: string;
}

export function toPublicProfile(p: Profile): PublicProfile {
  return {
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    avatar: p.avatar ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Has this session been away longer than the policy allows? */
export function isIdle(session: Pick<Session, "lastActivityAt">, now = Date.now()): boolean {
  return now - session.lastActivityAt.getTime() > IDLE_TIMEOUT_MS;
}

/** When the session dies if nothing else happens. */
export function idleDeadline(session: Pick<Session, "lastActivityAt">): Date {
  return new Date(session.lastActivityAt.getTime() + IDLE_TIMEOUT_MS);
}

/** Start a session: one sign-in, on one device. */
export async function startSession(profileId: string, userAgent?: string): Promise<Session> {
  return db.session.create({
    data: {
      profileId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  });
}

/**
 * Stop a session for good. Every token in its rotation chain is revoked with it, so a
 * refresh token saved from a dead session buys nothing.
 */
export async function endSession(sessionId: string, reason: string): Promise<void> {
  const now = new Date();
  await db.$transaction([
    db.session.updateMany({
      where: { id: sessionId, endedAt: null },
      data: { endedAt: now, endedReason: reason },
    }),
    db.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  sessionCache.delete(sessionId);
}

/** Sign a profile out of every device — used by ban and by password-level events. */
export async function endAllSessions(profileId: string, reason: string): Promise<void> {
  const live = await db.session.findMany({
    where: { profileId, endedAt: null },
    select: { id: true },
  });
  for (const s of live) await endSession(s.id, reason);
}

export async function issueTokens(profile: Profile, sessionId: string): Promise<AuthTokens> {
  const accessToken = await new SignJWT({
    username: profile.username,
    name: profile.displayName,
    sid: sessionId,
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
      sessionId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
    idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
  };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
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

// ── Session liveness ─────────────────────────────────────────────────────────
//
// Every authenticated request has to answer "is this session still alive?", and the
// honest answer lives in the database. Reading it on every request would put a query in
// front of every call in the product, so a live session is remembered here for a few
// seconds. Two rules keep that safe:
//
//   1. A session is NEVER declared dead from the cache — expiry is always confirmed
//      against the database first, so a heartbeat that landed on another instance (or a
//      clock that ran ahead) cannot sign someone out by mistake.
//   2. Entries are short-lived, so a session ended elsewhere — logout on another device,
//      a ban from the console — stops working within seconds rather than minutes.

const LIVENESS_CACHE_MS = 10_000;
/** Finest granularity we bother recording activity at — see `touchSession`. */
const ACTIVITY_WRITE_EVERY_MS = 60_000;

interface CachedSession {
  profileId: string;
  /** Deadline as last read from the database. */
  idleDeadlineMs: number;
  expiresAtMs: number;
  readAt: number;
}

const sessionCache = new Map<string, CachedSession>();

/** Bounded: a busy API would otherwise hold every session it has ever seen. */
function remember(sessionId: string, entry: CachedSession): void {
  if (sessionCache.size > 5_000) sessionCache.clear();
  sessionCache.set(sessionId, entry);
}

export interface SessionCheck {
  ok: boolean;
  profileId?: string;
  code?: SessionEndedCode;
  reason?: string;
}

/**
 * Is this session usable right now? Ends it (once) when the idle window has passed, so
 * the timeout is enforced by the API itself rather than trusted to the browser.
 */
export async function checkSession(sessionId: string): Promise<SessionCheck> {
  const now = Date.now();
  const cached = sessionCache.get(sessionId);
  if (
    cached &&
    now - cached.readAt < LIVENESS_CACHE_MS &&
    now < cached.idleDeadlineMs &&
    now < cached.expiresAtMs
  ) {
    return { ok: true, profileId: cached.profileId };
  }

  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session || session.endedAt) {
    sessionCache.delete(sessionId);
    // Whichever call discovers the ending, the reason is the one recorded when it
    // happened — so a session that died of an idle hour still says so on the refresh
    // that follows the request which noticed, rather than degrading to "expired".
    return {
      ok: false,
      code: session?.endedReason === "idle" ? SESSION_ENDED.idle : SESSION_ENDED.ended,
      reason: session?.endedReason ?? "ended",
    };
  }
  if (session.expiresAt.getTime() <= now) {
    await endSession(session.id, "expired");
    return { ok: false, code: SESSION_ENDED.ended, reason: "expired" };
  }
  if (isIdle(session, now)) {
    await endSession(session.id, "idle");
    return { ok: false, code: SESSION_ENDED.idle, reason: "idle" };
  }

  remember(sessionId, {
    profileId: session.profileId,
    idleDeadlineMs: idleDeadline(session).getTime(),
    expiresAtMs: session.expiresAt.getTime(),
    readAt: now,
  });
  return { ok: true, profileId: session.profileId };
}

/**
 * The user is still here. Called from POST /auth/activity, which the browser beats only
 * on real interaction — a click, a keystroke, a touch, a page they opened.
 *
 * Writes are throttled: while the session is being used the row is updated at most once a
 * minute, which is far finer than an hour-long window and keeps a busy console from
 * writing on every beat.
 */
export async function touchSession(sessionId: string): Promise<SessionCheck & { deadline?: Date }> {
  const state = await checkSession(sessionId);
  if (!state.ok) return state;

  const now = Date.now();
  const cached = sessionCache.get(sessionId);
  // `idleDeadline - window` is the stored lastActivityAt: if it moved within the last
  // minute, this beat would write the same answer again.
  const storedActivityMs = cached ? cached.idleDeadlineMs - IDLE_TIMEOUT_MS : 0;
  if (cached && now - storedActivityMs < ACTIVITY_WRITE_EVERY_MS) {
    return {
      ok: true,
      profileId: cached.profileId,
      deadline: new Date(cached.idleDeadlineMs),
    };
  }

  const session = await db.session.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date(now) },
  });
  remember(sessionId, {
    profileId: session.profileId,
    idleDeadlineMs: idleDeadline(session).getTime(),
    expiresAtMs: session.expiresAt.getTime(),
    readAt: now,
  });
  return { ok: true, profileId: session.profileId, deadline: idleDeadline(session) };
}

/**
 * Rotation: the presented token is revoked and a fresh pair is issued.
 * Grace window: a token revoked < 60 s ago is still accepted (and rotated again) — absorbs
 * races where two tabs/devices refresh with the same token at nearly the same time.
 *
 * A refresh is NOT activity. It happens on a timer while a forgotten tab polls in the
 * background, so letting it move `lastActivityAt` would mean no session ever went idle —
 * exactly the bug this is here to fix. Rotation only asks whether the session is still
 * alive, and refuses when the person has been away too long.
 */
const ROTATION_GRACE_MS = 60 * 1000;

export interface RotationResult {
  profile?: Profile;
  sessionId?: string;
  code?: SessionEndedCode;
}

export async function rotateRefreshToken(presented: string): Promise<RotationResult> {
  const row = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(presented) },
    include: { profile: true },
  });
  if (!row) return { code: SESSION_ENDED.ended };
  if (row.expiresAt < new Date()) return { code: SESSION_ENDED.ended };
  if (row.revokedAt && Date.now() - row.revokedAt.getTime() > ROTATION_GRACE_MS) {
    // Reuse of a long-dead token: either a stale client or a stolen token. Either way the
    // session it belonged to should not survive it.
    await endSession(row.sessionId, "revoked");
    return { code: SESSION_ENDED.ended };
  }

  const state = await checkSession(row.sessionId);
  if (!state.ok) return { code: state.code };

  if (!row.revokedAt) {
    await db.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  }
  return { profile: row.profile, sessionId: row.sessionId };
}

/** Sign out: the presented token AND the session it belongs to are finished. */
export async function revokeRefreshToken(presented: string): Promise<void> {
  const row = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(presented) },
    select: { sessionId: true },
  });
  if (row) {
    await endSession(row.sessionId, "logout");
    return;
  }
  await db.refreshToken.updateMany({
    where: { tokenHash: hashToken(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
