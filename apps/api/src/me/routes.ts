import type { FastifyInstance } from "fastify";
import { updateProfileSchema } from "@vault/shared";
import { db } from "../db.js";
import { toPublicProfile } from "../auth/tokens.js";

// Data-URL image, ≤ ~300 KB decoded, common raster types only — a profile picture, not
// an upload channel. Larger/other files are rejected.
const AVATAR_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export async function meRoutes(app: FastifyInstance) {
  // Username suggestions while typing (the add-person forms). Prefix-first, then
  // contains, capped at 8 — enough to confirm "this person exists" without turning the
  // profile table into a directory anyone can page through. Only the public identity
  // fields are returned, and a query shorter than two characters returns nothing.
  //
  // `memberOfOrgId` narrows the search to one organization's own people. That is not the
  // same question as `orgId`: adding somebody searches everyone on the platform and merely
  // MARKS the ones already here, while a manager looking up an employee must never be
  // offered a stranger. The caller with `memberOfOrgId` must belong to that organization
  // themselves — it is a member directory, not a platform-wide one.
  app.get<{ Querystring: { q?: string; orgId?: string; memberOfOrgId?: string } }>(
    "/profiles/search",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const q = (req.query.q ?? "").trim().toLowerCase();
      if (q.length < 2) return { profiles: [] };
      const restrictTo = req.query.memberOfOrgId;
      if (restrictTo) {
        const caller = await db.membership.findFirst({
          where: { orgId: restrictTo, profileId: req.profileId },
          select: { id: true },
        });
        if (!caller) {
          return reply.status(403).send({ error: "You are not a member of that organization" });
        }
      }
      const rows = await db.profile.findMany({
        where: {
          OR: [{ username: { contains: q } }, { displayName: { contains: q, mode: "insensitive" } }],
          ...(restrictTo ? { memberships: { some: { orgId: restrictTo } } } : {}),
        },
        select: { id: true, username: true, displayName: true, avatar: true },
        take: 24,
      });
      // Members of the named organization are marked so the form can say "already here".
      const memberIds = req.query.orgId
        ? new Set(
            (
              await db.membership.findMany({
                where: { orgId: req.query.orgId, profileId: { in: rows.map((r) => r.id) } },
                select: { profileId: true },
              })
            ).map((m) => m.profileId),
          )
        : new Set<string>();
      const scored = rows
        .map((r) => ({
          username: r.username,
          displayName: r.displayName,
          avatar: r.avatar,
          alreadyMember: memberIds.has(r.id),
          // Prefix matches first, then shorter usernames — the familiar autocomplete feel.
          rank: (r.username.startsWith(q) ? 0 : 1) * 1000 + r.username.length,
        }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 8)
        .map(({ rank: _rank, ...rest }) => rest);
      return { profiles: scored };
    },
  );

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
