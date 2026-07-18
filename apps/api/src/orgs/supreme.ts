import { SignJWT, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db.js";
import { env } from "../env.js";

// The Supreme-access gate (docs/structure.md §2.2): verifying the org's Supreme password
// yields a short-lived token that authorizes owner-level structural changes. Every gate
// attempt is rate-limited and audit-logged — the Supreme is data, not an account, so its
// password uses are the only trace of "Supreme activity" that can exist.

const SUPREME_TTL_SECONDS = 10 * 60;
// Env-tunable for testing phases (e.g. SUPREME_MAX_ATTEMPTS=100). Counters are in-memory,
// so a service restart also clears any active lockout. Production defaults: 5 per 15 min.
const MAX_ATTEMPTS = Number(process.env.SUPREME_MAX_ATTEMPTS ?? 5);
const WINDOW_MS = Number(process.env.SUPREME_WINDOW_MINUTES ?? 15) * 60 * 1000;

const secret = new TextEncoder().encode(env.jwtSecret);
const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkSupremeRateLimit(orgId: string, ip: string): boolean {
  const key = `${orgId}:${ip}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

export async function issueSupremeToken(orgId: string): Promise<string> {
  return new SignJWT({ scope: "supreme", orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SUPREME_TTL_SECONDS}s`)
    .sign(secret);
}

export const supremeTtlSeconds = SUPREME_TTL_SECONDS;

export async function verifySupremeToken(token: string, orgId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.scope === "supreme" && payload.orgId === orgId;
  } catch {
    return false;
  }
}

/** Route guard: requires a valid X-Supreme-Token header for this org. */
export async function requireSupreme(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const token = req.headers["x-supreme-token"];
  const ok =
    typeof token === "string" && (await verifySupremeToken(token, req.params.id));
  if (!ok) {
    reply
      .status(403)
      .send({ error: "Supreme access required — verify the Supreme password first" });
  }
}

export async function auditSupreme(
  orgId: string,
  action: string,
  opts: { actorProfileId?: string; ip?: string; detail?: string } = {},
): Promise<void> {
  await db.supremeAudit.create({
    data: {
      orgId,
      action,
      actorProfileId: opts.actorProfileId,
      ip: opts.ip,
      detail: opts.detail,
    },
  });
}
