import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { gatewayRoutes } from "./storage/gateway.js";

// The streaming gateway on its own (docs/structure.md §9.16).
//
// The API runs the gateway in-process under a 2 GiB monthly budget, which keeps a free
// Render instance inside its 5 GB of outbound traffic. Real streaming volume belongs on a
// machine of its own — Oracle Cloud's Always Free VM carries 10 TB a month at no cost.
// Run this there, set STREAM_GATEWAY_URL on the API to its public address, and tickets
// point readers at it from then on.
//
// It needs the same DATABASE_URL, STORAGE_KEK and GOOGLE_OAUTH_* values as the API
// (it reads upload sessions and object records, and renews Google access with the
// organization's sealed grant), plus WEB_ORIGIN for CORS. It serves nothing else.

const app = Fastify({ logger: true, bodyLimit: 16 * 1024 * 1024 });

await app.register(cors, {
  origin: env.webOrigin ? env.webOrigin : true,
  exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"],
  maxAge: 600,
});
await app.register(gatewayRoutes);
app.get("/health", async () => ({ status: "ok", service: "knowledge-vault-stream", time: new Date().toISOString() }));

try {
  await app.listen({ port: Number(process.env.PORT ?? 4100), host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
