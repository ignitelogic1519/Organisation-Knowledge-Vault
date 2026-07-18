import { hash, verify as argonVerify } from "@node-rs/argon2";
import { OAuth2Client } from "google-auth-library";
import type { FastifyInstance } from "fastify";
import {
  googleAuthSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  verifyEmailSchema,
  type AuthResponse,
} from "@vault/shared";
import { db } from "../db.js";
import { env } from "../env.js";
import { consumeVerificationToken, sendVerificationEmail } from "./mailer.js";
import { acceptPendingInvitations } from "../roles/helpers.js";
import { issueTokens, revokeRefreshToken, rotateRefreshToken, toPublicProfile } from "./tokens.js";

const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (req, reply): Promise<AuthResponse> => {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const existing = await db.profile.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "An account with this email already exists" });
    }

    const profile = await db.profile.create({
      data: {
        email,
        displayName: body.displayName,
        passwordHash: await hash(body.password),
      },
    });
    await sendVerificationEmail(profile.id, email);
    // Joining completes on registration for anyone invited before they had a profile
    await acceptPendingInvitations(profile.id, email);

    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile) };
  });

  app.post("/auth/login", async (req, reply): Promise<AuthResponse> => {
    const body = loginSchema.parse(req.body);
    const profile = await db.profile.findUnique({ where: { email: body.email.toLowerCase() } });
    // Same message for unknown email and wrong password — no account enumeration
    if (!profile?.passwordHash || !(await argonVerify(profile.passwordHash, body.password))) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }
    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile) };
  });

  app.post("/auth/google", async (req, reply): Promise<AuthResponse> => {
    if (!googleClient) {
      return reply.status(503).send({ error: "Google sign-in is not configured" });
    }
    const body = googleAuthSchema.parse(req.body);

    const ticket = await googleClient
      .verifyIdToken({ idToken: body.idToken, audience: env.googleClientId })
      .catch(() => null);
    const payload = ticket?.getPayload();
    if (!payload?.sub || !payload.email) {
      return reply.status(401).send({ error: "Invalid Google credential" });
    }

    const email = payload.email.toLowerCase();
    let profile = await db.profile.findUnique({ where: { googleId: payload.sub } });
    if (!profile) {
      const byEmail = await db.profile.findUnique({ where: { email } });
      profile = byEmail
        ? // Same email registered classically → link the Google identity to it
          await db.profile.update({
            where: { id: byEmail.id },
            data: {
              googleId: payload.sub,
              emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
            },
          })
        : await db.profile.create({
            data: {
              email,
              googleId: payload.sub,
              displayName: payload.name ?? email.split("@")[0],
              emailVerifiedAt: new Date(), // Google already verified this address
            },
          });
    }

    return { profile: toPublicProfile(profile), tokens: await issueTokens(profile) };
  });

  app.post("/auth/refresh", async (req, reply): Promise<AuthResponse> => {
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

  app.post("/auth/verify-email", async (req, reply) => {
    const body = verifyEmailSchema.parse(req.body);
    const ok = await consumeVerificationToken(body.token);
    if (!ok) {
      return reply.status(400).send({ error: "Verification link is invalid or expired" });
    }
    return { ok: true };
  });

  app.post("/auth/resend-verification", { preHandler: app.authenticate }, async (req, reply) => {
    const profile = await db.profile.findUnique({ where: { id: req.profileId } });
    if (!profile) return reply.status(404).send({ error: "Profile not found" });
    if (profile.emailVerifiedAt) return { ok: true, alreadyVerified: true };
    await sendVerificationEmail(profile.id, profile.email);
    return { ok: true };
  });
}
