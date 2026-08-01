import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  can,
  daysUntil,
  isSelfOrAncestor,
  planReminderStage,
  type AppNotification,
  type ComplianceCourse,
  type ComplianceReport,
} from "@vault/shared";
import { db } from "../db.js";
import { env } from "../env.js";
import { coursesReaching, escalationTargets, notify, toLearningItem } from "../courses/helpers.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { purgeOrganization } from "../orgs/purge.js";
import {
  ADMIN_NOTIFICATION_KINDS,
  ADMIN_NOTIFICATION_RETENTION_MS,
  notifyFromAdmin,
} from "../platform/notify.js";

/** Profile ids of an org's root-role owners — who plan notices are addressed to. */
async function orgOwnerProfileIds(orgId: string): Promise<string[]> {
  const root = await db.roleNode.findFirst({ where: { orgId, parentId: null }, select: { id: true } });
  if (!root) return [];
  const owners = await db.placement.findMany({
    where: { roleNodeId: root.id, kind: "OWNER" },
    select: { membership: { select: { profileId: true } } },
  });
  return [...new Set(owners.map((o) => o.membership.profileId))];
}

/** Messages self-clean after 7 days — the database never accumulates stale noise. */
const NOTIFICATION_RETENTION_MS = 7 * 86400_000;
/** Transient operational data (verification audits, spent tokens) clears after 15 days. */
const TRANSIENT_RETENTION_MS = 15 * 86400_000;
/** Above this many messages the user gets nudged to clear their inbox. */
const CLUTTER_THRESHOLD = 10;

