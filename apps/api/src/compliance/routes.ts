import type { FastifyInstance } from "fastify";
import type { AppNotification } from "@vault/shared";
import { db } from "../db.js";
import { env } from "../env.js";
import { coursesReaching, escalationTargets, notify, toLearningItem } from "../courses/helpers.js";

export async function complianceRoutes(app: FastifyInstance) {
  // In-app notification center (v1 channel — docs/structure.md §7)
  app.get(
    "/notifications",
    { preHandler: app.authenticate },
    async (req): Promise<{ notifications: AppNotification[]; unread: number }> => {
      const rows = await db.notification.findMany({
        where: { profileId: req.profileId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return {
        notifications: rows.map((n) => ({
          id: n.id,
          kind: n.kind,
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

  // The nightly job — triggered by an external scheduler (GitHub Actions) because Render's
  // free tier sleeps. Protected by JOB_SECRET. Idempotent: safe to run repeatedly.
  app.post("/jobs/run", async (req, reply) => {
    const secret = req.headers["x-job-secret"];
    if (!process.env.JOB_SECRET || secret !== process.env.JOB_SECRET) {
      return reply.status(403).send({ error: "Job secret required" });
    }

    const report = { expiredCompletions: 0, overdueNotices: 0, purgedOrgs: 0 };

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

    // 3. Purge organizations soft-deleted more than 30 days ago (structure.md §4.3)
    const cutoff = new Date(Date.now() - 30 * 86400_000);
    const doomed = await db.organization.findMany({ where: { deletedAt: { lt: cutoff } } });
    for (const org of doomed) {
      await db.$transaction([
        db.completionRecord.deleteMany({ where: { orgId: org.id } }),
        db.courseAdminAccess.deleteMany({ where: { course: { orgId: org.id } } }),
        db.coursePrerequisite.deleteMany({ where: { course: { orgId: org.id } } }),
        db.coursePlacement.deleteMany({ where: { course: { orgId: org.id } } }),
        db.course.deleteMany({ where: { orgId: org.id } }),
        db.storedFile.deleteMany({ where: { orgId: org.id } }),
        db.invitation.deleteMany({ where: { orgId: org.id } }),
        db.placement.deleteMany({ where: { membership: { orgId: org.id } } }),
        db.membership.deleteMany({ where: { orgId: org.id } }),
        db.roleNode.deleteMany({ where: { orgId: org.id } }),
        db.organization.delete({ where: { id: org.id } }),
      ]);
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
