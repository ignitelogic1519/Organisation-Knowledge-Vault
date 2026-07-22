import { verify as argonVerify, hash as argonHash } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { can } from "@vault/shared";
import { db } from "../db.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { requireSupreme, auditSupreme } from "../orgs/supreme.js";
import { purgeOrganization } from "../orgs/purge.js";
import { openContainer, readHeader, sealContainer, structureFingerprint } from "./container.js";

// .main / .bkp / deletion lifecycle — docs/structure.md §4.3 & §5.

const uploadSchema = z.object({
  fileBase64: z.string().min(10),
  password: z.string().min(1),
});

interface MainPayload {
  org: { name: string; orgNumber: number; supremeHash: string; nextRoleNumber: number };
  roles: {
    id: string;
    parentId: string | null;
    name: string;
    roleNumber: number;
    isPublic: boolean;
    path: string;
    nextItemNumber: number;
  }[];
  people: { profileId: string; username: string; displayName: string }[];
  placements: {
    profileId: string;
    roleNodeId: string;
    kind: "OWNER" | "MEMBER";
    canCreateSubgroups: boolean;
    canAddCoOwners?: boolean;
    addedByProfileId: string;
  }[];
  courses: Record<string, unknown>[];
  coursePlacements: Record<string, unknown>[];
  prerequisites: { courseId: string; requiresCourseId: string }[];
  completions: Record<string, unknown>[];
}

async function buildMainPayload(orgId: string): Promise<MainPayload> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } });
  const roles = await db.roleNode.findMany({ where: { orgId } });
  const memberships = await db.membership.findMany({
    where: { orgId },
    include: { profile: true, placements: true },
  });
  const courses = await db.course.findMany({ where: { orgId } });
  const coursePlacements = await db.coursePlacement.findMany({
    where: { course: { orgId } },
  });
  const prerequisites = await db.coursePrerequisite.findMany({
    where: { course: { orgId } },
  });
  const completions = await db.completionRecord.findMany({ where: { orgId } });

  return {
    org: {
      name: org.name,
      orgNumber: org.orgNumber,
      supremeHash: org.supremeHash,
      nextRoleNumber: org.nextRoleNumber,
    },
    roles: roles.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      roleNumber: r.roleNumber,
      isPublic: r.isPublic,
      path: r.path,
      nextItemNumber: r.nextItemNumber,
    })),
    people: memberships.map((m) => ({
      profileId: m.profileId,
      username: m.profile.username,
      displayName: m.profile.displayName,
    })),
    placements: memberships.flatMap((m) =>
      m.placements.map((p) => ({
        profileId: m.profileId,
        roleNodeId: p.roleNodeId,
        kind: p.kind,
        canCreateSubgroups: p.canCreateSubgroups,
        canAddCoOwners: p.canAddCoOwners,
        addedByProfileId: p.addedByProfileId,
      })),
    ),
    courses: courses.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    coursePlacements: coursePlacements.map((cp) => ({ ...cp, createdAt: cp.createdAt.toISOString() })),
    prerequisites,
    completions: completions.map((c) => ({
      ...c,
      completedAt: c.completedAt?.toISOString() ?? null,
      validUntil: c.validUntil?.toISOString() ?? null,
    })),
  };
}

