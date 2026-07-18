import Fastify from "fastify";
import cors from "@fastify/cors";
import type { HealthResponse } from "@vault/shared";

const app = Fastify({ logger: true });

// An unset OR blank WEB_ORIGIN means "allow any origin" (Phase 0); a blank string must not
// reach @fastify/cors — it rejects "" as an invalid origin option.
const webOrigin = process.env.WEB_ORIGIN?.trim();
await app.register(cors, {
  origin: webOrigin ? webOrigin : true,
});

app.get("/health", async (): Promise<HealthResponse> => ({
  status: "ok",
  service: "knowledge-vault-api",
  time: new Date().toISOString(),
}));

// Render provides PORT; locally we default to 4000.
const port = Number(process.env.PORT ?? 4000);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
