import type { FastifyInstance } from "fastify";
import {
  can,
  createRequestSchema,
  decideRequestSchema,
  REQUEST_KIND_LABELS,
  type RequestsOverview,
  type RequestView,
} from "@vault/shared";
import type { VaultRequest } from "@prisma/client";
import { db } from "../db.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { ownersAbove } from "../roles/routes.js";
import { notify } from "../courses/helpers.js";

// The ask-and-approve system (labeled categories):
//  · Course request   — a member asks for a library course; the branch's handler approves,
//    CONFIGURES it for the branch (mandatory / inheritance / deadline / recurrence), and
//    only then it lands.
//  · Join request     — a member asks to join a public branch; its owners decide.
//  · Deletion request — a branch's own owners ask the level above to delete the branch.

async function toView(r: VaultRequest): Promise<RequestView> {
  const [node, course, requester] = await Promise.all([
    db.roleNode.findUnique({ where: { id: r.targetRoleNodeId } }),
    r.courseId ? db.course.findUnique({ where: { id: r.courseId } }) : null,
    db.profile.findUnique({ where: { id: r.requesterProfileId } }),
  ]);
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    targetRoleName: node?.name ?? "(deleted branch)",
    targetRoleNumber: node?.roleNumber ?? 0,
    courseCode: course?.code ?? null,
    courseTitle: course?.title ?? null,
    requester: {
      username: requester?.username ?? "unknown",
      displayName: requester?.displayName ?? "Unknown",
    },
    message: r.message,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function requestRoutes(app: FastifyInstance) {
  // File a request. Who may file what:
  //  · JOIN_BRANCH    — any member, target must be public and not already theirs
  //  · COURSE_ASSIGN  — any member placed on the target branch (or its managers)
  //  · DELETE_BRANCH  — an OWNER of the target branch itself
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/requests",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = createRequestSchema.parse(req.body);
      const orgId = req.params.id;
      const membership = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId } },
      });
      if (!membership) return reply.status(404).send({ error: "Organization not found" });

      const node = await db.roleNode.findUnique({ where: { id: body.targetRoleNodeId } });
      if (!node || node.orgId !== orgId) {
        return reply.status(404).send({ error: "Branch not found" });
      }
      const placements = await actorPlacements(req.profileId, orgId);
      const onNode = placements.filter((p) => p.roleNodeId === node.id);

      let courseId: string | null = null;
      if (body.kind === "COURSE_ASSIGN") {
        if (!body.courseCode) {
          return reply.status(400).send({ error: "courseCode is required for a Course request" });
        }
        const course = await db.course.findUnique({ where: { code: body.courseCode } });
        if (!course || course.orgId !== orgId || !course.inLibrary) {
          return reply.status(404).send({ error: "Course not found in this organization's library" });
        }
        if (onNode.length === 0 && !can(placements, "create_content", toRoleRef(node))) {
          return reply
            .status(403)
            .send({ error: "Request the course for a branch you belong to" });
        }
        courseId = course.id;
      } else if (body.kind === "JOIN_BRANCH") {
        if (!node.isPublic) {
          return reply.status(403).send({ error: "This branch doesn't accept join requests" });
        }
        if (onNode.length > 0) {
          return reply.status(409).send({ error: "You are already part of this branch" });
        }
      } else {
        // DELETE_BRANCH
        if (node.parentId === null) {
          return reply.status(409).send({ error: "The root role cannot be deleted" });
        }
        if (!onNode.some((p) => p.kind === "OWNER")) {
          return reply
            .status(403)
            .send({ error: "Only this branch's owners can request its deletion" });
        }
      }

      const dup = await db.vaultRequest.findFirst({
        where: {
          orgId,
          kind: body.kind,
          status: "PENDING",
          requesterProfileId: req.profileId,
          targetRoleNodeId: node.id,
          ...(courseId ? { courseId } : {}),
        },
      });
      if (dup) return reply.status(409).send({ error: "An identical request is already pending" });

      const request = await db.vaultRequest.create({
        data: {
          orgId,
          kind: body.kind,
          requesterProfileId: req.profileId,
          targetRoleNodeId: node.id,
          courseId,
          message: body.message ?? null,
        },
      });

      // Tell the deciders: owners above for deletions, governing owners otherwise
      const deciders = await ownersAbove(orgId, node.path, body.kind !== "DELETE_BRANCH");
      await Promise.all(
        deciders
          .filter((id) => id !== req.profileId)
          .map((profileId) =>
            notify(profileId, orgId, "request_created", {
              requestId: request.id,
              kind: request.kind,
              label: REQUEST_KIND_LABELS[request.kind],
              roleName: node.name,
            }),
          ),
      );
      return { ok: true, id: request.id };
    },
  );

  // My requests + the inbox of pending requests this user has authority to decide
  app.get<{ Params: { id: string } }>(
    "/orgs/:id/requests",
    { preHandler: app.authenticate },
    async (req, reply): Promise<RequestsOverview> => {
      const orgId = req.params.id;
      const membership = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId } },
      });
      if (!membership) return reply.status(404).send({ error: "Organization not found" });

      const placements = await actorPlacements(req.profileId, orgId);
      const mineRows = await db.vaultRequest.findMany({
        where: { orgId, requesterProfileId: req.profileId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const pending = await db.vaultRequest.findMany({
        where: { orgId, status: "PENDING", requesterProfileId: { not: req.profileId } },
        orderBy: { createdAt: "asc" },
      });
      const nodeIds = [...new Set(pending.map((p) => p.targetRoleNodeId))];
      const nodes = await db.roleNode.findMany({ where: { id: { in: nodeIds } } });
      const decidable = pending.filter((r) => {
        const node = nodes.find((n) => n.id === r.targetRoleNodeId);
        if (!node) return false;
        const ref = toRoleRef(node);
        if (r.kind === "DELETE_BRANCH") return can(placements, "delete_role", ref);
        if (r.kind === "JOIN_BRANCH") return can(placements, "add_people", ref);
        return can(placements, "create_content", ref); // COURSE_ASSIGN
      });

      return {
        orgId,
        mine: await Promise.all(mineRows.map(toView)),
        inbox: await Promise.all(decidable.map(toView)),
      };
    },
  );

  // Decide a request: reject, or approve — which EXECUTES it (join placement, branch
  // deletion, or configured course placement).
  app.post<{ Params: { requestId: string } }>(
    "/requests/:requestId/decide",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = decideRequestSchema.parse(req.body);
      const request = await db.vaultRequest.findUnique({ where: { id: req.params.requestId } });
      if (!request || request.status !== "PENDING") {
        return reply.status(404).send({ error: "No pending request found" });
      }
      const node = await db.roleNode.findUnique({ where: { id: request.targetRoleNodeId } });
      if (!node) return reply.status(404).send({ error: "The branch no longer exists" });
      const placements = await actorPlacements(req.profileId, request.orgId);
      const ref = toRoleRef(node);

      const allowed =
        request.kind === "DELETE_BRANCH"
          ? can(placements, "delete_role", ref)
          : request.kind === "JOIN_BRANCH"
            ? can(placements, "add_people", ref)
            : can(placements, "create_content", ref);
      if (!allowed) {
        return reply.status(403).send({ error: "You don't have authority over this request" });
      }

      if (body.approve) {
        if (request.kind === "JOIN_BRANCH") {
          const dup = await db.placement.findFirst({
            where: {
              roleNodeId: node.id,
              kind: "MEMBER",
              membership: { profileId: request.requesterProfileId },
            },
          });
          if (!dup) {
            const membership = await db.membership.upsert({
              where: {
                profileId_orgId: { profileId: request.requesterProfileId, orgId: request.orgId },
              },
              create: { profileId: request.requesterProfileId, orgId: request.orgId },
              update: {},
            });
            await db.placement.create({
              data: {
                membershipId: membership.id,
                roleNodeId: node.id,
                kind: "MEMBER",
                addedByProfileId: req.profileId,
              },
            });
          }
        } else if (request.kind === "DELETE_BRANCH") {
          const children = await db.roleNode.count({ where: { parentId: node.id } });
          const occupants = await db.placement.count({ where: { roleNodeId: node.id } });
          if (children > 0 || occupants > 0) {
            return reply.status(409).send({
              error: "The branch still has sub-roles or people — it must be emptied first",
            });
          }
          await db.invitation.deleteMany({ where: { roleNodeId: node.id } });
          await db.vaultRequest.updateMany({
            where: { targetRoleNodeId: node.id, status: "PENDING", id: { not: request.id } },
            data: { status: "REJECTED", decisionNote: "Branch was deleted" },
          });
          await db.roleNode.delete({ where: { id: node.id } });
        } else {
          // COURSE_ASSIGN: the approving manager's configuration is required
          if (!body.config) {
            return reply
              .status(400)
              .send({ error: "Configure the course for this branch before approving" });
          }
          if (!request.courseId) {
            return reply.status(409).send({ error: "The requested course no longer exists" });
          }
          const course = await db.course.findUnique({ where: { id: request.courseId } });
          if (!course) {
            return reply.status(409).send({ error: "The requested course no longer exists" });
          }
          await db.coursePlacement.upsert({
            where: { courseId_roleNodeId: { courseId: course.id, roleNodeId: node.id } },
            create: {
              courseId: course.id,
              roleNodeId: node.id,
              mandatory: body.config.mandatory,
              inheritToDescendants: body.config.inheritToDescendants,
              deadlineDays: body.config.deadlineDays ?? null,
              retakeEveryNDays: body.config.retakeEveryNDays ?? null,
              placedByProfileId: req.profileId,
            },
            update: {
              mandatory: body.config.mandatory,
              inheritToDescendants: body.config.inheritToDescendants,
              deadlineDays: body.config.deadlineDays ?? null,
              retakeEveryNDays: body.config.retakeEveryNDays ?? null,
            },
          });
        }
      }

      const decided = await db.vaultRequest.update({
        where: { id: request.id },
        data: {
          status: body.approve ? "APPROVED" : "REJECTED",
          decidedByProfileId: req.profileId,
          decidedAt: new Date(),
          decisionNote: body.decisionNote ?? null,
        },
      });
      await notify(request.requesterProfileId, request.orgId, "request_decided", {
        requestId: request.id,
        kind: request.kind,
        label: REQUEST_KIND_LABELS[request.kind],
        roleName: node.name,
        approved: body.approve,
        note: body.decisionNote ?? null,
      });
      return { ok: true, status: decided.status };
    },
  );

  // Withdraw one of my pending requests
  app.delete<{ Params: { requestId: string } }>(
    "/requests/:requestId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const request = await db.vaultRequest.findUnique({ where: { id: req.params.requestId } });
      if (!request || request.requesterProfileId !== req.profileId) {
        return reply.status(404).send({ error: "Request not found" });
      }
      if (request.status !== "PENDING") {
        return reply.status(409).send({ error: "Only pending requests can be withdrawn" });
      }
      await db.vaultRequest.delete({ where: { id: request.id } });
      return { ok: true };
    },
  );
}
