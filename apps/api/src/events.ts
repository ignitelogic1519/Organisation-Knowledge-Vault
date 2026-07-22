import type { FastifyInstance } from "fastify";
import { verifyAccessToken } from "./auth/tokens.js";
import { db } from "./db.js";
import { env } from "./env.js";

// Live updates: every mutation broadcasts a lightweight hint ("structure changed",
// "requests changed", …) to the org's connected browsers over Server-Sent Events.
// Clients never receive data through this channel — only WHICH slice went stale; they
// refetch through the normal authorized endpoints. Notifications are additionally
// targeted at a single profile so other members don't refetch for nothing.

export type EventTopic = "structure" | "requests" | "courses" | "notifications";

interface Client {
  profileId: string;
  send: (chunk: string) => void;
}

const channels = new Map<string, Set<Client>>(); // orgId → connected clients

/** Tell an org's connected clients that a slice changed. With `profileId`, only that
 *  person's connections are poked (used for notifications). */
export function broadcast(orgId: string | null, topic: EventTopic, profileId?: string): void {
  if (!orgId) return;
  const clients = channels.get(orgId);
  if (!clients || clients.size === 0) return;
  const chunk = `data: ${JSON.stringify({ topic })}\n\n`;
  for (const c of clients) {
    if (profileId && c.profileId !== profileId) continue;
    try {
      c.send(chunk);
    } catch {
      // dead socket — the close handler removes it
    }
  }
}

export async function eventRoutes(app: FastifyInstance) {
  // EventSource cannot set headers, so the access token travels as a query parameter;
  // it is verified exactly like the Authorization header would be.
  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    "/orgs/:id/events",
    async (req, reply) => {
      const claims = req.query.token ? await verifyAccessToken(req.query.token) : null;
      if (!claims) return reply.status(401).send({ error: "Not authenticated" });
      const membership = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: claims.sub, orgId: req.params.id } },
      });
      if (!membership) return reply.status(404).send({ error: "Organization not found" });

      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "access-control-allow-origin": env.webOrigin ? env.webOrigin : "*",
        "x-accel-buffering": "no",
      });
      reply.raw.write(": connected\n\n");

      const client: Client = {
        profileId: claims.sub,
        send: (chunk) => reply.raw.write(chunk),
      };
      const set = channels.get(req.params.id) ?? new Set<Client>();
      set.add(client);
      channels.set(req.params.id, set);

      // keep intermediaries from timing the idle stream out
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(": hb\n\n");
        } catch {
          /* close handler cleans up */
        }
      }, 25_000);

      req.raw.on("close", () => {
        clearInterval(heartbeat);
        set.delete(client);
        if (set.size === 0) channels.delete(req.params.id);
      });

      // the reply is hijacked — Fastify must not try to send anything else
      return reply.hijack();
    },
  );
}
