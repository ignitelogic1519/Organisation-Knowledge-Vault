import { hash, verify as argonVerify } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { loginSchema, refreshSchema, registerSchema, type AuthResponse } from "@vault/shared";
import { db } from "../db.js";
import { rateLimiter } from "../security.js";
import { acceptPendingInvitations } from "../roles/helpers.js";
import { issueTokens, revokeRefreshToken, rotateRefreshToken, toPublicProfile } from "./tokens.js";

export async function authRoutes(app: FastifyInstance) {
  // Credential endpoints are the classic brute-force / enumeration surface — throttle
  // hard per IP (10 login/register attempts per 5 min; refresh a bit looser).
  const authLimit = { preHandler: rateLimiter("auth", 10, 5 * 60_000) };
  const refreshLimit = { preHandler: rateLimiter("refresh", 60, 5 * 60_000) };

  app.post("/auth/register", authLimit, async (req, reply): Promise<AuthResponse> => {
    const body = registerSchema.parse(req.body);
    const username = body.username.toLowerCase();

    const existing = await db.profile.findUnique({ where: { username } });
    if (existing) {
      return reply.status(409).send({ error: "This username is already taken" });
    }

    const profile = await db.profile.create({
      data: {
        username,
        displayName: body.displayName,
        passwordHash: await hash(body.password),
      },
    });
    // Joining completes on registration for anyone placed before they had a profile
    await acceptPendingInvitations(profile.id, username);

    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile) };
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
    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile) };
  });

  app.post("/auth/refresh", refreshLimit, async (req, reply): Promise<AuthResponse> => {
    const body = refreshSchema.parse(req.body);
    const profile = await rotateRefreshToken(body.refreshToken);
    if (!profile) {
      return reply.status(401).send({ error: "Session expired — sign in again" });
    }
    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile) };
  });

  app.post("/auth/logout", async (req) => {
    const body = refreshSchema.parse(req.body);
    await revokeRefreshToken(body.refreshToken);
    return { ok: true };
  });
}
