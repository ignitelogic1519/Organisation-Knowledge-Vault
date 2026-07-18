import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  addPersonSchema,
  can,
  createSubRoleSchema,
  isSelfOrAncestor,
  updatePersonFlagsSchema,
  updateRoleFlagsSchema,
  type RolePerson,
  type StructureView,
  type TreeNode,
} from "@vault/shared";
import { db } from "../db.js";
import { sendInviteEmail } from "../auth/mailer.js";
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
    email: p.membership.profile.email,
    kind: p.kind,
    canCreateSubgroups: p.canCreateSubgroups,
  }));
}

export async function roleRoutes(app: FastifyInstance) {
  // My Structure: the user's visible slice of the tree (docs/structure.md §6) —
  // nodes they occupy, ancestors of those nodes for context, and the full subtree
  // beneath every node they OWN (authority flows down).
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

      const visible = allNodes.filter((n) => {
        const occupiesOrOwnsAbove =
          ownedPaths.some((op) => isSelfOrAncestor(op, n.path)) || // subtree of owned nodes
          occupiedPaths.includes(n.path); // nodes they occupy as member
        const isAncestorOfOccupied = occupiedPaths.some((op) => isSelfOrAncestor(n.path, op));
        return occupiesOrOwnsAbove || isAncestorOfOccupied;
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
          const my: TreeNode["my"] = {
            kinds: placements.filter((p) => p.roleNodeId === n.id).map((p) => p.kind),
            canAddPeople: governs,
            canCreateSubRole: can(placements, "create_sub_role", ref),
            canManageFlags: can(placements, "manage_flags", ref),
            canDelete: can(placements, "delete_role", ref),
          };
          return {
            id: n.id,
            parentId: n.parentId,
            name: n.name,
            roleNumber: n.roleNumber,
            path: n.path,
            isTerminal: n.isTerminal,
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

  // Create a sub-role (central policy: OWNER at node/ancestor + delegation flag; terminal blocks)
  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/children",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = createSubRoleSchema.parse(req.body);
      const ctx = await loadContext(req as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (!can(ctx.placements, "create_sub_role", toRoleRef(ctx.node))) {
        return reply.status(403).send({
          error: ctx.node.isTerminal
            ? "This role is terminal — no sub-roles can be created beneath it"
            : "You don't have sub-group creation rights here",
        });
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
            isTerminal: body.isTerminal,
            path: `${ctx.node.path}.${roleNumber}`,
          },
        });
      });
      return { id: child.id, roleNumber: child.roleNumber, path: child.path };
    },
  );

  // Add a person (OWNER or MEMBER) to a role — invitation flow for unknown emails
  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/people",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = addPersonSchema.parse(req.body);
      const ctx = await loadContext(req as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (!can(ctx.placements, "add_people", toRoleRef(ctx.node))) {
        return reply.status(403).send({ error: "You don't manage this role" });
      }

      const email = body.email.toLowerCase();
      const profile = await db.profile.findUnique({ where: { email } });

      if (!profile) {
        const existing = await db.invitation.findFirst({
          where: { orgId: ctx.node.orgId, email, roleNodeId: ctx.node.id, kind: body.kind, acceptedAt: null },
        });
        if (existing) return reply.status(409).send({ error: "Already invited to this role" });
        await db.invitation.create({
          data: {
            orgId: ctx.node.orgId,
            email,
            roleNodeId: ctx.node.id,
            kind: body.kind,
            canCreateSubgroups: body.kind === "OWNER" ? body.canCreateSubgroups : false,
            invitedByProfileId: req.profileId,
          },
        });
        await sendInviteEmail(email, ctx.node.org.name, ctx.node.name);
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
        canCreateSubgroups: body.kind === "OWNER" ? body.canCreateSubgroups : false,
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

  // Flags — invariant I6: only the layer above (or the root Owner role) may change them
  app.patch<{ Params: { roleId: string } }>(
    "/roles/:roleId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = updateRoleFlagsSchema.parse(req.body);
      const ctx = await loadContext(req as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (!can(ctx.placements, "manage_flags", toRoleRef(ctx.node))) {
        return reply
          .status(403)
          .send({ error: "Only the layer above this role can change its flags" });
      }
      await db.roleNode.update({
        where: { id: ctx.node.id },
        data: { isTerminal: body.isTerminal },
      });
      return { ok: true };
    },
  );

  app.patch<{ Params: { roleId: string; profileId: string } }>(
    "/roles/:roleId/people/:profileId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = updatePersonFlagsSchema.parse(req.body);
      const ctx = await loadContext(req as unknown as RoleReq);
      if (!ctx) return reply.status(404).send({ error: "Role not found" });
      if (!can(ctx.placements, "manage_flags", toRoleRef(ctx.node))) {
        return reply
          .status(403)
          .send({ error: "Only the layer above this role can change delegation flags" });
      }
      const target = await db.placement.findFirst({
        where: { roleNodeId: ctx.node.id, kind: "OWNER", membership: { profileId: req.params.profileId } },
      });
      if (!target) return reply.status(404).send({ error: "They are not an owner of this role" });
      await db.placement.update({
        where: { id: target.id },
        data: { canCreateSubgroups: body.canCreateSubgroups },
      });
      return { ok: true };
    },
  );

  // Delete a role — invariant I5: blocked while the subtree (children or occupants) is non-empty
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
        return reply.status(403).send({ error: "Only the layer above this role can delete it" });
      }
      const children = await db.roleNode.count({ where: { parentId: ctx.node.id } });
      const occupants = await db.placement.count({ where: { roleNodeId: ctx.node.id } });
      if (children > 0 || occupants > 0) {
        return reply.status(409).send({
          error: "The role still has sub-roles or people — empty it before deleting",
        });
      }
      await db.invitation.deleteMany({ where: { roleNodeId: ctx.node.id } });
      await db.roleNode.delete({ where: { id: ctx.node.id } });
      return { ok: true };
    },
  );
}
