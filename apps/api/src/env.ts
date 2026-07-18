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

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN?.trim() || undefined,
  /** Public URL of the web app — used in email verification links. */
  webUrl: process.env.WEB_URL?.trim() || process.env.WEB_ORIGIN?.trim() || "http://localhost:3000",
  jwtSecret: required("JWT_SECRET") || devJwtSecret,
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || undefined,
  smtp: {
    user: process.env.SMTP_USER?.trim() || undefined,
    pass: process.env.SMTP_PASS?.trim() || undefined,
  },
  /** Brevo transactional API key — preferred mail path (HTTPS, no SMTP involved). */
  brevoKey: process.env.BREVO_API_KEY?.trim() || undefined,
  /** Verified sender address (defaults to SMTP_USER). */
  mailFrom: process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || undefined,
};

if (!process.env.JWT_SECRET && !isProd) {
  console.warn("[env] JWT_SECRET not set — using a random dev secret (sessions reset on restart)");
}
