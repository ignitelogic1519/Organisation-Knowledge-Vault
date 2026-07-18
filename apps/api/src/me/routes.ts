import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { toPublicProfile } from "../auth/tokens.js";

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.authenticate }, async (req, reply) => {
    const profile = await db.profile.findUnique({ where: { id: req.profileId } });
    if (!profile) return reply.status(404).send({ error: "Profile not found" });
    return { profile: toPublicProfile(profile) };
  });

  app.delete("/me", { preHandler: app.authenticate }, async (req, reply) => {
    // Owner-block rule (docs/structure.md §1.1): a profile cannot be deleted while it owns
    // organizations. Ownership placements arrive in Phase 2 — until then any membership blocks,
    // which is strictly safer than under-blocking.
    const memberships = await db.membership.count({ where: { profileId: req.profileId } });
    if (memberships > 0) {
      return reply.status(409).send({
        error:
          "You still belong to organizations. Delete them or transfer ownership before deleting your profile.",
      });
    }
    await db.profile.delete({ where: { id: req.profileId } });
    return { ok: true };
  });
}
