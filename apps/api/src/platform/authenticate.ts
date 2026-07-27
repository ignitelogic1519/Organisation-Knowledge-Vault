import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db.js";
import { verifyAdminToken } from "./tokens.js";

// Guards every /admin route. Verifies the admin token AND re-checks the admin is still
// active on each request (so revoking an admin takes effect immediately).

declare module "fastify" {
  interface FastifyInstance {
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    adminId: string;
  }
}

export const authenticateAdminPlugin = fp(async (app) => {
  app.decorateRequest("adminId", "");
  app.decorate("authenticateAdmin", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const claims = token ? await verifyAdminToken(token) : null;
    if (!claims) return reply.status(401).send({ error: "Not authenticated as an admin" });
    const admin = await db.platformAdmin.findUnique({ where: { id: claims.sub } });
    if (!admin || !admin.active) {
      return reply.status(401).send({ error: "Admin account is inactive" });
    }
    req.adminId = admin.id;
  });
});
