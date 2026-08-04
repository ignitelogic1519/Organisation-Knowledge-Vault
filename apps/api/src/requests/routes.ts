import type { FastifyInstance } from "fastify";
import {
  can,
  createRequestSchema,
  decideRequestSchema,
  isStrictAncestor,
  REQUEST_KIND_LABELS,
  type PlacementRef,
  type RequestsOverview,
  type RequestView,
} from "@vault/shared";
import type { RoleNode, VaultRequest } from "@prisma/client";
import { db } from "../db.js";
import { assertMemberLimit } from "../orgs/plan.js";
import { broadcast } from "../events.js";
import { audit } from "../security.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { ownersAbove } from "../roles/routes.js";
import { isSelfOrAncestor } from "@vault/shared";
import { courseHandlerNodeId, notify } from "../courses/helpers.js";
import { deletionOpsFor } from "../storage/adapter.js";
import { drainSoon } from "../storage/jobs.js";

/** Decided requests only live 7 days — history stays lean, the database stays clean. */
const DECIDED_RETENTION_MS = 7 * 86400_000;

// The ask-and-approve system (labeled categories):
//  · Course request     — a member asks for a library course; the branch's handler
//    approves, CONFIGURES it for the branch (mandatory / inheritance / deadline /
//    recurrence), and only then it lands.
//  · Join request       — a member asks to join a public branch; its owners decide.
//  · Deletion request   — a branch's own owners ask the level above to delete the branch.
//  · Visibility request — hidden inherits down a branch; an owner whose public node is
//    still hidden by a level above asks that level to unhide the chain.

/** Hidden strict ancestors of a node (root excluded), topmost first — the chain that
 *  keeps an otherwise-public branch effectively hidden. */
async function hiddenChainAbove(orgId: string, nodePath: string): Promise<RoleNode[]> {
  const nodes = await db.roleNode.findMany({ where: { orgId } });
  return nodes
    .filter((n) => n.parentId !== null && !n.isPublic && isStrictAncestor(n.path, nodePath))
    .sort((a, b) => a.path.length - b.path.length);
}

/** Deciding a Visibility request needs governance over the TOPMOST hidden ancestor —
 *  owning that node (or above) covers everything beneath it. */
