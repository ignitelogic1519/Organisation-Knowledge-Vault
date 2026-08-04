import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  can,
  isSelfOrAncestor,
  type ComplianceCourse,
  type ComplianceReport,
} from "@vault/shared";
import { db } from "../db.js";
import { env } from "../env.js";
import { coursesReaching, escalationTargets, notify, toLearningItem } from "../courses/helpers.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { purgeOrganization } from "../orgs/purge.js";
import { orgOwnerProfileIds } from "../orgs/owners.js";
import { sweepExpired } from "../notifications/mailbox.js";
import { storage, type StorageRef } from "../storage/adapter.js";
import { audit } from "../security.js";
import { broadcast } from "../events.js";

/** Decided requests are removed as they are decided; this is the belt-and-braces sweep. */
const DECIDED_REQUEST_RETENTION_MS = 2 * 86400_000;
/** Transient operational data (verification audits, spent tokens) clears after 15 days. */
const TRANSIENT_RETENTION_MS = 15 * 86400_000;
/** Served platform requests (codes already used, denials read) clear after 30 days. */
const PLATFORM_REQUEST_RETENTION_MS = 30 * 86400_000;

/** The attempt allowance a stored exam paper declares (null = unlimited). */
async function examMaxAttempts(course: { kind: string; storageRef: unknown }): Promise<number | null> {
  if (course.kind !== "EXAM") return null;
  try {
    const content = await storage.resolve(course.storageRef as unknown as StorageRef);
    const settings = (content.exam as { settings?: { maxAttempts?: number | null } } | undefined)
      ?.settings;
    return settings?.maxAttempts ?? null;
  } catch {
    return null; // an unreadable paper simply doesn't meter attempts
  }
}

