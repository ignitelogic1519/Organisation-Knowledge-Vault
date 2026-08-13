import { hash, verify as argonVerify } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import {
  SESSION_ENDED,
  loginSchema,
  refreshSchema,
  registerSchema,
  type AuthResponse,
  type SessionActivityResponse,
} from "@vault/shared";
import { db } from "../db.js";
import { getDefaultCoins } from "../platform/settings.js";
import { rateLimiter } from "../security.js";
import { acceptPendingInvitations } from "../roles/helpers.js";
import {
  IDLE_MESSAGE,
  IDLE_TIMEOUT_SECONDS,
  issueTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  startSession,
  toPublicProfile,
  touchSession,
} from "./tokens.js";

export async function authRoutes(app: FastifyInstance) {
  // Credential endpoints are the classic brute-force / enumeration surface — throttle
  // hard per IP (10 login/register attempts per 5 min; refresh a bit looser).
  const authLimit = { preHandler: rateLimiter("auth", 10, 5 * 60_000) };
  const refreshLimit = { preHandler: rateLimiter("refresh", 60, 5 * 60_000) };
  // The activity beat is small, authenticated and frequent by design (once a minute per
  // person at work), so its ceiling is generous: the limiter is keyed by IP, and a whole
  // office behind one address must never be throttled into a false sign-out. 600 per five
  // minutes carries ~120 people on a shared address.
  const activityLimit = rateLimiter("activity", 600, 5 * 60_000);

  app.post("/auth/register", authLimit, async (req, reply): Promise<AuthResponse> => {
    const body = registerSchema.parse(req.body);
    const username = body.username.toLowerCase();

    const existing = await db.profile.findUnique({ where: { username } });
    if (existing) {
      return reply.status(409).send({ error: "This username is already taken" });
    }

    const startingCoins = await getDefaultCoins();
    const profile = await db.profile.create({
      data: {
        username,
        displayName: body.displayName,
        passwordHash: await hash(body.password),
        coins: startingCoins,
      },
    });
    if (startingCoins > 0) {
      await db.coinTransaction.create({
        data: { profileId: profile.id, delta: startingCoins, balance: startingCoins, reason: "SIGNUP_GRANT" },
      });
    }
    // Joining completes on registration for anyone placed before they had a profile
    await acceptPendingInvitations(profile.id, username);

    const session = await startSession(profile.id, req.headers["user-agent"]);
    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile, session.id) };
  });

  app.post("/auth/login", authLimit, async (req, reply): Promise<AuthResponse> => {
    const body = loginSchema.parse(req.body);
    const profile = await db.profile.findUnique({
      where: { username: body.username.toLowerCase() },
    });
    // Same message for unknown username and wrong password — no account enumeration
    if (!profile?.passwordHash || !(await argonVerify(profile.passwordHash, body.password))) {
      return reply.status(401).send({ error: "Invalid username or password" });
    }
    // A banned profile is told plainly rather than given the generic failure — they know
    // their password is right, and pretending otherwise only produces a support ticket.
    if (profile.bannedAt) {
      return reply.status(403).send({
        error:
          "This account has been suspended by the Knowledge Base team. Contact them if you " +
          "believe this is a mistake.",
      });
    }
    const session = await startSession(profile.id, req.headers["user-agent"]);
    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile, session.id) };
  });

  app.post("/auth/refresh", refreshLimit, async (req, reply): Promise<AuthResponse> => {
    const body = refreshSchema.parse(req.body);
    const result = await rotateRefreshToken(body.refreshToken);
    if (!result.profile || !result.sessionId) {
      // Say WHICH ending this was: "you were away for an hour" is an explanation, while
      // a bare "session expired" on a session the user thought was fine is a mystery.
      return reply.status(401).send({
        error:
          result.code === SESSION_ENDED.idle ? IDLE_MESSAGE : "Session expired — sign in again",
        code: result.code ?? SESSION_ENDED.ended,
      });
    }
    return {
      profile: toPublicProfile(result.profile),
      tokens: await issueTokens(result.profile, result.sessionId),
    };
  });

  /**
   * "The user is still here." The browser beats this on real interaction only — a click,
   * a keystroke, a touch, a page opened — and at most once a minute. It is the ONLY thing
   * that moves the idle deadline: neither background polling nor a token refresh counts,
   * or a tab left open on an empty desk would keep itself signed in for ever.
   */
  app.post(
    "/auth/activity",
    { preHandler: [activityLimit, app.authenticate] },
    async (req, reply): Promise<SessionActivityResponse> => {
      const state = await touchSession(req.sessionId);
      if (!state.ok || !state.deadline) {
        return reply.status(401).send({
          error: state.code === SESSION_ENDED.idle ? IDLE_MESSAGE : "Session expired — sign in again",
          code: state.code ?? SESSION_ENDED.ended,
        });
      }
      return {
        ok: true,
        idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
        idleDeadline: state.deadline.toISOString(),
      };
    },
  );

  app.post("/auth/logout", async (req) => {
    const body = refreshSchema.parse(req.body);
    await revokeRefreshToken(body.refreshToken);
    return { ok: true };
  });
}