function canDecideVisibility(placements: PlacementRef[], chain: RoleNode[], node: RoleNode) {
  const gate = chain[0] ?? node;
  return can(placements, "add_people", toRoleRef(gate));
}

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
    joinAs: r.joinAs,
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
      let autoApproveCourse = false;
      let adoptedCourse: { id: string; code: string; title: string; uploaderRoleNodeId: string; createdByProfileId: string } | null = null;
      if (body.kind === "COURSE_ASSIGN") {
        if (!body.courseCode) {
          return reply.status(400).send({ error: "courseCode is required for a Course request" });
        }
        const course = await db.course.findUnique({ where: { code: body.courseCode } });
        if (!course || course.orgId !== orgId || !course.inLibrary) {
          return reply.status(404).send({ error: "Course not found in this organization's library" });
        }
        if (course.archived) {
          return reply.status(409).send({ error: "This course is archived and can't be requested" });
        }
        if (onNode.length === 0 && !can(placements, "create_content", toRoleRef(node))) {
          return reply
            .status(403)
            .send({ error: "Request the course for a branch you belong to" });
        }
        // Conflict guard: no requesting a course the branch already has (directly or
        // inherited from a level above)
        const orgNodes = await db.roleNode.findMany({ where: { orgId } });
        const coursePlacements = await db.coursePlacement.findMany({
          where: { courseId: course.id },
        });
        const alreadyReaches = coursePlacements.some((cp) => {
          if (cp.roleNodeId === node.id) return true;
          const cpNode = orgNodes.find((n) => n.id === cp.roleNodeId);
          return !!cpNode && cp.inheritToDescendants && isSelfOrAncestor(cpNode.path, node.path);
        });
        if (alreadyReaches) {
          return reply.status(409).send({
            error: "This course is already assigned to that branch — requesting it again would conflict",
          });
        }
        courseId = course.id;
        adoptedCourse = course;
        // Boss call: an owner who governs the target branch is already authorized to
        // place content there, so their library request auto-approves instead of
        // waiting on a handler. The course's home owners get a courtesy adoption note.
        autoApproveCourse = can(placements, "create_content", toRoleRef(node));
      } else if (body.kind === "JOIN_BRANCH") {
        // Hidden inherits down: a public node under a hidden ancestor is NOT joinable
        const hiddenAbove = await hiddenChainAbove(orgId, node.path);
        if (!node.isPublic || hiddenAbove.length > 0) {
          return reply.status(403).send({ error: "This branch doesn't accept join requests" });
        }
        if (onNode.length > 0) {
          return reply.status(409).send({ error: "You are already part of this branch" });
        }
      } else if (body.kind === "VISIBILITY") {
        if (node.parentId === null) {
          return reply.status(409).send({ error: "The root role is always visible" });
        }
        if (!onNode.some((p) => p.kind === "OWNER")) {
          return reply
            .status(403)
            .send({ error: "Only this branch's owners can request its visibility" });
        }
        const hiddenAbove = await hiddenChainAbove(orgId, node.path);
        if (hiddenAbove.length === 0) {
          return reply.status(409).send({
            error: node.isPublic
              ? "This branch is already publicly visible"
              : "No level above hides this branch — make it public in Group configuration",
          });
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
          status: autoApproveCourse ? "APPROVED" : "PENDING",
          decidedByProfileId: autoApproveCourse ? req.profileId : null,
          decidedAt: autoApproveCourse ? new Date() : null,
          decisionNote: autoApproveCourse ? "Auto-approved (requester governs this branch)" : null,
          requesterProfileId: req.profileId,
          targetRoleNodeId: node.id,
          joinAs: body.kind === "JOIN_BRANCH" ? body.joinAs : "MEMBER",
          courseId,
          message: body.message ?? null,
        },
      });

      // Boss call: place the course now and thank its home owners for the adoption.
      if (autoApproveCourse && adoptedCourse) {
        await db.coursePlacement.upsert({
          where: { courseId_roleNodeId: { courseId: adoptedCourse.id, roleNodeId: node.id } },
          create: {
            courseId: adoptedCourse.id,
            roleNodeId: node.id,
            mandatory: false,
            inheritToDescendants: false,
            placedByProfileId: req.profileId,
          },
          update: {},
        });
        // Notify the course's home-branch owners + creator (courtesy adoption note, from
        // the requester, auto-cleaned after 7 days like every notification)
        const homeOwners = await db.placement.findMany({
          where: { roleNodeId: adoptedCourse.uploaderRoleNodeId, kind: "OWNER" },
          include: { membership: true },
        });
        const requester = await db.profile.findUnique({ where: { id: req.profileId } });
        const recipients = new Set([
          ...homeOwners.map((o) => o.membership.profileId),
          adoptedCourse.createdByProfileId,
        ]);
        recipients.delete(req.profileId);
        await Promise.all(
          [...recipients].map((profileId) =>
            notify(profileId, orgId, "course_adopted", {
              code: adoptedCourse!.code,
              title: adoptedCourse!.title,
              roleName: node.name,
              from: requester?.displayName ?? "A manager",
              message:
                body.message?.trim() ||
                `Thank you for creating "${adoptedCourse!.title}" — it's now in use at ${node.name}.`,
            }),
          ),
        );
        // Nothing is left to decide, so nothing is left to store — the placement is the
        // record, and the adoption note is the receipt.
        await db.vaultRequest.delete({ where: { id: request.id } });
        broadcast(orgId, "requests");
        broadcast(orgId, "courses");
        return { ok: true, id: request.id, autoApproved: true };
      }

      // Tell the deciders. Course requests go ONLY to the branch's handler (nearest
      // level with an owner) — not every level up to the top. Deletions go to the
      // owners above; visibility to the owners of the topmost hidden level.
      let deciders: string[];
      if (body.kind === "COURSE_ASSIGN") {
        const handlerId = await courseHandlerNodeId(orgId, node.path);
        const handlerOwners = handlerId
          ? await db.placement.findMany({
              where: { roleNodeId: handlerId, kind: "OWNER" },
              include: { membership: true },
            })
          : [];
        deciders = [...new Set(handlerOwners.map((o) => o.membership.profileId))];
      } else {
        const deciderAnchor =
          body.kind === "VISIBILITY"
            ? ((await hiddenChainAbove(orgId, node.path))[0] ?? node)
            : node;
        deciders = await ownersAbove(orgId, deciderAnchor.path, body.kind !== "DELETE_BRANCH");
      }
      const requesterProfile = await db.profile.findUnique({ where: { id: req.profileId } });
      const who = requesterProfile?.displayName ?? "A member";
      await Promise.all(
        deciders
          .filter((id) => id !== req.profileId)
          .map((profileId) =>
            notify(
              profileId,
              orgId,
              "request_created",
              {
                requestId: request.id,
                kind: request.kind,
                label: REQUEST_KIND_LABELS[request.kind],
                roleName: node.name,
                from: who,
              },
              {
                subject: `${REQUEST_KIND_LABELS[request.kind]} — ${node.name}`,
                body:
                  `${who} filed a ${REQUEST_KIND_LABELS[request.kind].toLowerCase()} for “${node.name}”.` +
                  (body.message?.trim() ? ` They wrote: “${body.message.trim()}”` : "") +
                  " Open it to approve or decline.",
              },
            ),
          ),
      );
      broadcast(orgId, "requests");
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

      // Decided requests self-clean after 7 days — no clutter left in the database
      await db.vaultRequest.deleteMany({
        where: {
          orgId,
          status: { not: "PENDING" },
          decidedAt: { lt: new Date(Date.now() - DECIDED_RETENTION_MS) },
        },
      });

      const mineRows = await db.vaultRequest.findMany({
        where: { orgId, requesterProfileId: req.profileId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const pending = await db.vaultRequest.findMany({
        where: { orgId, status: "PENDING", requesterProfileId: { not: req.profileId } },
        orderBy: { createdAt: "asc" },
      });
      const allNodes = await db.roleNode.findMany({ where: { orgId } });
      const hiddenAbove = (nodePath: string) =>
        allNodes
          .filter((n) => n.parentId !== null && !n.isPublic && isStrictAncestor(n.path, nodePath))
          .sort((a, b) => a.path.length - b.path.length);
      const ownerNodeIds = new Set(
        (
          await db.placement.findMany({
            where: { kind: "OWNER", roleNode: { orgId } },
            select: { roleNodeId: true },
          })
        ).map((o) => o.roleNodeId),
      );
      // Course requests: decided only by owners ON the handler level, not every level up
      const handlerOf = (nodePath: string) =>
        allNodes
          .filter((n) => isSelfOrAncestor(n.path, nodePath))
          .sort((a, b) => b.path.length - a.path.length)
          .find((n) => ownerNodeIds.has(n.id))?.id ?? null;
      const decidable = pending.filter((r) => {
        const node = allNodes.find((n) => n.id === r.targetRoleNodeId);
        if (!node) return false;
        const ref = toRoleRef(node);
        if (r.kind === "DELETE_BRANCH") return can(placements, "delete_role", ref);
        if (r.kind === "JOIN_BRANCH")
          // A sub-owner request needs co-owner appointment rights, not just add-people
          return can(placements, r.joinAs === "OWNER" ? "add_co_owner" : "add_people", ref);
        if (r.kind === "VISIBILITY")
          return canDecideVisibility(placements, hiddenAbove(node.path), node);
        const handler = handlerOf(node.path); // COURSE_ASSIGN & CONTENT_REVIEW
        return handler !== null && placements.some((p) => p.kind === "OWNER" && p.roleNodeId === handler);
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

      const visibilityChain =
        request.kind === "VISIBILITY" ? await hiddenChainAbove(request.orgId, node.path) : [];
      const courseHandler =
        request.kind === "COURSE_ASSIGN" || request.kind === "CONTENT_REVIEW"
          ? await courseHandlerNodeId(request.orgId, node.path)
          : null;
      const allowed =
        request.kind === "DELETE_BRANCH"
          ? can(placements, "delete_role", ref)
          : request.kind === "JOIN_BRANCH"
            ? can(placements, request.joinAs === "OWNER" ? "add_co_owner" : "add_people", ref)
            : request.kind === "VISIBILITY"
              ? canDecideVisibility(placements, visibilityChain, node)
              : courseHandler !== null &&
                placements.some((p) => p.kind === "OWNER" && p.roleNodeId === courseHandler);
      if (!allowed) {
        return reply.status(403).send({ error: "You don't have authority over this request" });
      }

      if (body.approve) {
        if (request.kind === "JOIN_BRANCH") {
          const dup = await db.placement.findFirst({
            where: {
              roleNodeId: node.id,
              kind: request.joinAs,
              membership: { profileId: request.requesterProfileId },
            },
          });
          if (!dup) {
            // Plan member cap — a join approval that adds a brand-new member must fit.
            try {
              await assertMemberLimit(request.orgId, request.requesterProfileId);
            } catch (e) {
              return reply
                .status(403)
                .send({ error: e instanceof Error ? e.message : "Member limit reached" });
            }
            const membership = await db.membership.upsert({
              where: {
                profileId_orgId: { profileId: request.requesterProfileId, orgId: request.orgId },
              },
              create: { profileId: request.requesterProfileId, orgId: request.orgId },
              update: {},
            });
            // Sub-owners join with no delegation rights — the layer above grants
            // those explicitly afterwards
            await db.placement.create({
              data: {
                membershipId: membership.id,
                roleNodeId: node.id,
                kind: request.joinAs,
                addedByProfileId: req.profileId,
              },
            });
          }
        } else if (request.kind === "VISIBILITY") {
          // Unhide the whole chain above and publish the branch itself — hidden
          // inherits downward, so every hidden level must open for it to show.
          await db.roleNode.updateMany({
            where: { id: { in: [...visibilityChain.map((c) => c.id), node.id] } },
            data: { isPublic: true },
          });
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
          // COURSE_ASSIGN & CONTENT_REVIEW: the approving manager's configuration is required
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
          // A member's draft is published on approval — off draft, optionally into the library
          if (request.kind === "CONTENT_REVIEW" && course.draft) {
            await db.course.update({
              where: { id: course.id },
              data: { draft: false, inLibrary: body.config.inLibrary ?? course.inLibrary },
            });
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
      } else if (request.kind === "CONTENT_REVIEW" && request.courseId) {
        // Rejected draft: remove it entirely (its file/blocks + admin/review rows)
        const course = await db.course.findUnique({ where: { id: request.courseId } });
        if (course?.draft) {
          const sref = course.storageRef as { adapter?: string; fileId?: string; objectKey?: string };
          await db.$transaction([
            db.coursePrerequisite.deleteMany({
              where: { OR: [{ courseId: course.id }, { requiresCourseId: course.id }] },
            }),
            db.coursePlacement.deleteMany({ where: { courseId: course.id } }),
            db.courseAdminAccess.deleteMany({ where: { courseId: course.id } }),
            db.courseReview.deleteMany({ where: { courseId: course.id } }),
            db.examAttempt.deleteMany({ where: { courseId: course.id } }),
            ...deletionOpsFor(course.orgId, sref),
            db.course.delete({ where: { id: course.id } }),
          ]);
          drainSoon();
        }
      }

      // A decided request has done its job: the outcome now lives in the requester's
      // mailbox (with its own expiry) and in the audit log, so the row itself is deleted
      // instead of lingering as clutter. CONTENT_REVIEW keeps its published/rejected
      // wording so the author reads a real sentence rather than a status code.
      const decider = await db.profile.findUnique({ where: { id: req.profileId } });
      const label = REQUEST_KIND_LABELS[request.kind];
      const verdict = body.approve ? "approved" : "declined";
      const isReview = request.kind === "CONTENT_REVIEW";
      await notify(
        request.requesterProfileId,
        request.orgId,
        isReview ? (body.approve ? "content_published" : "content_rejected") : "request_decided",
        {
          requestId: request.id,
          kind: request.kind,
          label,
          roleName: node.name,
          approved: body.approve,
          note: body.decisionNote ?? null,
          by: decider?.displayName ?? "A manager",
        },
        {
          subject: isReview
            ? body.approve
              ? `Published — your document for ${node.name}`
              : `Not published — your document for ${node.name}`
            : `${label} ${verdict} — ${node.name}`,
          body:
            `${decider?.displayName ?? "A manager"} ${verdict} your ${label.toLowerCase()} for “${node.name}”.` +
            (body.decisionNote?.trim() ? ` They wrote: “${body.decisionNote.trim()}”` : ""),
        },
      );
      await db.vaultRequest.delete({ where: { id: request.id } });
      await audit(request.orgId, "request.decide", {
        actorProfileId: req.profileId,
        ip: req.ip,
        detail: { kind: request.kind, approved: body.approve, roleName: node.name },
      });
      broadcast(request.orgId, "requests");
      broadcast(
        request.orgId,
        request.kind === "COURSE_ASSIGN" || request.kind === "CONTENT_REVIEW"
          ? "courses"
          : "structure",
      );
      return { ok: true, status: body.approve ? "APPROVED" : "REJECTED" };
    },
  );

  // Delete a request: the requester clears their own (withdrawing if still pending),
  // and anyone with decision authority can clear entries from their inbox/history.
  app.delete<{ Params: { requestId: string } }>(
    "/requests/:requestId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const request = await db.vaultRequest.findUnique({ where: { id: req.params.requestId } });
      if (!request) return reply.status(404).send({ error: "Request not found" });

      if (request.requesterProfileId !== req.profileId) {
        const node = await db.roleNode.findUnique({ where: { id: request.targetRoleNodeId } });
        const placements = await actorPlacements(req.profileId, request.orgId);
        let allowed = false;
        if (node) {
          const ref = toRoleRef(node);
          if (request.kind === "DELETE_BRANCH") allowed = can(placements, "delete_role", ref);
          else if (request.kind === "JOIN_BRANCH")
            allowed = can(
              placements,
              request.joinAs === "OWNER" ? "add_co_owner" : "add_people",
              ref,
            );
          else if (request.kind === "VISIBILITY")
            allowed = canDecideVisibility(
              placements,
              await hiddenChainAbove(request.orgId, node.path),
              node,
            );
          else {
            const handler = await courseHandlerNodeId(request.orgId, node.path);
            allowed =
              handler !== null &&
              placements.some((p) => p.kind === "OWNER" && p.roleNodeId === handler);
          }
        } else {
          allowed = placements.some((p) => p.kind === "OWNER"); // orphaned row — any owner may clean it
        }
        if (!allowed) return reply.status(404).send({ error: "Request not found" });
      }

      // Withdrawing an undecided document review discards its draft course too
      if (request.kind === "CONTENT_REVIEW" && request.status === "PENDING" && request.courseId) {
        const course = await db.course.findUnique({ where: { id: request.courseId } });
        if (course?.draft) {
          const sref = course.storageRef as { adapter?: string; fileId?: string; objectKey?: string };
          await db.$transaction([
            db.coursePrerequisite.deleteMany({
              where: { OR: [{ courseId: course.id }, { requiresCourseId: course.id }] },
            }),
            db.coursePlacement.deleteMany({ where: { courseId: course.id } }),
            db.courseAdminAccess.deleteMany({ where: { courseId: course.id } }),
            db.courseReview.deleteMany({ where: { courseId: course.id } }),
            db.examAttempt.deleteMany({ where: { courseId: course.id } }),
            ...deletionOpsFor(course.orgId, sref),
            db.course.delete({ where: { id: course.id } }),
          ]);
          drainSoon();
        }
      }

      await db.vaultRequest.delete({ where: { id: request.id } });
      broadcast(request.orgId, "requests");
      return { ok: true };
    },
  );
}
