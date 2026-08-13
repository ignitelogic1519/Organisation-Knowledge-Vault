import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_ENDED } from "@vault/shared";
import { IDLE_MESSAGE, checkSession, verifyAccessToken } from "../auth/tokens.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Who is asking, on a route that is public but richer when signed in. */
    optionalProfileId: (req: FastifyRequest) => Promise<string | null>;
  }
  interface FastifyRequest {
    profileId: string;
    /** The session this request belongs to (structure.md §8.8). */
    sessionId: string;
  }
}

export const authenticatePlugin = fp(async (app) => {
  app.decorateRequest("profileId", "");
  app.decorateRequest("sessionId", "");
  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims) {
      return reply.status(401).send({ error: "Not authenticated" });
    }
    // A token minted before §8.8 carries no session. Refusing it costs the holder
    // nothing: the client refreshes on 401 exactly as it does for an expired access
    // token, and comes back with a session-bound one.
    if (!claims.sid) {
      return reply
        .status(401)
        .send({ error: "Session must be re-established", code: SESSION_ENDED.ended });
    }
    // The session is checked on every request, so an hour away ends access everywhere at
    // once — including on a device that still holds an unexpired access token.
    const state = await checkSession(claims.sid);
    if (!state.ok) {
      return reply.status(401).send({
        error: state.code === SESSION_ENDED.idle ? IDLE_MESSAGE : "Session expired — sign in again",
        code: state.code,
      });
    }
    req.profileId = claims.sub;
    req.sessionId = claims.sid;
  });
  // Public pages that show more to a signed-in reader (the Pricing page's "your plans")
  // resolve the caller this way — a missing, stale or idled-out token simply means
  // "anonymous", because nothing on those pages is worth a 401.
  app.decorate("optionalProfileId", async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims?.sid) return null;
    const state = await checkSession(claims.sid);
    return state.ok ? claims.sub : null;
  });
});
