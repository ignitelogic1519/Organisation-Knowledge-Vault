import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  addPersonSchema,
  can,
  canGrantCapability,
  createSubRoleSchema,
  isSelfOrAncestor,
  isStrictAncestor,
  updatePersonFlagsSchema,
  updateRoleFlagsSchema,
  type RolePerson,
  type StructureView,
  type TreeNode,
} from "@vault/shared";
import { db } from "../db.js";
import { actorPlacements, placePerson, toRoleRef } from "./helpers.js";

type RoleReq = FastifyRequest<{ Params: { roleId: string } }>;

/** Load a role node plus the actor's placements, 404 when the actor isn't in the org. */
async function loadContext(req: RoleReq) {
  const node = await db.roleNode.findUnique({
    where: { id: req.params.roleId },
    include: { org: true },
  });
  if (!node || node.org.deletedAt) return null;
  const placements = await actorPlacements(req.profileId, node.orgId);
  if (placements.length === 0) {
    const membership = await db.membership.findUnique({
      where: { profileId_orgId: { profileId: req.profileId, orgId: node.orgId } },
    });
    if (!membership) return null;
  }
  return { node, placements };
}

async function peopleOf(roleNodeId: string): Promise<RolePerson[]> {
  const rows = await db.placement.findMany({
    where: { roleNodeId },
    include: { membership: { include: { profile: true } } },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((p) => ({
    profileId: p.membership.profile.id,
    displayName: p.membership.profile.displayName,
    username: p.membership.profile.username,
    kind: p.kind,
    canCreateSubgroups: p.canCreateSubgroups,
    canAddCoOwners: p.canAddCoOwners,
  }));
}

export async function roleRoutes(app: FastifyInstance) {
  // My Structure: the user's visible slice of the tree (docs/structure.md §6) —
  // nodes they occupy, ancestors of those nodes for context, the full subtree beneath
  // every node they OWN (authority flows down), plus every PUBLIC branch in the org
  // (with its ancestor chain for context) so members can discover where to request in.
  app.get<{ Params: { id: string } }>(
    "/orgs/:id/structure",
    { preHandler: app.authenticate },
    async (req, reply): Promise<StructureView> => {
      const orgId = req.params.id;
      const membership = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId } },
      });
      if (!membership) return reply.status(404).send({ error: "Organization not found" });

      const placements = await actorPlacements(req.profileId, orgId);
      const allNodes = await db.roleNode.findMany({
        where: { orgId },
        orderBy: { path: "asc" },
      });

      const ownedPaths = placements.filter((p) => p.kind === "OWNER").map((p) => p.roleNodePath);
      const occupiedPaths = placements.map((p) => p.roleNodePath);

      // Hidden inherits down to the last end: a node is EFFECTIVELY public only when it
      // and every ancestor below the root are public. (The root is visible to members
      // by definition, so its own flag doesn't gate the chain.)
      const byPath = new Map(allNodes.map((n) => [n.path, n]));
      const hiddenAncestorOf = (n: (typeof allNodes)[number]) => {
        const segs = n.path.split(".");
        for (let i = 1; i < segs.length; i++) {
          const anc = byPath.get(segs.slice(0, i).join("."));
          if (anc && anc.parentId !== null && !anc.isPublic) return anc; // topmost first
        }
        return null;
      };
      const effectivePublicPaths = allNodes
        .filter((n) => n.isPublic && !hiddenAncestorOf(n))
        .map((n) => n.path);

      const visible = allNodes.filter((n) => {
        const occupiesOrOwnsAbove =
          ownedPaths.some((op) => isSelfOrAncestor(op, n.path)) || // subtree of owned nodes
          occupiedPaths.includes(n.path); // nodes they occupy as member
        const isAncestorOfOccupied = occupiedPaths.some((op) => isSelfOrAncestor(n.path, op));
        // Effectively public branches are discoverable by every member — including the
        // chain above them, otherwise the tree they hang from couldn't be drawn.
        const isPublicOrAbovePublic = effectivePublicPaths.some((pp) =>
          isSelfOrAncestor(n.path, pp),
        );
        return occupiesOrOwnsAbove || isAncestorOfOccupied || isPublicOrAbovePublic;
      });

      const counts = await db.placement.groupBy({
        by: ["roleNodeId", "kind"],
        where: { roleNodeId: { in: visible.map((n) => n.id) } },
        _count: true,
      });
      const childCounts = new Map<string, number>();
      for (const n of allNodes) {
        if (n.parentId) childCounts.set(n.parentId, (childCounts.get(n.parentId) ?? 0) + 1);
      }

      const nodes: TreeNode[] = await Promise.all(
        visible.map(async (n) => {
          const ref = toRoleRef(n);
          const governs = can(placements, "add_people", ref);
          const kinds = placements.filter((p) => p.roleNodeId === n.id).map((p) => p.kind);
          const canDelete = n.parentId !== null && can(placements, "delete_role", ref);
          const hiddenAnc = hiddenAncestorOf(n);
          const effectivePublic = n.isPublic && !hiddenAnc;
          const ownsNode = placements.some((p) => p.kind === "OWNER" && p.roleNodeId === n.id);
          const my: TreeNode["my"] = {
            kinds,
            canAddPeople: governs,
            canAddCoOwners: can(placements, "add_co_owner", ref),
            canGrantSubgroups: canGrantCapability(placements, ref, "canCreateSubgroups"),
            canCreateSubRole: can(placements, "create_sub_role", ref),
            canManageFlags: can(placements, "manage_flags", ref),
            canDelete,
            canRequestDelete: n.parentId !== null && !canDelete && ownsNode,
            canRequestJoin: effectivePublic && kinds.length === 0 && !governs,
            // Owner published their node but a level above keeps it hidden — and they
            // can't unhide that level themselves, so it goes by Visibility request.
            canRequestVisibility:
              ownsNode &&
              n.isPublic &&
              hiddenAnc !== null &&
              !can(placements, "add_people", toRoleRef(hiddenAnc)),
          };
          return {
            id: n.id,
            parentId: n.parentId,
            name: n.name,
            roleNumber: n.roleNumber,
            path: n.path,
            isPublic: n.isPublic,
            effectivePublic,
            ownerCount: counts.find((c) => c.roleNodeId === n.id && c.kind === "OWNER")?._count ?? 0,
            memberCount:
              counts.find((c) => c.roleNodeId === n.id && c.kind === "MEMBER")?._count ?? 0,
            childCount: childCounts.get(n.id) ?? 0,
            my,
            ...(governs ? { people: await peopleOf(n.id) } : {}),
          };
        }),
      );

      return { orgId, nodes };
    },
  );

  // Create a sub-role (central policy: OWNER at node/ancestor + delegation flag)
  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/children",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = createSubRoleSchema.parse(req.body);
      const ctx = await loadContext(req as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (!can(ctx.placements, "create_sub_role", toRoleRef(ctx.node))) {
        return reply
          .status(403)
          .send({ error: "You don't have sub-group creation rights here" });
      }

      const child = await db.$transaction(async (tx) => {
        const org = await tx.organization.update({
          where: { id: ctx.node.orgId },
          data: { nextRoleNumber: { increment: 1 } },
        });
        const roleNumber = org.nextRoleNumber - 1;
        return tx.roleNode.create({
          data: {
            orgId: ctx.node.orgId,
            parentId: ctx.node.id,
            name: body.name,
            roleNumber,
            isPublic: body.isPublic,
            path: `${ctx.node.path}.${roleNumber}`,
          },
        });
      });
      return { id: child.id, roleNumber: child.roleNumber, path: child.path };
    },
  );

  // Add a person (OWNER or MEMBER) to a role — invitation flow for unknown usernames.
  // Appointing OWNERS is gated separately (add_co_owner), and no capability can be
  // granted onward by someone who doesn't hold it themselves.
  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/people",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = addPersonSchema.parse(req.body);
      const ctx = await loadContext(req as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      const ref = toRoleRef(ctx.node);
      if (!can(ctx.placements, "add_people", ref)) {
        return reply.status(403).send({ error: "You don't manage this role" });
      }

      const wantsSubgroups = body.kind === "OWNER" && body.canCreateSubgroups;
      const wantsCoOwnerFlag = body.kind === "OWNER" && body.canAddCoOwners;
      if (body.kind === "OWNER" && !can(ctx.placements, "add_co_owner", ref)) {
        return reply.status(403).send({
          error: "You don't have co-owner appointment rights on this branch",
        });
      }
      if (wantsSubgroups && !canGrantCapability(ctx.placements, ref, "canCreateSubgroups")) {
        return reply.status(403).send({
          error: "You can't grant sub-group creation — you don't hold that right yourself",
        });
      }
      if (wantsCoOwnerFlag && !canGrantCapability(ctx.placements, ref, "canAddCoOwners")) {
        return reply.status(403).send({
          error: "You can't grant co-owner appointment — you don't hold that right yourself",
        });
      }

      const username = body.username.toLowerCase();
      const profile = await db.profile.findUnique({ where: { username } });

      if (!profile) {
        const existing = await db.invitation.findFirst({
          where: { orgId: ctx.node.orgId, username, roleNodeId: ctx.node.id, kind: body.kind, acceptedAt: null },
        });
        if (existing) return reply.status(409).send({ error: "Already reserved for this role" });
        await db.invitation.create({
          data: {
            orgId: ctx.node.orgId,
            username,
            roleNodeId: ctx.node.id,
            kind: body.kind,
            canCreateSubgroups: wantsSubgroups,
            canAddCoOwners: wantsCoOwnerFlag,
            invitedByProfileId: req.profileId,
          },
        });
        // No profile with this username yet: the placement is reserved and applies
        // automatically the moment someone registers with exactly this username.
        return { ok: true, invited: true };
      }

      const dup = await db.placement.findFirst({
        where: { roleNodeId: ctx.node.id, kind: body.kind, membership: { profileId: profile.id } },
      });
      if (dup) return reply.status(409).send({ error: "They already hold this position" });

      await placePerson({
        profileId: profile.id,
        orgId: ctx.node.orgId,
        roleNodeId: ctx.node.id,
        kind: body.kind,
        canCreateSubgroups: wantsSubgroups,
        canAddCoOwners: wantsCoOwnerFlag,
        addedByProfileId: req.profileId,
      });
      return { ok: true, invited: false };
    },
  );

  // Remove a person from a role (invariant I2: last owner stays)
  app.delete<{ Params: { roleId: string; profileId: string } }>(
    "/roles/:roleId/people/:profileId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const ctx = await loadContext(req as unknown as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (!can(ctx.placements, "add_people", toRoleRef(ctx.node))) {
        return reply.status(403).send({ error: "You don't manage this role" });
      }

      const target = await db.placement.findFirst({
        where: { roleNodeId: ctx.node.id, membership: { profileId: req.params.profileId } },
        include: { membership: true },
      });
      if (!target) return reply.status(404).send({ error: "They are not in this role" });

      if (target.kind === "OWNER") {
        // Removing an owner is a co-owner-level structural change
        if (!can(ctx.placements, "add_co_owner", toRoleRef(ctx.node))) {
          return reply
            .status(403)
            .send({ error: "You don't have co-owner appointment rights on this branch" });
        }
        const owners = await db.placement.count({
          where: { roleNodeId: ctx.node.id, kind: "OWNER" },
        });
        if (owners <= 1) {
          return reply.status(409).send({
            error: "A role must always have at least one owner — add another owner first",
          });
        }
      }

      await db.placement.delete({ where: { id: target.id } });
      // Their last placement in the org gone → the membership goes too
      const remaining = await db.placement.count({
        where: { membershipId: target.membershipId },
      });
      if (remaining === 0) {
        await db.membership.delete({ where: { id: target.membershipId } });
      }
      return { ok: true };
    },
  );

  // Branch visibility: any owner governing the node can publish/unpublish it
  app.patch<{ Params: { roleId: string } }>(
    "/roles/:roleId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = updateRoleFlagsSchema.parse(req.body);
      const ctx = await loadContext(req as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (!can(ctx.placements, "add_people", toRoleRef(ctx.node))) {
        return reply.status(403).send({ error: "You don't manage this role" });
      }
      await db.roleNode.update({
        where: { id: ctx.node.id },
        data: { isPublic: body.isPublic },
      });
      return { ok: true };
    },
  );

  // Owner flags — invariant I6: only the layer above (or the root Owner role) may change
  // them, and never beyond what the granter holds themselves.
  app.patch<{ Params: { roleId: string; profileId: string } }>(
    "/roles/:roleId/people/:profileId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = updatePersonFlagsSchema.parse(req.body);
      const ctx = await loadContext(req as unknown as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      const ref = toRoleRef(ctx.node);
      if (!can(ctx.placements, "manage_flags", ref)) {
        return reply
          .status(403)
          .send({ error: "Only the layer above this role can change delegation flags" });
      }
      if (
        body.canCreateSubgroups === true &&
        !canGrantCapability(ctx.placements, ref, "canCreateSubgroups")
      ) {
        return reply.status(403).send({
          error: "You can't grant sub-group creation — you don't hold that right yourself",
        });
      }
      if (
        body.canAddCoOwners === true &&
        !canGrantCapability(ctx.placements, ref, "canAddCoOwners")
      ) {
        return reply.status(403).send({
          error: "You can't grant co-owner appointment — you don't hold that right yourself",
        });
      }
      const target = await db.placement.findFirst({
        where: { roleNodeId: ctx.node.id, kind: "OWNER", membership: { profileId: req.params.profileId } },
      });
      if (!target) return reply.status(404).send({ error: "They are not an owner of this role" });
      await db.placement.update({
        where: { id: target.id },
        data: {
          ...(body.canCreateSubgroups !== undefined
            ? { canCreateSubgroups: body.canCreateSubgroups }
            : {}),
          ...(body.canAddCoOwners !== undefined ? { canAddCoOwners: body.canAddCoOwners } : {}),
        },
      });
      return { ok: true };
    },
  );

  // Delete a role — invariant I5: blocked while the subtree (children or occupants) is
  // non-empty. Direct deletion stays with the layer above; a branch's own owners go
  // through a Deletion request instead (requests routes).
  app.delete<{ Params: { roleId: string } }>(
    "/roles/:roleId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const ctx = await loadContext(req as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (ctx.node.parentId === null) {
        return reply.status(409).send({ error: "The root role cannot be deleted" });
      }
      if (!can(ctx.placements, "delete_role", toRoleRef(ctx.node))) {
        const ownsNode = ctx.placements.some(
          (p) => p.kind === "OWNER" && p.roleNodeId === ctx.node.id,
        );
        return reply.status(403).send({
          error: ownsNode
            ? "Deleting your own branch needs approval from the level above — send a Deletion request"
            : "Only the layer above this role can delete it",
        });
      }
      const children = await db.roleNode.count({ where: { parentId: ctx.node.id } });
      const occupants = await db.placement.count({ where: { roleNodeId: ctx.node.id } });
      if (children > 0 || occupants > 0) {
        return reply.status(409).send({
          error: "The role still has sub-roles or people — empty it before deleting",
        });
      }
      await db.invitation.deleteMany({ where: { roleNodeId: ctx.node.id } });
      await db.vaultRequest.deleteMany({ where: { targetRoleNodeId: ctx.node.id } });
      await db.roleNode.delete({ where: { id: ctx.node.id } });
      return { ok: true };
    },
  );
}

/** Owners strictly above a node — the audience for join/deletion decisions. */
export async function ownersAbove(orgId: string, nodePath: string, includeSelf: boolean) {
  const nodes = await db.roleNode.findMany({ where: { orgId } });
  const chainIds = nodes
    .filter((n) =>
      includeSelf ? isSelfOrAncestor(n.path, nodePath) : isStrictAncestor(n.path, nodePath),
    )
    .map((n) => n.id);
  const owners = await db.placement.findMany({
    where: { roleNodeId: { in: chainIds }, kind: "OWNER" },
    include: { membership: true },
  });
  return [...new Set(owners.map((o) => o.membership.profileId))];
}
