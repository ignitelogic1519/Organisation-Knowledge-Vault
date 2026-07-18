import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import type { HealthResponse } from "@vault/shared";
import { env } from "./env.js";
import { authenticatePlugin } from "./plugins/authenticate.js";
import { authRoutes } from "./auth/routes.js";
import { meRoutes } from "./me/routes.js";
import { orgRoutes } from "./orgs/routes.js";
import { roleRoutes } from "./roles/routes.js";
import { courseRoutes } from "./courses/routes.js";
import { complianceRoutes } from "./compliance/routes.js";
import { vaultFileRoutes } from "./vault-files/routes.js";

const app = Fastify({ logger: true });

// An unset OR blank WEB_ORIGIN means "allow any origin"; a blank string must not reach
// @fastify/cors — it rejects "" as an invalid origin option.
await app.register(cors, {
  origin: env.webOrigin ? env.webOrigin : true,
});

// Zod validation failures become clean 400s with the first helpful message
app.setErrorHandler((err: unknown, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.status(400).send({ error: err.issues[0]?.message ?? "Invalid request" });
  }
  app.log.error(err);
  const statusCode =
    typeof err === "object" && err !== null && "statusCode" in err
      ? Number((err as { statusCode?: number }).statusCode) || 500
      : 500;
  return reply.status(statusCode).send({ error: "Something went wrong" });
});

await app.register(authenticatePlugin);
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(orgRoutes);
await app.register(roleRoutes);
await app.register(courseRoutes);
await app.register(complianceRoutes);
await app.register(vaultFileRoutes);

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  service: "knowledge-vault-api",
  time: new Date().toISOString(),
  mail: env.smtp.user && env.smtp.pass ? "configured" : "log-only",
}));

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