export async function complianceRoutes(app: FastifyInstance) {
  // In-app notification center (v1 channel — docs/structure.md §7)
  app.get(
    "/notifications",
    { preHandler: app.authenticate },
    async (req): Promise<{ notifications: AppNotification[]; unread: number }> => {
      // Auto-cleanup, applied on every read: normal messages self-clear after 7 days,
      // but messages from the super-admin (OTPs, plan decisions) are durable receipts and
      // are kept 30 days so the user can see the code any time.
      await db.notification.deleteMany({
        where: {
          profileId: req.profileId,
          kind: { notIn: [...ADMIN_NOTIFICATION_KINDS] },
          createdAt: { lt: new Date(Date.now() - NOTIFICATION_RETENTION_MS) },
        },
      });
      await db.notification.deleteMany({
        where: {
          profileId: req.profileId,
          kind: { in: [...ADMIN_NOTIFICATION_KINDS] },
          createdAt: { lt: new Date(Date.now() - ADMIN_NOTIFICATION_RETENTION_MS) },
        },
      });

      let rows = await db.notification.findMany({
        where: { profileId: req.profileId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      // Clutter nudge: more than 10 messages → one reminder to clean up (re-armed
      // weekly by the retention window above)
      if (rows.length > CLUTTER_THRESHOLD && !rows.some((n) => n.kind === "inbox_cleanup")) {
        const reminder = await db.notification.create({
          data: {
            profileId: req.profileId,
            orgId: null,
            kind: "inbox_cleanup",
            payload: { count: rows.length },
          },
        });
        rows = [reminder, ...rows];
      }

      return {
        notifications: rows.map((n) => ({
          id: n.id,
          kind: n.kind,
          orgId: n.orgId,
          payload: n.payload as Record<string, unknown>,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        })),
        unread: rows.filter((n) => !n.readAt).length,
      };
    },
  );

  app.post("/notifications/read", { preHandler: app.authenticate }, async (req) => {
    await db.notification.updateMany({
      where: { profileId: req.profileId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  // Dismiss one message
  app.delete<{ Params: { id: string } }>(
    "/notifications/:id",
    { preHandler: app.authenticate },
    async (req) => {
      await db.notification.deleteMany({
        where: { id: req.params.id, profileId: req.profileId },
      });
      return { ok: true };
    },
  );

  // Clear the whole inbox
  app.post("/notifications/clear", { preHandler: app.authenticate }, async (req) => {
    await db.notification.deleteMany({ where: { profileId: req.profileId } });
    return { ok: true };
  });

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

      const courses: ComplianceCourse[] = [...byCourse.values()].map(({ cp, audience }) => {
        const pending: ComplianceCourse["pending"] = [];
        let compliant = 0;
        const deadlineDays = cp.deadlineDays ?? cp.course.deadlineDays;
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
          pending.push({
            profileId,
            displayName: profile?.displayName ?? "Unknown",
            username: profile?.username ?? "unknown",
            status: rec?.status ?? (cp.mandatory ? "ASSIGNED" : "AVAILABLE"),
            overdue:
              cp.mandatory &&
              deadlineDays !== null &&
              new Date(cp.createdAt.getTime() + deadlineDays * 86400_000) < new Date(),
          });
        }
        const viaNode = allNodes.find((n) => n.id === cp.roleNodeId);
        return {
          code: cp.course.code,
          title: cp.course.title,
          mandatory: cp.mandatory,
          viaRoleName: viaNode?.name ?? "—",
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
      planReminders: 0,
      planExpiries: 0,
      purgedOrgs: 0,
      prunedNotifications: 0,
      prunedRequests: 0,
      prunedAudits: 0,
      prunedTokens: 0,
    };

    // 0a. 7-day retention: messages and decided requests. Super-admin messages (OTPs,
    //     plan decisions) are durable receipts kept 30 days instead.
    const retentionCutoff = new Date(Date.now() - NOTIFICATION_RETENTION_MS);
    const adminCutoff = new Date(Date.now() - ADMIN_NOTIFICATION_RETENTION_MS);
    report.prunedNotifications =
      (
        await db.notification.deleteMany({
          where: { kind: { notIn: [...ADMIN_NOTIFICATION_KINDS] }, createdAt: { lt: retentionCutoff } },
        })
      ).count +
      (
        await db.notification.deleteMany({
          where: { kind: { in: [...ADMIN_NOTIFICATION_KINDS] }, createdAt: { lt: adminCutoff } },
        })
      ).count;
    report.prunedRequests = (
      await db.vaultRequest.deleteMany({
        where: { status: { not: "PENDING" }, decidedAt: { lt: retentionCutoff } },
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

    // 2b. Plan expiry: warn the owners on the reminder ladder (20 → 7 → 1 days out),
    //     then mark the plan EXPIRED once it lapses. `planReminderDays` records the
    //     lowest rung already sent for this plan period, so re-running is a no-op and a
    //     renewed plan (which clears the field) starts its ladder again.
    const planned = await db.organization.findMany({
      where: { deletedAt: null, planStatus: { in: ["DEMO", "ACTIVE"] }, planExpiresAt: { not: null } },
    });
    for (const org of planned) {
      const left = daysUntil(org.planExpiresAt!);

      if (left <= 0) {
        await db.organization.update({
          where: { id: org.id },
          data: { planStatus: "EXPIRED", planReminderDays: null },
        });
        for (const pid of await orgOwnerProfileIds(org.id)) {
          await notifyFromAdmin(pid, "plan_expired", {
            title: `${org.name}'s plan has expired`,
            message:
              `The ${org.planKey ?? "current"} plan for ${org.name} (#${org.orgNumber}) has ended. ` +
              "Renew or upgrade it to restore full access — you can request this from the " +
              "organization's page, or contact the Knowledge Base team.",
            orgNumber: org.orgNumber,
            planKey: org.planKey,
            expiresAt: org.planExpiresAt!.toISOString(),
          });
        }
        report.planExpiries++;
        continue;
      }

      const stage = planReminderStage(left);
      // Only ever tighten: skip when this rung (or a closer one) already went out.
      if (stage == null || (org.planReminderDays != null && stage >= org.planReminderDays)) continue;
      await db.organization.update({
        where: { id: org.id },
        data: { planReminderDays: stage },
      });
      for (const pid of await orgOwnerProfileIds(org.id)) {
        await notifyFromAdmin(pid, "plan_expiring", {
          title: `${org.name}'s plan expires in ${left} day${left === 1 ? "" : "s"}`,
          message:
            `The ${org.planKey ?? "current"} plan for ${org.name} (#${org.orgNumber}) ends on ` +
            `${org.planExpiresAt!.toISOString().slice(0, 10)}. Renew it, move to a larger plan, ` +
            "or ask the Knowledge Base team for a custom arrangement — all from the " +
            "organization's page.",
          orgNumber: org.orgNumber,
          planKey: org.planKey,
          expiresAt: org.planExpiresAt!.toISOString(),
          daysLeft: left,
          stage,
        });
      }
      report.planReminders++;
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