export async function vaultFileRoutes(app: FastifyInstance) {
  // Download .main — Supreme-gated; password re-checked so the file key matches it
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/export-main",
    { preHandler: [app.authenticate, requireSupreme] },
    async (req, reply) => {
      const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
      const org = await db.organization.findFirst({
        where: { id: req.params.id, deletedAt: null },
      });
      if (!org) return reply.status(404).send({ error: "Organization not found" });
      if (!(await argonVerify(org.supremeHash, password))) {
        return reply.status(401).send({ error: "Wrong Supreme password" });
      }

      const payload = await buildMainPayload(org.id);
      const file = sealContainer(password, { scope: "main", orgNumber: org.orgNumber }, payload);
      await auditSupreme(org.id, "main_exported", { actorProfileId: req.profileId, ip: req.ip });


      reply
        .header("content-type", "application/octet-stream")
        .header("content-disposition", `attachment; filename="${org.name.replace(/[^\w-]/g, "_")}.main"`);
      return reply.send(file);
    },
  );

  // Delete the organization — Supreme-gated soft delete with 30-day retention
  app.delete<{ Params: { id: string } }>(
    "/orgs/:id",
    { preHandler: [app.authenticate, requireSupreme] },
    async (req, reply) => {
      const org = await db.organization.findFirst({
        where: { id: req.params.id, deletedAt: null },
      });
      if (!org) return reply.status(404).send({ error: "Organization not found" });

      await db.organization.update({ where: { id: org.id }, data: { deletedAt: new Date() } });
      await auditSupreme(org.id, "org_deleted", { actorProfileId: req.profileId, ip: req.ip });

      return {
        ok: true,
        retainedUntil: new Date(Date.now() + 30 * 86400_000).toISOString(),
      };
    },
  );

  // Restore a soft-deleted org within the 30-day window (Supreme password, no file needed)
  app.post<{ Params: { id: string } }>(
    "/orgs/:id/undelete",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { password } = z.object({ password: z.string().min(1) }).parse(req.body);
      const org = await db.organization.findFirst({
        where: { id: req.params.id, deletedAt: { not: null } },
      });
      if (!org) return reply.status(404).send({ error: "No deleted organization found" });
      if (!(await argonVerify(org.supremeHash, password))) {
        return reply.status(401).send({ error: "Wrong Supreme password" });
      }
      await db.organization.update({ where: { id: org.id }, data: { deletedAt: null } });
      await auditSupreme(org.id, "org_undeleted", { actorProfileId: req.profileId, ip: req.ip });
      return { ok: true };
    },
  );

  // Revive from a .main file (after the 30-day purge). Rejected while the org still exists.
  app.post("/orgs/revive", { preHandler: app.authenticate }, async (req, reply) => {
    const body = uploadSchema.parse(req.body);
    const file = Buffer.from(body.fileBase64, "base64");
    const header = readHeader(file);
    if (header.scope !== "main") {
      return reply.status(400).send({ error: "This is a .bkp file — use node restore instead" });
    }

    const existing = await db.organization.findUnique({
      where: { orgNumber: header.orgNumber },
    });
    if (existing && !existing.deletedAt) {
      return reply.status(409).send({
        error: "This organization still exists — revival is only for deleted organizations",
      });
    }
    if (existing?.deletedAt) {
      // Soft-deleted copy still retained: file + matching Supreme password proves ownership,
      // so the retained copy is purged and the file's snapshot takes its place.
      if (!(await argonVerify(existing.supremeHash, body.password))) {
        return reply.status(401).send({ error: "Wrong Supreme password" });
      }
      await purgeOrganization(existing.id);
    }

    const { payload } = openContainer<MainPayload>(file, body.password);

    const report = { rolesRestored: 0, peopleMatched: 0, peoplePending: 0, coursesRestored: 0 };
    const org = await db.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: payload.org.name,
          orgNumber: payload.org.orgNumber, // number preserved — never reissued to anyone else
          supremeHash: await argonHash(body.password),
          nextRoleNumber: payload.org.nextRoleNumber,
        },
      });

      const roleIdMap = new Map<string, string>();
      for (const r of payload.roles.sort((a, b) => a.path.length - b.path.length)) {
        const node = await tx.roleNode.create({
          data: {
            orgId: created.id,
            parentId: r.parentId ? (roleIdMap.get(r.parentId) ?? null) : null,
            name: r.name,
            roleNumber: r.roleNumber,
            isPublic: r.isPublic ?? true, // pre-visibility .main files: public by default
            path: r.path,
            nextItemNumber: r.nextItemNumber,
          },
        });
        roleIdMap.set(r.id, node.id);
        report.rolesRestored++;
      }

      const profileIdMap = new Map<string, string>(); // old id -> current id
      for (const person of payload.people) {
        const profile = await tx.profile.findUnique({ where: { username: person.username } });
        if (profile) {
          await tx.membership.create({ data: { profileId: profile.id, orgId: created.id } });
          profileIdMap.set(person.profileId, profile.id);
          report.peopleMatched++;
        } else {
          report.peoplePending++;
        }
      }

      for (const p of payload.placements) {
        const profileId = profileIdMap.get(p.profileId);
        const roleNodeId = roleIdMap.get(p.roleNodeId);
        if (!roleNodeId) continue;
        if (!profileId) {
          // pending member: re-attached when that username registers (structure.md §5.1)
          const person = payload.people.find((x) => x.profileId === p.profileId);
          if (person) {
            await tx.invitation.create({
              data: {
                orgId: created.id,
                username: person.username,
                roleNodeId,
                kind: p.kind,
                canCreateSubgroups: p.canCreateSubgroups,
                canAddCoOwners: p.canAddCoOwners ?? false,
                invitedByProfileId: req.profileId,
              },
            });
          }
          continue;
        }
        const membership = await tx.membership.findUniqueOrThrow({
          where: { profileId_orgId: { profileId, orgId: created.id } },
        });
        await tx.placement.create({
          data: {
            membershipId: membership.id,
            roleNodeId,
            kind: p.kind,
            canCreateSubgroups: p.canCreateSubgroups,
            canAddCoOwners: p.canAddCoOwners ?? false,
            addedByProfileId: profileIdMap.get(p.addedByProfileId) ?? req.profileId,
          },
        });
      }

      const courseIdMap = new Map<string, string>();
      for (const c of payload.courses as {
        id: string; code: string; uploaderRoleNodeId: string; kind: never; title: string;
        deadlineDays: number | null; retakeEveryNDays: number | null;
        resetsCompletionOnUpdate: boolean; version: number; createdByProfileId: string;
      }[]) {
        const course = await tx.course.create({
          data: {
            orgId: created.id,
            code: c.code,
            uploaderRoleNodeId: roleIdMap.get(c.uploaderRoleNodeId) ?? created.id,
            createdByProfileId: profileIdMap.get(c.createdByProfileId) ?? req.profileId,
            kind: c.kind,
            title: c.title,
            // Media needs the storage reconnection step — marked unreachable until then
            storageRef: { adapter: "unreachable" },
            deadlineDays: c.deadlineDays,
            retakeEveryNDays: c.retakeEveryNDays,
            resetsCompletionOnUpdate: c.resetsCompletionOnUpdate,
            version: c.version,
          },
        });
        courseIdMap.set(c.id, course.id);
        report.coursesRestored++;
      }
      for (const cp of payload.coursePlacements as {
        courseId: string; roleNodeId: string; mandatory: boolean;
        inheritToDescendants: boolean; placedByProfileId: string;
      }[]) {
        const courseId = courseIdMap.get(cp.courseId);
        const roleNodeId = roleIdMap.get(cp.roleNodeId);
        if (!courseId || !roleNodeId) continue;
        await tx.coursePlacement.create({
          data: {
            courseId,
            roleNodeId,
            mandatory: cp.mandatory,
            inheritToDescendants: cp.inheritToDescendants,
            placedByProfileId: profileIdMap.get(cp.placedByProfileId) ?? req.profileId,
          },
        });
      }
      for (const pre of payload.prerequisites) {
        const courseId = courseIdMap.get(pre.courseId);
        const requiresCourseId = courseIdMap.get(pre.requiresCourseId);
        if (courseId && requiresCourseId) {
          await tx.coursePrerequisite.create({ data: { courseId, requiresCourseId } });
        }
      }
      for (const rec of payload.completions as {
        courseId: string; courseCode: string; profileId: string; status: never;
        completedAt: string | null; validUntil: string | null; courseVersion: number;
      }[]) {
        const courseId = courseIdMap.get(rec.courseId);
        const profileId = profileIdMap.get(rec.profileId);
        if (!courseId || !profileId) continue;
        await tx.completionRecord.create({
          data: {
            courseId,
            courseCode: rec.courseCode,
            profileId,
            orgId: created.id,
            status: rec.status,
            completedAt: rec.completedAt ? new Date(rec.completedAt) : null,
            validUntil: rec.validUntil ? new Date(rec.validUntil) : null,
            courseVersion: rec.courseVersion,
          },
        });
      }
      return created;
    });

    return { ok: true, orgId: org.id, report };
  });

  // ── .bkp: node backup & identical-structure restore ────────────────────────

  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/export-bkp",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const { password } = z
        .object({ password: z.string().min(8, "Backup password: at least 8 characters") })
        .parse(req.body);
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });

      const placements = await actorPlacements(req.profileId, node.orgId);
      if (!can(placements, "export_backup", toRoleRef(node))) {
        return reply
          .status(403)
          .send({ error: "Only this node's managers can export its backup" });
      }

      const children = await db.roleNode.findMany({ where: { parentId: node.id } });
      const occupants = await db.placement.findMany({
        where: { roleNodeId: node.id },
        include: { membership: { include: { profile: true } } },
      });
      const placedCourses = await db.coursePlacement.findMany({
        where: { roleNodeId: node.id },
        include: { course: true },
      });
      const records = await db.completionRecord.findMany({
        where: {
          courseId: { in: placedCourses.map((pc) => pc.courseId) },
          profileId: { in: occupants.map((o) => o.membership.profileId) },
        },
      });

      const fingerprint = structureFingerprint({
        path: node.path,
        roleNumber: node.roleNumber,
        childRoleNumbers: children.map((c) => c.roleNumber),
      });
      const payload = {
        node: { name: node.name, roleNumber: node.roleNumber },
        occupants: occupants.map((o) => ({
          username: o.membership.profile.username,
          displayName: o.membership.profile.displayName,
          kind: o.kind,
          canCreateSubgroups: o.canCreateSubgroups,
          canAddCoOwners: o.canAddCoOwners,
          addedByProfileId: o.addedByProfileId,
        })),
        completions: records.map((r) => ({
          username: occupants.find((o) => o.membership.profileId === r.profileId)!.membership
            .profile.username,
          courseCode: r.courseCode,
          status: r.status,
          completedAt: r.completedAt?.toISOString() ?? null,
          validUntil: r.validUntil?.toISOString() ?? null,
          courseVersion: r.courseVersion,
        })),
      };

      const file = sealContainer(
        password,
        { scope: "bkp", orgNumber: node.org.orgNumber, structureHash: fingerprint },
        payload,
      );
      reply
        .header("content-type", "application/octet-stream")
        .header("content-disposition", `attachment; filename="${node.name.replace(/[^\w-]/g, "_")}.bkp"`);
      return reply.send(file);
    },
  );

  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/restore-bkp",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = uploadSchema.parse(req.body);
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });

      const placements = await actorPlacements(req.profileId, node.orgId);
      if (!can(placements, "restore_backup", toRoleRef(node))) {
        return reply
          .status(403)
          .send({ error: "Only this node's managers can restore its backup" });
      }

      const file = Buffer.from(body.fileBase64, "base64");
      const header = readHeader(file);
      if (header.scope !== "bkp") {
        return reply.status(400).send({ error: "This is a .main file — use organization revive" });
      }
      if (header.orgNumber !== node.org.orgNumber) {
        return reply.status(400).send({ error: "This backup belongs to a different organization" });
      }

      // Identical-structure gate: any divergence denies the restore (v1 — no tolerance)
      const children = await db.roleNode.findMany({ where: { parentId: node.id } });
      const liveFingerprint = structureFingerprint({
        path: node.path,
        roleNumber: node.roleNumber,
        childRoleNumbers: children.map((c) => c.roleNumber),
      });
      if (liveFingerprint !== header.structureHash) {
        return reply.status(409).send({
          error:
            "The structure has changed severely since this backup was taken — restore denied",
        });
      }

      const { payload } = openContainer<{
        occupants: {
          username: string;
          kind: "OWNER" | "MEMBER";
          canCreateSubgroups: boolean;
          canAddCoOwners?: boolean;
          addedByProfileId: string;
        }[];
        completions: {
          username: string;
          courseCode: string;
          status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";
          completedAt: string | null;
          validUntil: string | null;
          courseVersion: number;
        }[];
      }>(file, body.password);

      const report = { applied: [] as string[], skipped: [] as string[] };
      await db.$transaction(async (tx) => {
        // Full node restore "like nothing ever happened": replace current occupants
        await tx.placement.deleteMany({ where: { roleNodeId: node.id } });
        for (const o of payload.occupants) {
          const profile = await tx.profile.findUnique({ where: { username: o.username } });
          if (!profile) {
            report.skipped.push(`${o.username}: no longer has a profile`);
            continue;
          }
          const membership = await tx.membership.upsert({
            where: { profileId_orgId: { profileId: profile.id, orgId: node.orgId } },
            create: { profileId: profile.id, orgId: node.orgId },
            update: {},
          });
          await tx.placement.create({
            data: {
              membershipId: membership.id,
              roleNodeId: node.id,
              kind: o.kind,
              canCreateSubgroups: o.canCreateSubgroups,
              canAddCoOwners: o.canAddCoOwners ?? false,
              addedByProfileId: req.profileId,
            },
          });
          report.applied.push(`${o.username} restored as ${o.kind.toLowerCase()}`);
        }

        for (const rec of payload.completions) {
          const profile = await tx.profile.findUnique({ where: { username: rec.username } });
          const course = await tx.course.findUnique({ where: { code: rec.courseCode } });
          if (!profile) {
            report.skipped.push(`completion ${rec.courseCode} for ${rec.username}: profile missing`);
            continue;
          }
          if (!course) {
            report.skipped.push(`completion ${rec.courseCode}: course deleted`);
            continue;
          }
          const existing = await tx.completionRecord.findFirst({
            where: { profileId: profile.id, courseId: course.id },
          });
          const data = {
            status: rec.status,
            completedAt: rec.completedAt ? new Date(rec.completedAt) : null,
            validUntil: rec.validUntil ? new Date(rec.validUntil) : null,
            courseVersion: rec.courseVersion,
          };
          if (existing) {
            await tx.completionRecord.update({ where: { id: existing.id }, data });
          } else {
            await tx.completionRecord.create({
              data: {
                ...data,
                courseId: course.id,
                courseCode: rec.courseCode,
                profileId: profile.id,
                orgId: node.orgId,
              },
            });
          }
          report.applied.push(`completion ${rec.courseCode} for ${rec.username}`);
        }
      });

      return { ok: true, report };
    },
  );
}
