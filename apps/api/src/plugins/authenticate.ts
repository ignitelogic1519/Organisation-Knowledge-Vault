import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../auth/tokens.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Who is asking, on a route that is public but richer when signed in. */
    optionalProfileId: (req: FastifyRequest) => Promise<string | null>;
  }
  interface FastifyRequest {
    profileId: string;
  }
}

export const authenticatePlugin = fp(async (app) => {
  app.decorateRequest("profileId", "");
  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims) {
      return reply.status(401).send({ error: "Not authenticated" });
    }
    req.profileId = claims.sub;
  });
  // Public pages that show more to a signed-in reader (the Pricing page's "your plans")
  // resolve the caller this way — a missing or stale token simply means "anonymous".
  app.decorate("optionalProfileId", async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const claims = token ? await verifyAccessToken(token) : null;
    return claims?.sub ?? null;
  });
});
