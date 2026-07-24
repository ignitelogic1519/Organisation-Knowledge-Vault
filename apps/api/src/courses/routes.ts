import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  can,
  canProposeContent,
  createCourseSchema,
  grantAdminAccessSchema,
  placeCourseSchema,
  reviewCourseSchema,
  updateCourseSchema,
  type CourseAdminView,
  type MyLearningView,
} from "@vault/shared";
import { db } from "../db.js";
import { broadcast } from "../events.js";
import { audit, sanitizeBlocks } from "../security.js";
import { storage, type StorageRef } from "../storage/adapter.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import {
  courseHandlerNodeId,
  coursesReaching,
  nextCourseCode,
  notify,
  toLearningItem,
} from "./helpers.js";

async function courseByCode(code: string) {
  return db.course.findUnique({ where: { code }, include: { org: true } });
}

/** VIEW/EDIT level on the course admin page — creator has implicit EDIT+grant. */
async function adminLevel(profileId: string, courseId: string, createdBy: string) {
  if (profileId === createdBy) return { level: "EDIT" as const, canGrant: true };
  const row = await db.courseAdminAccess.findUnique({
    where: { courseId_profileId: { courseId, profileId } },
  });
  return row ? { level: row.level, canGrant: row.canGrant } : null;
}

/**
 * May the actor manage (edit / archive / delete) this course? True for anyone with EDIT
 * admin access AND for owners governing the course's home branch — i.e. the branch owner
 * where it lives and every owner above it (structure.md: authority flows down). This is
 * what lets "the owner or the top branch owners" delete a course they no longer need.
 */
async function canManageCourse(
  profileId: string,
  course: { id: string; createdByProfileId: string; orgId: string; uploaderRoleNodeId: string },
): Promise<boolean> {
  const access = await adminLevel(profileId, course.id, course.createdByProfileId);
  if (access?.level === "EDIT") return true;
  const homeNode = await db.roleNode.findUnique({ where: { id: course.uploaderRoleNodeId } });
  if (!homeNode) return false;
  const placements = await actorPlacements(profileId, course.orgId);
  return can(placements, "create_content", toRoleRef(homeNode));
}

