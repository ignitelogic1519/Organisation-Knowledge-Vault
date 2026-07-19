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
  jwtSecret: required("JWT_SECRET") || devJwtSecret,
};

if (!process.env.JWT_SECRET && !isProd) {
  console.warn("[env] JWT_SECRET not set — using a random dev secret (sessions reset on restart)");
}
