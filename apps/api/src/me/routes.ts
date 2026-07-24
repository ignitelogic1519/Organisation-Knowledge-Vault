import type { FastifyInstance } from "fastify";
import { updateProfileSchema } from "@vault/shared";
import { db } from "../db.js";
import { toPublicProfile } from "../auth/tokens.js";

// Data-URL image, ≤ ~300 KB decoded, common raster types only — a profile picture, not
// an upload channel. Larger/other files are rejected.
const AVATAR_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.authenticate }, async (req, reply) => {
    const profile = await db.profile.findUnique({ where: { id: req.profileId } });
    if (!profile) return reply.status(404).send({ error: "Profile not found" });
    return { profile: toPublicProfile(profile) };
  });

  app.patch("/me", { preHandler: app.authenticate }, async (req, reply) => {
    const body = updateProfileSchema.parse(req.body);
    if (body.avatar) {
      if (!AVATAR_RE.test(body.avatar)) {
        return reply.status(400).send({ error: "Avatar must be a PNG/JPEG/WebP/GIF image" });
      }
      const bytes = Math.floor((body.avatar.length - body.avatar.indexOf(",") - 1) * 0.75);
      if (bytes > 300_000) {
        return reply.status(413).send({ error: "Image too large — keep it under ~300 KB" });
      }
    }
    const profile = await db.profile.update({
      where: { id: req.profileId },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.avatar !== undefined ? { avatar: body.avatar } : {}),
      },
    });
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
