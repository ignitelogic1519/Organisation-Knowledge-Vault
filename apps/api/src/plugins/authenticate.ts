import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../auth/tokens.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
});
