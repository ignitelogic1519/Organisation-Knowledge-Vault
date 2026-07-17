import Fastify from "fastify";
import cors from "@fastify/cors";
import type { HealthResponse } from "@vault/shared";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? true,
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
