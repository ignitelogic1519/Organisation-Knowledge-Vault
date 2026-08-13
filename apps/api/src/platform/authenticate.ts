import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db.js";
import { IDLE_MESSAGE } from "../auth/tokens.js";
import { checkAdminSession } from "./admin-sessions.js";
import { verifyAdminToken } from "./tokens.js";

// Guards every /admin route. Verifies the admin token AND re-checks the admin is still
// active on each request (so revoking an admin takes effect immediately) — and that the
// console has been touched within the idle window (structure.md §8.8).

declare module "fastify" {
  interface FastifyInstance {
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    adminId: string;
    /** The console sign-in this request belongs to. */
    adminSessionId: string;
  }
}

export const authenticateAdminPlugin = fp(async (app) => {
  app.decorateRequest("adminId", "");
  app.decorateRequest("adminSessionId", "");
  app.decorate("authenticateAdmin", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const claims = token ? await verifyAdminToken(token) : null;
    if (!claims) return reply.status(401).send({ error: "Not authenticated as an admin" });
    // A token issued before §8.8 carries no session: the console signs in again once.
    if (!claims.sid) {
      return reply
        .status(401)
        .send({ error: "Session must be re-established", code: "session_ended" });
    }
    const verdict = checkAdminSession(claims.sid);
    if (verdict !== "ok") {
      return reply.status(401).send({
        error: verdict === "idle" ? IDLE_MESSAGE : "Session ended — sign in again",
        code: verdict === "idle" ? "session_idle" : "session_ended",
      });
    }
    const admin = await db.platformAdmin.findUnique({ where: { id: claims.sub } });
    if (!admin || !admin.active) {
      return reply.status(401).send({ error: "Admin account is inactive" });
    }
    req.adminId = admin.id;
    req.adminSessionId = claims.sid;
  });
});
