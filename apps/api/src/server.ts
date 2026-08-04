import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { HealthResponse } from "@vault/shared";
import { env } from "./env.js";
import { authenticatePlugin } from "./plugins/authenticate.js";
import { authenticateAdminPlugin } from "./platform/authenticate.js";
import { platformRoutes } from "./platform/routes.js";
import { ensurePlatformBootstrap } from "./platform/bootstrap.js";
import { pricingRoutes } from "./pricing/routes.js";
import { authRoutes } from "./auth/routes.js";
import { meRoutes } from "./me/routes.js";
import { orgRoutes } from "./orgs/routes.js";
import { roleRoutes } from "./roles/routes.js";
import { courseRoutes } from "./courses/routes.js";
import { examRoutes } from "./exams/routes.js";
import { studioRoutes } from "./studio/routes.js";
import { requestRoutes } from "./requests/routes.js";
import { complianceRoutes } from "./compliance/routes.js";
import { notificationRoutes } from "./notifications/routes.js";
import { vaultFileRoutes } from "./vault-files/routes.js";
import { eventRoutes } from "./events.js";

// Body limit must clear a 10 MB inline file: base64 inflates by ~33% (~13.3 MB) plus the
// surrounding JSON, so allow 16 MB of request body.
const app = Fastify({ logger: true, bodyLimit: 16 * 1024 * 1024 });

// An unset OR blank WEB_ORIGIN means "allow any origin"; a blank string must not reach
// @fastify/cors — it rejects "" as an invalid origin option.
await app.register(cors, {
  origin: env.webOrigin ? env.webOrigin : true,
});

// Zod validation failures become clean 400s with the first helpful message
app.setErrorHandler((err: unknown, _req, reply) => {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path?.join(".");
    // Always name the offending field — a bare "Required" helps nobody
    const message = issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Invalid request";
    return reply.status(400).send({ error: message });
  }
  app.log.error(err);
  const statusCode =
    typeof err === "object" && err !== null && "statusCode" in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500;
  // Surface a readable reason instead of a blank "Something went wrong" — a bare generic
  // message makes real problems (e.g. a schema drift after a missed migration)
  // undebuggable. We send the error's message text only (never a stack trace).
  const message =
    err instanceof Error && err.message
      ? err.message
      : "Something went wrong";
  // Prisma "column does not exist" errors mean the database is behind the code
  const hint = /column .* does not exist|relation .* does not exist/i.test(message)
    ? " (the database is missing a migration — run `prisma migrate deploy`)"
    : "";
  return reply.status(statusCode).send({ error: `${message}${hint}` });
});

await app.register(authenticatePlugin);
await app.register(authenticateAdminPlugin);
await app.register(platformRoutes);
await app.register(pricingRoutes);
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(orgRoutes);
await app.register(roleRoutes);
await app.register(courseRoutes);
await app.register(examRoutes);
await app.register(studioRoutes);
await app.register(requestRoutes);
await app.register(complianceRoutes);
await app.register(notificationRoutes);
await app.register(vaultFileRoutes);
await app.register(eventRoutes);

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  service: "knowledge-vault-api",
  time: new Date().toISOString(),
}));

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });
  // Ensure the first super-admin + starter plans exist (idempotent; never fatal).
  await ensurePlatformBootstrap();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
