import type { FastifyInstance } from "fastify";
import {
  can,
  createCourseSchema,
  grantAdminAccessSchema,
  placeCourseSchema,
  updateCourseSchema,
  type CourseAdminView,
  type MyLearningView,
} from "@vault/shared";
import { db } from "../db.js";
import { storage, type StorageRef } from "../storage/adapter.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { coursesReaching, nextCourseCode, notify, toLearningItem } from "./helpers.js";

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
      if (!can(placements, "create_content", toRoleRef(node))) {
        return reply.status(403).send({ error: "You don't create content in this layer" });
      }

      let ref: StorageRef;
      if (body.url) {
        ref = await storage.saveLink(body.url);
      } else if (body.fileBase64 && body.filename && body.mime) {
        ref = await storage.saveInline(node.orgId, body.filename, body.mime, body.fileBase64);
      } else {
        return reply.status(400).send({ error: "Provide either a url or a file" });
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
          storageRef: ref as object,
          deadlineDays: body.deadlineDays,
          retakeEveryNDays: body.retakeEveryNDays,
          resetsCompletionOnUpdate: body.resetsCompletionOnUpdate,
          prerequisites: {
            create: prereqs.map((p) => ({ requiresCourseId: p.id })),
          },
        },
      });
      return { code: course.code, id: course.id };
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
      const prereqs = await db.coursePrerequisite.findMany({
        where: { courseId: course.id },
        include: { requires: true },
      });
      return {
        code: course.code,
        title: course.title,
        kind: course.kind,
        version: course.version,
        deadlineDays: course.deadlineDays,
        retakeEveryNDays: course.retakeEveryNDays,
        prerequisiteCodes: prereqs.map((p) => p.requires.code),
      };
    },
  );

  // Open the actual content (link URL or inline file)
  app.get<{ Params: { code: string } }>(
    "/courses/:code/content",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const course = await courseByCode(req.params.code);
      if (!course) return reply.status(404).send({ error: "Course not found" });
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Course not found" });

      const content = await storage.resolve(course.storageRef as unknown as StorageRef);
      if (content.url) return { url: content.url };
      reply
        .header("content-type", content.file!.mime)
        .header("content-disposition", `inline; filename="${content.file!.filename}"`);
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
      const dup = await db.coursePlacement.findUnique({
        where: { courseId_roleNodeId: { courseId: course.id, roleNodeId: node.id } },
      });
      if (dup) return reply.status(409).send({ error: "Already placed on this role" });

      await db.coursePlacement.create({
        data: {
          courseId: course.id,
          roleNodeId: node.id,
          mandatory: body.mandatory,
          inheritToDescendants: body.inheritToDescendants,
          placedByProfileId: req.profileId,
        },
      });
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

      const validUntil = course.retakeEveryNDays
        ? new Date(Date.now() + course.retakeEveryNDays * 86400_000)
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
      return { ok: true, validUntil: validUntil?.toISOString() ?? null };
    },
  );

  // Modify content — version bump; reset flag expires old completions (docs/structure.md §5.7)
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
      if (body.url) ref = await storage.saveLink(body.url);
      else if (body.fileBase64 && body.filename && body.mime) {
        ref = await storage.saveInline(course.orgId, body.filename, body.mime, body.fileBase64);
      }

      const updated = await db.course.update({
        where: { id: course.id },
        data: {
          title: body.title ?? course.title,
          storageRef: ref as object,
          version: { increment: 1 },
        },
      });

      if (course.resetsCompletionOnUpdate) {
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
      return { ok: true, version: updated.version };
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
          return { email: p.email, displayName: p.displayName, level: g.level, canGrant: g.canGrant };
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
      const target = await db.profile.findUnique({ where: { email: body.email.toLowerCase() } });
      if (!target) return reply.status(404).send({ error: "No profile with this email" });
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