export async function complianceRoutes(app: FastifyInstance) {
  // The mailbox itself lives in notifications/routes.ts — this file keeps the compliance
  // views and the nightly housekeeping job.

  // Branch compliance report — for the node's managers: per course, who is compliant
  // and who is not, across the whole subtree the course reaches. Works for every node
  // the actor owns (people hold ownership on multiple levels).
  app.get<{ Params: { roleId: string } }>(
    "/roles/:roleId/compliance",
    { preHandler: app.authenticate },
    async (req, reply): Promise<ComplianceReport> => {
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });
      const placements = await actorPlacements(req.profileId, node.orgId);
      if (!can(placements, "add_people", toRoleRef(node))) {
        return reply.status(403).send({ error: "Only this branch's managers see compliance" });
      }

      const allNodes = await db.roleNode.findMany({ where: { orgId: node.orgId } });
      const subtree = allNodes.filter((n) => isSelfOrAncestor(node.path, n.path));
      const subtreeIds = new Set(subtree.map((n) => n.id));

      // Course placements that touch this branch: on a subtree node, or inherited
      // from a level above it
      const cps = await db.coursePlacement.findMany({
        where: { course: { orgId: node.orgId } },
        include: { course: true },
      });
      const relevant = cps.filter((cp) => {
        if (subtreeIds.has(cp.roleNodeId)) return true;
        const cpNode = allNodes.find((n) => n.id === cp.roleNodeId);
        return !!cpNode && cp.inheritToDescendants && isSelfOrAncestor(cpNode.path, node.path);
      });

      const occupants = await db.placement.findMany({
        where: { roleNodeId: { in: [...subtreeIds] } },
        include: { membership: { include: { profile: true } }, roleNode: true },
      });
      const peopleCount = new Set(occupants.map((o) => o.membership.profileId)).size;

      const byCourse = new Map<string, { cp: (typeof relevant)[number]; audience: Set<string> }>();
      for (const cp of relevant) {
        const cpNode = allNodes.find((n) => n.id === cp.roleNodeId);
        if (!cpNode) continue;
        // Audience within this branch: occupants of the exact placement node, or —
        // when the placement inherits — every subtree occupant the placement reaches.
        // (`occupants` already holds only this branch's subtree.)
        const audience = new Set(
          occupants
            .filter((o) =>
              cp.inheritToDescendants
                ? isSelfOrAncestor(cpNode.path, o.roleNode.path)
                : o.roleNodeId === cp.roleNodeId,
            )
            .map((o) => o.membership.profileId),
        );
        const existing = byCourse.get(cp.courseId);
        if (existing) {
          for (const a of audience) existing.audience.add(a);
          if (cp.mandatory && !existing.cp.mandatory) existing.cp = cp;
        } else {
          byCourse.set(cp.courseId, { cp, audience });
        }
      }

      const records = await db.completionRecord.findMany({
        where: { courseId: { in: [...byCourse.keys()] } },
      });
      const profileOf = new Map(
        occupants.map((o) => [o.membership.profileId, o.membership.profile]),
      );

      // Exam attempts, fetched once for every exam in the report and bucketed by
      // course+candidate — the per-person lookup below is then a single map probe.
      const examCourseIds = [...byCourse.values()]
        .filter(({ cp }) => cp.course.kind === "EXAM")
        .map(({ cp }) => cp.courseId);
      const attempts = examCourseIds.length
        ? await db.examAttempt.findMany({
            where: { courseId: { in: examCourseIds }, voided: false },
            select: { courseId: true, profileId: true, scorePercent: true, passed: true },
          })
        : [];
      const attemptsBy = new Map<string, { count: number; best: number; passed: boolean }>();
      for (const a of attempts) {
        const key = `${a.courseId}:${a.profileId}`;
        const entry = attemptsBy.get(key) ?? { count: 0, best: 0, passed: false };
        entry.count++;
        entry.best = Math.max(entry.best, a.scorePercent);
        entry.passed ||= a.passed;
        attemptsBy.set(key, entry);
      }
      // The paper's own attempt allowance lives in its stored settings.
      const examLimits = new Map<string, number | null>();
      for (const courseId of examCourseIds) {
        const { cp } = [...byCourse.values()].find((c) => c.cp.courseId === courseId)!;
        examLimits.set(courseId, await examMaxAttempts(cp.course));
      }

      const courses: ComplianceCourse[] = [...byCourse.values()].map(({ cp, audience }) => {
        const pending: ComplianceCourse["pending"] = [];
        let compliant = 0;
        const deadlineDays = cp.deadlineDays ?? cp.course.deadlineDays;
        const isExam = cp.course.kind === "EXAM";
        const maxAttempts = isExam ? examLimits.get(cp.courseId) ?? null : null;
        for (const profileId of audience) {
          const rec = records.find(
            (r) => r.courseId === cp.courseId && r.profileId === profileId,
          );
          const done =
            rec?.status === "COMPLETED" &&
            (!rec.validUntil || rec.validUntil > new Date());
          if (done) {
            compliant++;
            continue;
          }
          const profile = profileOf.get(profileId);
          const overdue =
            cp.mandatory &&
            deadlineDays !== null &&
            new Date(cp.createdAt.getTime() + deadlineDays * 86400_000) < new Date();
          const stat = isExam ? attemptsBy.get(`${cp.courseId}:${profileId}`) : undefined;
          const exhausted =
            isExam && maxAttempts != null && (stat?.count ?? 0) >= maxAttempts && !stat?.passed;

          // The most specific true statement wins: an exhausted exam explains itself
          // better than "overdue" ever could.
          const reason = exhausted
            ? "EXAM_ATTEMPTS_EXHAUSTED"
            : isExam && (stat?.count ?? 0) > 0
              ? "EXAM_FAILED"
              : rec?.status === "EXPIRED"
                ? "EXPIRED"
                : overdue
                  ? "OVERDUE"
                  : rec?.status === "IN_PROGRESS"
                    ? "IN_PROGRESS"
                    : "NOT_STARTED";

          pending.push({
            profileId,
            displayName: profile?.displayName ?? "Unknown",
            username: profile?.username ?? "unknown",
            status: rec?.status ?? (cp.mandatory ? "ASSIGNED" : "AVAILABLE"),
            overdue,
            reason,
            ...(isExam
              ? {
                  attemptsUsed: stat?.count ?? 0,
                  attemptsAllowed: maxAttempts,
                  bestPercent: stat?.best ?? null,
                  resettable: (stat?.count ?? 0) > 0,
                }
              : {}),
          });
        }
        const viaNode = allNodes.find((n) => n.id === cp.roleNodeId);
        return {
          code: cp.course.code,
          title: cp.course.title,
          mandatory: cp.mandatory,
          viaRoleName: viaNode?.name ?? "—",
          isExam,
          total: audience.size,
          compliant,
          pending,
        };
      });

      return { roleId: node.id, roleName: node.name, peopleCount, courses };
    },
  );

  // Nudge the non-compliant: the manager picks people and sends a custom (or default)
  // message straight to their bell.
  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/compliance/remind",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = z
        .object({
          courseCode: z.string(),
          profileIds: z.array(z.string().uuid()).min(1).max(200),
          message: z.string().trim().max(500).optional(),
        })
        .parse(req.body);
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });
      const placements = await actorPlacements(req.profileId, node.orgId);
      if (!can(placements, "add_people", toRoleRef(node))) {
        return reply.status(403).send({ error: "Only this branch's managers send reminders" });
      }
      const course = await db.course.findUnique({ where: { code: body.courseCode } });
      if (!course || course.orgId !== node.orgId) {
        return reply.status(404).send({ error: "Course not found" });
      }

      const sender = await db.profile.findUnique({ where: { id: req.profileId } });
      for (const profileId of new Set(body.profileIds)) {
        await notify(profileId, node.orgId, "compliance_reminder", {
          code: course.code,
          title: course.title,
          roleName: node.name,
          from: sender?.displayName ?? "Your manager",
          message:
            body.message?.trim() ||
            `Please complete "${course.title}" — your branch's compliance depends on it.`,
        });
      }
      return { ok: true, reminded: new Set(body.profileIds).size };
    },
  );

  // Reset a candidate's exam allowance. A member who has used every attempt cannot sit
  // the paper again on their own — this is the manager's release valve. The sittings stay
  // on record (voided, not deleted), so the history of what happened survives the reset.
  app.post<{ Params: { roleId: string } }>(
    "/roles/:roleId/compliance/reset-exam",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const body = z
        .object({
          courseCode: z.string(),
          profileIds: z.array(z.string().uuid()).min(1).max(200),
          note: z.string().trim().max(500).optional(),
        })
        .parse(req.body);
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });
      const placements = await actorPlacements(req.profileId, node.orgId);
      // Same gate as the rest of the compliance view: this branch's managers, and the
      // levels above them — never a peer.
      if (!can(placements, "add_people", toRoleRef(node))) {
        return reply
          .status(403)
          .send({ error: "Only this branch's managers can reset an exam" });
      }
      const course = await db.course.findUnique({ where: { code: body.courseCode } });
      if (!course || course.orgId !== node.orgId) {
        return reply.status(404).send({ error: "Course not found" });
      }
      if (course.kind !== "EXAM") {
        return reply.status(409).send({ error: "Only an exam has attempts to reset" });
      }

      const targets = [...new Set(body.profileIds)];
      const { count } = await db.examAttempt.updateMany({
        where: { courseId: course.id, profileId: { in: targets }, voided: false },
        data: { voided: true, voidedAt: new Date(), voidedByProfileId: req.profileId },
      });
      // A failed sitting may have left an EXPIRED/IN_PROGRESS record behind; put the
      // candidate back to "assigned" so the exam shows as sittable again.
      await db.completionRecord.updateMany({
        where: { courseId: course.id, profileId: { in: targets }, status: { not: "COMPLETED" } },
        data: { status: "ASSIGNED" },
      });

      const manager = await db.profile.findUnique({ where: { id: req.profileId } });
      for (const profileId of targets) {
        await notify(
          profileId,
          node.orgId,
          "exam_reset",
          { code: course.code, title: course.title, roleName: node.name, by: manager?.displayName },
          {
            subject: `You can sit “${course.title}” again`,
            body:
              `${manager?.displayName ?? "A manager"} reset your attempts on “${course.title}”. ` +
              "Your allowance starts over — open it from My Learning when you are ready." +
              (body.note ? ` Note: ${body.note}` : ""),
          },
        );
      }
      await audit(node.orgId, "exam.reset", {
        actorProfileId: req.profileId,
        ip: req.ip,
        detail: { code: course.code, people: targets.length, voided: count },
      });
      broadcast(node.orgId, "courses");
      return { ok: true, reset: targets.length, attemptsVoided: count };
    },
  );

  // The nightly job — triggered by an external scheduler (GitHub Actions) because Render's
  // free tier sleeps. Protected by JOB_SECRET. Idempotent: safe to run repeatedly.
  app.post("/jobs/run", async (req, reply) => {
    const secret = req.headers["x-job-secret"];
    if (!process.env.JOB_SECRET || secret !== process.env.JOB_SECRET) {
      return reply.status(403).send({ error: "Job secret required" });
    }

    const report = {
      expiredCompletions: 0,
      overdueNotices: 0,
      purgedOrgs: 0,
      prunedNotifications: 0,
      prunedRequests: 0,
      prunedAudits: 0,
      prunedTokens: 0,
    };

    // 0a. Mail expires on its own schedule — every message carries the instant it dies,
    //     so this is one indexed sweep rather than a rule per kind. Decided requests are
    //     deleted as they are decided; anything older that slipped through goes here too.
    report.prunedNotifications = await sweepExpired();
    report.prunedRequests =
      (
        await db.vaultRequest.deleteMany({
          where: {
            status: { not: "PENDING" },
            decidedAt: { lt: new Date(Date.now() - DECIDED_REQUEST_RETENTION_MS) },
          },
        })
      ).count +
      (
        await db.platformRequest.deleteMany({
          where: {
            status: { in: ["USED", "DENIED", "EXPIRED", "WITHDRAWN"] },
            createdAt: { lt: new Date(Date.now() - PLATFORM_REQUEST_RETENTION_MS) },
          },
        })
      ).count;

    // 0b. 15-day retention: transient operational data not worth keeping forever —
    //     Supreme verification audits (structural owner/deletion events are kept) and
    //     spent refresh tokens (expired or long-revoked). Security hygiene + no clutter.
    const cutoff15 = new Date(Date.now() - TRANSIENT_RETENTION_MS);
    report.prunedAudits = (
      await db.supremeAudit.deleteMany({
        where: {
          action: { in: ["verify_success", "verify_failed"] },
          createdAt: { lt: cutoff15 },
        },
      })
    ).count;
    report.prunedTokens = (
      await db.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: cutoff15 } }, { revokedAt: { lt: cutoff15 } }],
        },
      })
    ).count;
    // Forensic audit log kept longer (90 days) — trimmed here so it can't grow unbounded
    await db.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } },
    });

    // 1. Recurrence: completions past validUntil expire and re-assign (structure.md §3.4)
    const dueRecords = await db.completionRecord.findMany({
      where: { status: "COMPLETED", validUntil: { lt: new Date() } },
    });
    for (const rec of dueRecords) {
      await db.completionRecord.update({ where: { id: rec.id }, data: { status: "EXPIRED" } });
      await notify(rec.profileId, rec.orgId, "completion_expired", { code: rec.courseCode });
      report.expiredCompletions++;
    }

    // 2. Overdue mandatory courses: notify the user + escalation chain (once per day per course)
    const orgs = await db.organization.findMany({ where: { deletedAt: null } });
    for (const org of orgs) {
      const members = await db.membership.findMany({ where: { orgId: org.id } });
      for (const m of members) {
        const reaching = await coursesReaching(m.profileId, org.id);
        for (const r of reaching) {
          const item = await toLearningItem(m.profileId, r);
          if (!item.overdue) continue;
          const today = new Date().toISOString().slice(0, 10);
          const already = await db.notification.findFirst({
            where: {
              profileId: m.profileId,
              kind: "course_overdue",
              createdAt: { gte: new Date(`${today}T00:00:00Z`) },
              payload: { path: ["code"], equals: item.code },
            },
          });
          if (already) continue;
          await notify(m.profileId, org.id, "course_overdue", {
            code: item.code,
            title: item.title,
          });
          for (const target of await escalationTargets(m.profileId, org.id)) {
            await notify(target, org.id, "escalation_overdue", {
              code: item.code,
              title: item.title,
              memberProfileId: m.profileId,
            });
          }
          report.overdueNotices++;
        }
      }
    }

    // 2b. Plan expiry: one warning a week out, one notice the day it lapses. Both are
    //     sent once — the same-day guard keeps a nightly run from repeating itself.
    const timed = await db.organization.findMany({
      where: {
        deletedAt: null,
        planStatus: { in: ["DEMO", "ACTIVE"] },
        planExpiresAt: { not: null, lt: new Date(Date.now() + 7 * 86400_000) },
      },
      select: { id: true, name: true, orgNumber: true, planKey: true, planExpiresAt: true },
    });
    for (const org of timed) {
      const expiresAt = org.planExpiresAt as Date;
      const lapsed = expiresAt < new Date();
      const kind = lapsed ? "plan_expired" : "plan_expiring";
      const today = new Date().toISOString().slice(0, 10);
      const already = await db.notification.findFirst({
        where: { orgId: org.id, kind, createdAt: { gte: new Date(`${today}T00:00:00Z`) } },
      });
      if (already) continue;
      const days = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400_000));
      for (const pid of await orgOwnerProfileIds(org.id)) {
        await notify(
          pid,
          org.id,
          kind,
          { orgNumber: org.orgNumber, planKey: org.planKey, expiresAt: expiresAt.toISOString() },
          {
            subject: lapsed
              ? `${org.name}: the plan has lapsed`
              : `${org.name}: the plan expires in ${days} day${days === 1 ? "" : "s"}`,
            body: lapsed
              ? `The ${org.planKey ?? "current"} plan on ${org.name} (#${org.orgNumber}) expired on ${expiresAt
                  .toISOString()
                  .slice(0, 10)}. Renew or upgrade from the Pricing page to unlock it again.`
              : `The ${org.planKey ?? "current"} plan on ${org.name} (#${org.orgNumber}) runs out on ${expiresAt
                  .toISOString()
                  .slice(0, 10)}. Upgrade from the Pricing page to keep everything running.`,
          },
        );
      }
      if (lapsed) {
        await db.organization.update({ where: { id: org.id }, data: { planStatus: "EXPIRED" } });
      }
    }

    // 3. Purge organizations soft-deleted more than 30 days ago (structure.md §4.3)
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const doomed = await db.organization.findMany({ where: { deletedAt: { lt: cutoff } } });
    for (const org of doomed) {
      await purgeOrganization(org.id);
      report.purgedOrgs++;
    }

    app.log.info({ report }, "nightly job finished");
    return report;
  });

  // Dev/testing convenience: what the job would do is observable via notifications
  if (!env.isProd) {
    app.log.info("compliance routes ready (dev mode)");
  }
}
