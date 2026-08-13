import { randomBytes } from "node:crypto";

const isProd = process.env.NODE_ENV === "production" || !!process.env.RENDER;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProd) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return "";
}

const devJwtSecret = randomBytes(32).toString("hex");

// Inactivity that ends a session (structure.md §8.8). One hour by default; set
// SESSION_IDLE_MINUTES to tighten it for a stricter customer. Clamped to 5 minutes–7 days
// so a typo (0, or a value in seconds) cannot silently disable the timeout or make the
// product unusable.
function idleMinutes(): number {
  const raw = Number(process.env.SESSION_IDLE_MINUTES ?? 60);
  if (!Number.isFinite(raw) || raw <= 0) return 60;
  return Math.min(Math.max(Math.round(raw), 5), 7 * 24 * 60);
}

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN?.trim() || undefined,
  jwtSecret: required("JWT_SECRET") || devJwtSecret,
  sessionIdleMinutes: idleMinutes(),
};

if (!process.env.JWT_SECRET && !isProd) {
  console.warn("[env] JWT_SECRET not set — using a random dev secret (sessions reset on restart)");
}