export async function courseRoutes(app: FastifyInstance) {
  // Upload/create a knowledge item — code minted as <org>-<role>-<item>
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/courses",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = createCourseSchema.parse(req.body);
      const node = await db.roleNode.findUnique({
        where: { id: body.roleNodeId },
        include: { org: true },
      });
      if (!node || node.orgId !== req.params.id || node.org.deletedAt) {
        return reply.status(404).send({ error: "Role not found" });
      }
      const placements = await actorPlacements(req.profileId, node.orgId);
      const canPublish = can(placements, "create_content", toRoleRef(node));
      const canPropose = canProposeContent(placements, toRoleRef(node));
      if (!canPublish && !canPropose) {
        return reply.status(403).send({ error: "You don't create content in this layer" });
      }
      // A member's content is a DRAFT that a manager must review before it publishes.
      const asDraft = !canPublish;

      let ref: StorageRef;
      if (body.blocks) {
        ref = await storage.saveAuthored(sanitizeBlocks(body.blocks));
      } else if (body.url) {
        ref = await storage.saveLink(body.url);
      } else if (body.fileBase64 && body.filename && body.mime) {
        ref = await storage.saveInline(node.orgId, body.filename, body.mime, body.fileBase64);
      } else {
        return reply.status(400).send({ error: "Provide a file, a url, or authored content" });
      }

      // Hard prerequisites must exist inside the same org
      const prereqs = await db.course.findMany({
        where: { code: { in: body.prerequisiteCodes }, orgId: node.orgId },
      });
      if (prereqs.length !== body.prerequisiteCodes.length) {
        return reply.status(400).send({ error: "Unknown prerequisite course code" });
      }

      const code = await nextCourseCode(node);
      const course = await db.course.create({
        data: {
          orgId: node.orgId,
          code,
          uploaderRoleNodeId: node.id,
          createdByProfileId: req.profileId,
          kind: body.kind,
          title: body.title,
          description: body.description,
          scope: body.scope?.trim() ? body.scope.trim() : null,
          classification: body.classification,
          allowDownload: body.allowDownload,
          // A draft is never in the library and reaches nobody until it's approved
          inLibrary: asDraft ? false : body.inLibrary,
          draft: asDraft,
          category: body.category?.trim() ? body.category.trim() : null,
          storageRef: ref as object,
          deadlineDays: body.deadlineDays,
          retakeEveryNDays: body.retakeEveryNDays,
          resetsCompletionOnUpdate: body.resetsCompletionOnUpdate,
          prerequisites: {
            create: prereqs.map((p) => ({ requiresCourseId: p.id })),
          },
        },
      });

      if (asDraft) {
        // File a Document-review request to the branch's handler (nearest owner level)
        const req0 = await db.vaultRequest.create({
          data: {
            orgId: node.orgId,
            kind: "CONTENT_REVIEW",
            requesterProfileId: req.profileId,
            targetRoleNodeId: node.id,
            courseId: course.id,
            message: body.description,
          },
        });
        const handlerId = await courseHandlerNodeId(node.orgId, node.path);
        const handlerOwners = handlerId
          ? await db.placement.findMany({
              where: { roleNodeId: handlerId, kind: "OWNER" },
              include: { membership: true },
            })
          : [];
        const requester = await db.profile.findUnique({ where: { id: req.profileId } });
        await Promise.all(
          [...new Set(handlerOwners.map((o) => o.membership.profileId))]
            .filter((id) => id !== req.profileId)
            .map((profileId) =>
              notify(profileId, node.orgId, "request_created", {
                requestId: req0.id,
                kind: "CONTENT_REVIEW",
                label: "Document review",
                roleName: node.name,
                from: requester?.displayName ?? "A member",
                title: course.title,
              }),
            ),
        );
        broadcast(node.orgId, "requests");
        return { code: course.code, id: course.id, draft: true };
      }

      broadcast(node.orgId, "courses");
      return { code: course.code, id: course.id, draft: false };
    },
  );

  // Resolve a course by its platform-unique code (org members only)
  app.get<{ Params: { code: string } }>(
    "/courses/:code",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });
      if (course.draft && course.createdByProfileId !== req.profileId) {
        if (!(await canManageCourse(req.profileId, course))) {
          return reply.status(404).send({ error: "Course not found" });
        }
      }
      const prereqs = await db.coursePrerequisite.findMany({
        where: { courseId: course.id },
        include: { requires: true },
      });
      const creator = await db.profile.findUnique({ where: { id: course.createdByProfileId } });
      return {
        code: course.code,
        title: course.title,
        kind: course.kind,
        version: course.version,
        deadlineDays: course.deadlineDays,
        retakeEveryNDays: course.retakeEveryNDays,
        prerequisiteCodes: prereqs.map((p) => p.requires.code),
        description: course.description,
        scope: course.scope,
        classification: course.classification,
        allowDownload: course.allowDownload,
        publishedAt: course.createdAt.toISOString(),
        creatorName: creator?.displayName ?? "—",
        draft: course.draft,
      };
    },
  );

  // Open the actual content (link URL, inline file, or authored blocks).
  // ?download=1 serves the file as an attachment — only when the owner allowed it.
  app.get<{ Params: { code: string }; Querystring: { download?: string } }>(
    "/courses/:code/content",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });
      // A draft is visible only to its creator and the branch's reviewers (for preview)
      if (course.draft && course.createdByProfileId !== req.profileId) {
        if (!(await canManageCourse(req.profileId, course))) {
          return reply.status(404).send({ error: "Course not found" });
        }
      }

      const content = await storage.resolve(course.storageRef as unknown as StorageRef);
      if (content.authored !== undefined) {
        // Native rendering by the viewer inside the standardized document frame
        return { authored: content.authored };
      }
      if (content.url) return { url: content.url };

      const wantsDownload = req.query.download === "1";
      if (wantsDownload && !course.allowDownload) {
        return reply
          .status(403)
          .send({ error: "The owner has not enabled downloads for this document" });
      }
      const disposition = wantsDownload ? "attachment" : "inline";
      // Harden inline serving: an uploaded HTML/SVG must never run with our privileges.
      // A locked-down CSP, no MIME sniffing, and frame limits neutralize stored-content XSS.
      reply
        .header("content-type", content.file!.mime)
        .header("content-disposition", `${disposition}; filename="${content.file!.filename}"`)
        .header("content-security-policy", "default-src 'none'; img-src data: blob:; media-src blob: data:; style-src 'unsafe-inline'; sandbox")
        .header("x-content-type-options", "nosniff")
        .header("x-frame-options", "SAMEORIGIN")
        .header("referrer-policy", "no-referrer");
      return reply.send(content.file!.data);
    },
  );

  // Place a course into a branch by code — no approval needed (docs/structure.md §3.2)
  app.post<{ Params: { code: string } }>(
    "/courses/:code/placements",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = placeCourseSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const node = await db.roleNode.findUnique({ where: { id: body.roleNodeId } });
      if (!node || node.orgId !== course.orgId) {
        return reply.status(404).send({ error: "Role not found in the course's organization" });
      }
      const placements = await actorPlacements(req.profileId, course.orgId);
      if (!can(placements, "create_content", toRoleRef(node))) {
        return reply.status(403).send({ error: "You don't manage content in that layer" });
      }
      // Archived courses reach nobody new — but an existing placement may still be
      // reconfigured (e.g. to make it opt-in before removal).
      const alreadyPlaced = await db.coursePlacement.findUnique({
        where: { courseId_roleNodeId: { courseId: course.id, roleNodeId: node.id } },
      });
      if (course.archived && !alreadyPlaced) {
        return reply
          .status(409)
          .send({ error: "This course is archived — unarchive it before assigning it anew" });
      }
      // Placing twice reconfigures — mandatory/inheritance/override toggles come here too
      await db.coursePlacement.upsert({
        where: { courseId_roleNodeId: { courseId: course.id, roleNodeId: node.id } },
        create: {
          courseId: course.id,
          roleNodeId: node.id,
          mandatory: body.mandatory,
          inheritToDescendants: body.inheritToDescendants,
          deadlineDays: body.deadlineDays ?? null,
          retakeEveryNDays: body.retakeEveryNDays ?? null,
          placedByProfileId: req.profileId,
        },
        update: {
          mandatory: body.mandatory,
          inheritToDescendants: body.inheritToDescendants,
          ...(body.deadlineDays !== undefined ? { deadlineDays: body.deadlineDays } : {}),
          ...(body.retakeEveryNDays !== undefined
            ? { retakeEveryNDays: body.retakeEveryNDays }
            : {}),
        },
      });
      broadcast(course.orgId, "courses");
      return { ok: true };
    },
  );

  // My Learning (docs/structure.md §6)
  app.get<{ Params: { id: string } }>(
    "/orgs/:id/my-learning",
    { preHandler: app.authenticate },
    async (req, reply): Promise<MyLearningView> => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });
      const reaching = await coursesReaching(req.profileId, req.params.id);
      const items = await Promise.all(reaching.map((r) => toLearningItem(req.profileId, r)));
      return {
        orgId: req.params.id,
        mandatory: items.filter((i) => i.mandatory),
        optIn: items.filter((i) => !i.mandatory),
      };
    },
  );

  // Mark complete (v1 manual completion; prerequisites hard-block)
  app.post<{ Params: { code: string } }>(
    "/courses/:code/complete",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const reaching = await coursesReaching(req.profileId, course.orgId);
      const reach = reaching.find((r) => r.course.id === course.id);
      if (!reach) return reply.status(403).send({ error: "This course isn't assigned or available to you" });

      const item = await toLearningItem(req.profileId, reach);
      if (item.missingPrerequisites.length > 0) {
        return reply.status(409).send({
          error: `Complete the prerequisite course(s) first: ${item.missingPrerequisites.join(", ")}`,
        });
      }

      const validUntil = reach.retakeEveryNDays
        ? new Date(Date.now() + reach.retakeEveryNDays * 86400_000)
        : null;
      const existing = await db.completionRecord.findFirst({
        where: { profileId: req.profileId, courseId: course.id },
      });
      const data = {
        status: "COMPLETED" as const,
        completedAt: new Date(),
        validUntil,
        courseVersion: course.version,
      };
      if (existing) {
        await db.completionRecord.update({ where: { id: existing.id }, data });
      } else {
        await db.completionRecord.create({
          data: {
            ...data,
            courseId: course.id,
            courseCode: course.code,
            profileId: req.profileId,
            orgId: course.orgId,
          },
        });
      }
      broadcast(course.orgId, "courses");
      return { ok: true, validUntil: validUntil?.toISOString() ?? null };
    },
  );

  // Modify a course — metadata and/or content. A content change (new file/url/blocks)
  // bumps the version; the reset flag then expires old completions (structure.md §5.7).
  app.patch<{ Params: { code: string } }>(
    "/courses/:code",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = updateCourseSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const access = await adminLevel(req.profileId, course.id, course.createdByProfileId);
      if (access?.level !== "EDIT") {
        return reply.status(403).send({ error: "Edit access to this course is required" });
      }

      let ref = course.storageRef as unknown as StorageRef;
      let contentChanged = false;
      if (body.blocks) {
        ref = await storage.saveAuthored(sanitizeBlocks(body.blocks));
        contentChanged = true;
      } else if (body.url) {
        ref = await storage.saveLink(body.url);
        contentChanged = true;
      } else if (body.fileBase64 && body.filename && body.mime) {
        ref = await storage.saveInline(course.orgId, body.filename, body.mime, body.fileBase64);
        contentChanged = true;
      }

      const updated = await db.course.update({
        where: { id: course.id },
        data: {
          title: body.title ?? course.title,
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.scope !== undefined ? { scope: body.scope } : {}),
          ...(body.category !== undefined
            ? { category: body.category?.trim() ? body.category.trim() : null }
            : {}),
          ...(body.classification !== undefined ? { classification: body.classification } : {}),
          ...(body.allowDownload !== undefined ? { allowDownload: body.allowDownload } : {}),
          storageRef: ref as object,
          ...(contentChanged ? { version: { increment: 1 } } : {}),
        },
      });

      if (contentChanged && course.resetsCompletionOnUpdate) {
        const outdated = await db.completionRecord.findMany({
          where: { courseId: course.id, status: "COMPLETED", courseVersion: { lt: updated.version } },
        });
        for (const rec of outdated) {
          await db.completionRecord.update({
            where: { id: rec.id },
            data: { status: "EXPIRED" },
          });
          await notify(rec.profileId, course.orgId, "course_updated_redo", {
            code: course.code,
            title: updated.title,
          });
        }
      }
      broadcast(course.orgId, "courses");
      return { ok: true, version: updated.version };
    },
  );

  // Archive / unarchive a course — archived courses stay in the library (badged) and keep
  // their history, but new placements are refused so they reach nobody new.
  app.post<{ Params: { code: string } }>(
    "/courses/:code/archive",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      if (!(await canManageCourse(req.profileId, course))) {
        return reply
          .status(403)
          .send({ error: "Only the course's editors or its branch owners can archive it" });
      }
      await db.course.update({ where: { id: course.id }, data: { archived } });
      broadcast(course.orgId, "courses");
      return { ok: true, archived };
    },
  );

  // Course admin page: usage everywhere + separate 2-layer access tree (docs/structure.md §3.3)
  app.get<{ Params: { code: string } }>(
    "/courses/:code/admin",
    { preHandler: app.authenticate },
    async (req, reply): Promise<CourseAdminView> => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const access = await adminLevel(req.profileId, course.id, course.createdByProfileId);
      if (!access) return reply.status(403).send({ error: "No access to this course's admin page" });

      const usage = await db.coursePlacement.findMany({ where: { courseId: course.id } });
      const nodes = await db.roleNode.findMany({
        where: { id: { in: usage.map((u) => u.roleNodeId) } },
      });
      const grants = await db.courseAdminAccess.findMany({ where: { courseId: course.id } });
      const profiles = await db.profile.findMany({
        where: { id: { in: grants.map((g) => g.profileId) } },
      });
      const prereqs = await db.coursePrerequisite.findMany({
        where: { courseId: course.id },
        include: { requires: true },
      });
      const completions = await db.completionRecord.findMany({ where: { courseId: course.id } });

      return {
        course: {
          code: course.code,
          title: course.title,
          kind: course.kind,
          version: course.version,
          deadlineDays: course.deadlineDays,
          retakeEveryNDays: course.retakeEveryNDays,
          prerequisiteCodes: prereqs.map((p) => p.requires.code),
          createdAt: course.createdAt.toISOString(),
          resetsCompletionOnUpdate: course.resetsCompletionOnUpdate,
        },
        usage: usage.map((u) => {
          const n = nodes.find((x) => x.id === u.roleNodeId)!;
          return {
            roleName: n.name,
            roleNumber: n.roleNumber,
            mandatory: u.mandatory,
            inheritToDescendants: u.inheritToDescendants,
          };
        }),
        access: grants.map((g) => {
          const p = profiles.find((x) => x.id === g.profileId)!;
          return { username: p.username, displayName: p.displayName, level: g.level, canGrant: g.canGrant };
        }),
        myLevel: access.level,
        completions: {
          total: completions.length,
          completed: completions.filter((c) => c.status === "COMPLETED").length,
          expired: completions.filter((c) => c.status === "EXPIRED").length,
        },
      };
    },
  );

  // Courses placed on a node — for the node's managers (feeds the tree UI)
  app.get<{ Params: { roleId: string } }>(
    "/roles/:roleId/courses",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });
      const placements = await actorPlacements(req.profileId, node.orgId);
      if (!can(placements, "create_content", toRoleRef(node))) {
        return reply.status(403).send({ error: "You don't manage content in this layer" });
      }
      const rows = await db.coursePlacement.findMany({
        where: { roleNodeId: node.id },
        include: { course: true },
        orderBy: { createdAt: "asc" },
      });
      return {
        courses: await Promise.all(
          rows.map(async (r) => {
            const manage = await canManageCourse(req.profileId, r.course);
            return {
              code: r.course.code,
              title: r.course.title,
              kind: r.course.kind,
              description: r.course.description,
              classification: r.course.classification,
              inLibrary: r.course.inLibrary,
              archived: r.course.archived,
              allowDownload: r.course.allowDownload,
              mandatory: r.mandatory,
              inheritToDescendants: r.inheritToDescendants,
              deadlineDays: r.deadlineDays ?? r.course.deadlineDays,
              retakeEveryNDays: r.retakeEveryNDays ?? r.course.retakeEveryNDays,
              canManage: manage,
              canDelete: manage,
            };
          }),
        ),
      };
    },
  );

  // Remove a placement from one branch — completion records are kept (history rule D4-3)
  app.delete<{ Params: { code: string; roleNodeId: string } }>(
    "/courses/:code/placements/:roleNodeId",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const node = await db.roleNode.findUnique({ where: { id: req.params.roleNodeId } });
      if (!node || node.orgId !== course.orgId) {
        return reply.status(404).send({ error: "Placement not found" });
      }
      const placements = await actorPlacements(req.profileId, course.orgId);
      if (!can(placements, "create_content", toRoleRef(node))) {
        return reply.status(403).send({ error: "You don't manage content in that layer" });
      }
      await db.coursePlacement.deleteMany({
        where: { courseId: course.id, roleNodeId: node.id },
      });
      broadcast(course.orgId, "courses");
      return { ok: true };
    },
  );

  // Delete a course everywhere — the course's editors OR the owners of its home branch
  // (and above) may delete it. Completion records survive (keyed by the never-reused
  // course code); prerequisite links pointing at it are released.
  app.delete<{ Params: { code: string } }>(
    "/courses/:code",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      if (!(await canManageCourse(req.profileId, course))) {
        return reply
          .status(403)
          .send({ error: "Only the course's editors or its branch owners can delete it" });
      }

      const releasedPrereqs = await db.coursePrerequisite.count({
        where: { requiresCourseId: course.id },
      });
      const ref = course.storageRef as unknown as { adapter?: string; fileId?: string };
      await db.$transaction([
        db.coursePrerequisite.deleteMany({
          where: { OR: [{ courseId: course.id }, { requiresCourseId: course.id }] },
        }),
        db.coursePlacement.deleteMany({ where: { courseId: course.id } }),
        db.courseAdminAccess.deleteMany({ where: { courseId: course.id } }),
        db.courseReview.deleteMany({ where: { courseId: course.id } }),
        ...(ref.adapter === "inline" && ref.fileId
          ? [db.storedFile.deleteMany({ where: { id: ref.fileId } })]
          : []),
        db.course.delete({ where: { id: course.id } }),
      ]);
      await audit(course.orgId, "course.delete", {
        actorProfileId: req.profileId,
        ip: req.ip,
        detail: { code: course.code, title: course.title },
      });
      broadcast(course.orgId, "courses");
      return { ok: true, releasedPrerequisiteLinks: releasedPrereqs };
    },
  );

  // The organization library: every member can browse courses published to it.
  // Each entry carries the signals the detail view needs — description, completions,
  // and the branches currently using it.
  app.get<{ Params: { id: string }; Querystring: { q?: string } }>(
    "/orgs/:id/library",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });

      const q = (req.query.q ?? "").trim().toLowerCase();
      const list = await db.course.findMany({
        where: { orgId: req.params.id, inLibrary: true },
        include: { placements: true },
        orderBy: { createdAt: "desc" },
      });
      const filtered = q
        ? list.filter(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              (c.description ?? "").toLowerCase().includes(q) ||
              (c.category ?? "").toLowerCase().includes(q) ||
              c.code.includes(q),
          )
        : list;

      const nodeIds = [...new Set(filtered.flatMap((c) => [c.uploaderRoleNodeId, ...c.placements.map((p) => p.roleNodeId)]))];
      const nodes = await db.roleNode.findMany({ where: { id: { in: nodeIds } } });
      const completions = await db.completionRecord.groupBy({
        by: ["courseId"],
        where: { courseId: { in: filtered.map((c) => c.id) }, status: "COMPLETED" },
        _count: true,
      });
      const ratings = await db.courseReview.groupBy({
        by: ["courseId"],
        where: { courseId: { in: filtered.map((c) => c.id) }, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      });

      return {
        courses: filtered.map((c) => {
          const rating = ratings.find((r) => r.courseId === c.id);
          return {
            code: c.code,
            title: c.title,
            kind: c.kind,
            description: c.description,
            category: c.category,
            classification: c.classification,
            archived: c.archived,
            uploaderRoleName: nodes.find((n) => n.id === c.uploaderRoleNodeId)?.name ?? "—",
            createdAt: c.createdAt.toISOString(),
            completedCount: completions.find((x) => x.courseId === c.id)?._count ?? 0,
            usedIn: c.placements
              .map((p) => nodes.find((n) => n.id === p.roleNodeId)?.name)
              .filter((n): n is string => Boolean(n)),
            avgRating: rating?._avg.rating ? Math.round(rating._avg.rating * 10) / 10 : null,
            ratingCount: rating?._count.rating ?? 0,
          };
        }),
      };
    },
  );

  // Category suggestion: matches the new course's words against existing shelves so
  // similar content lands on the same shelf ("AI AWS doc" → suggests "AI"). The
  // uploader can always override.
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/library/suggest-category",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: req.params.id } },
      });
      if (!member) return reply.status(404).send({ error: "Organization not found" });
      const { title, description } = z
        .object({ title: z.string().default(""), description: z.string().default("") })
        .parse(req.body ?? {});

      const courses = await db.course.findMany({
        where: { orgId: req.params.id, category: { not: null } },
        select: { category: true, title: true, description: true },
      });
      const categories = [...new Set(courses.map((c) => c.category!))];

      const tokenize = (s: string) =>
        new Set(
          s
            .toLowerCase()
            .split(/[^a-z0-9+#]+/)
            .filter((w) => w.length > 1),
        );
      const inputTokens = tokenize(`${title} ${description}`);

      // Score each shelf: direct name mention weighs most, then word overlap with the
      // shelf's existing content
      let best: { category: string; score: number } | null = null;
      for (const category of categories) {
        let score = 0;
        for (const t of tokenize(category)) {
          if (inputTokens.has(t)) score += 5;
        }
        for (const c of courses.filter((x) => x.category === category)) {
          for (const t of tokenize(`${c.title} ${c.description ?? ""}`)) {
            if (inputTokens.has(t)) score += 1;
          }
        }
        if (score > 0 && (!best || score > best.score)) best = { category, score };
      }
      return { suggestion: best?.category ?? null, categories };
    },
  );

  // Reviews: visible to every member on the library detail view
  app.get<{ Params: { code: string } }>(
    "/courses/:code/reviews",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });

      const rows = await db.courseReview.findMany({
        where: { courseId: course.id },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      const profiles = await db.profile.findMany({
        where: { id: { in: rows.map((r) => r.profileId) } },
      });
      const rated = rows.filter((r) => r.rating !== null);
      return {
        reviews: rows.map((r) => {
          const p = profiles.find((x) => x.id === r.profileId);
          return {
            displayName: p?.displayName ?? "Former member",
            username: p?.username ?? "unknown",
            rating: r.rating,
            comment: r.comment,
            updatedAt: r.updatedAt.toISOString(),
          };
        }),
        avgRating: rated.length
          ? Math.round((rated.reduce((s, r) => s + r.rating!, 0) / rated.length) * 10) / 10
          : null,
        count: rated.length,
        mine: rows.find((r) => r.profileId === req.profileId)
          ? {
              rating: rows.find((r) => r.profileId === req.profileId)!.rating,
              comment: rows.find((r) => r.profileId === req.profileId)!.comment,
            }
          : null,
      };
    },
  );

  // Rate & comment — only after completing the course; rating stays optional
  app.post<{ Params: { code: string } }>(
    "/courses/:code/review",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = reviewCourseSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const completed = await db.completionRecord.findFirst({
        where: { courseId: course.id, profileId: req.profileId, status: "COMPLETED" },
      });
      if (!completed) {
        return reply
          .status(403)
          .send({ error: "Complete the course before rating or reviewing it" });
      }
      await db.courseReview.upsert({
        where: { courseId_profileId: { courseId: course.id, profileId: req.profileId } },
        create: {
          courseId: course.id,
          profileId: req.profileId,
          rating: body.rating ?? null,
          comment: body.comment?.trim() ? body.comment.trim() : null,
        },
        update: {
          rating: body.rating ?? null,
          comment: body.comment?.trim() ? body.comment.trim() : null,
        },
      });
      broadcast(course.orgId, "courses");
      return { ok: true };
    },
  );

  // Grant admin-page access (2-layer: only creator or canGrant holders may grant)
  app.post<{ Params: { code: string } }>(
    "/courses/:code/admin/access",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = grantAdminAccessSchema.parse(req.body);
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const access = await adminLevel(req.profileId, course.id, course.createdByProfileId);
      if (!access?.canGrant) {
        return reply.status(403).send({ error: "You cannot grant access to this page" });
      }
      const target = await db.profile.findUnique({ where: { username: body.username.toLowerCase() } });
      if (!target) return reply.status(404).send({ error: "No profile with this username" });
      // Layer 2 cannot mint further granters — keeps the tree at two layers
      const canGrant = req.profileId === course.createdByProfileId ? body.canGrant : false;
      await db.courseAdminAccess.upsert({
        where: { courseId_profileId: { courseId: course.id, profileId: target.id } },
        create: {
          courseId: course.id,
          profileId: target.id,
          level: body.level,
          canGrant,
          grantedBy: req.profileId,
        },
        update: { level: body.level, canGrant },
      });
      return { ok: true };
    },
  );
}
