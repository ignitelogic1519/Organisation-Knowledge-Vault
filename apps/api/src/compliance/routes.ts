import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  can,
  isSelfOrAncestor,
  type ComplianceCourse,
  type CompliancePerson,
  type CompliancePersonCourse,
  type CompliancePersonReport,
  type ComplianceReport,
} from "@vault/shared";
import { db } from "../db.js";
import { env } from "../env.js";
import {
  coursesReaching,
  deadlineStartsAt,
  effectiveStatus,
  escalationTargets,
  isCompliant,
  isPastDeadline,
  laterOf,
  notify,
  toLearningItem,
} from "../courses/helpers.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { purgeOrganization } from "../orgs/purge.js";
import { orgOwnerProfileIds } from "../orgs/owners.js";
import { sweepExpired } from "../notifications/mailbox.js";
import { storage, type StorageRef } from "../storage/adapter.js";
import { audit } from "../security.js";
import { collectOrphans, drainDeletionQueue, runHealthChecks } from "../storage/jobs.js";
import { broadcast } from "../events.js";
import { IDLE_TIMEOUT_MS } from "../auth/tokens.js";

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

/** One person's standing on one course, before it is shaped for a particular view. */
interface Entry extends CompliancePerson {
  compliant: boolean;
}

/** A course reaching the branch, with EVERY person it reaches — compliant or not. */
interface BranchCourse {
  code: string;
  title: string;
  mandatory: boolean;
  viaRoleName: string;
  isExam: boolean;
  entries: Entry[];
}

/**
 * The audience of one course: who it reaches, and WHEN it reached each of them —
 * the later of "placed on the branch" and "person joined the branch", which is where
 * their deadline starts. `mandatoryAt` is the same instant measured on the mandatory
 * placement alone, so an opt-in placement from years ago can never start somebody's
 * mandatory clock.
 */
type Audience = Map<string, { at: Date; mandatoryAt: Date | null }>;

/** Fold one more sighting of a person into an audience, keeping the earliest of each. */
function rememberReach(
  audience: Audience,
  profileId: string,
  reach: { at: Date; mandatoryAt: Date | null },
) {
  const seen = audience.get(profileId);
  if (!seen) {
    audience.set(profileId, { ...reach });
    return;
  }
  if (reach.at < seen.at) seen.at = reach.at;
  if (reach.mandatoryAt && (!seen.mandatoryAt || reach.mandatoryAt < seen.mandatoryAt)) {
    seen.mandatoryAt = reach.mandatoryAt;
  }
}

/**
 * Compliance for a branch, computed once and shaped twice.
 *
 * The branch report shows a course and the people behind on it; the per-person card shows
 * a person and the courses behind them. They are the same arithmetic read along different
 * axes, so it is computed here and only formatted at the route — the two views can never
 * disagree about whether somebody is compliant.
 */
async function branchCompliance(node: { id: string; orgId: string; path: string }): Promise<{
  peopleCount: number;
  courses: BranchCourse[];
  /** Everyone in the subtree: their profile, and which of the branch's roles they occupy. */
  people: Map<
    string,
    {
      profile: { id: string; username: string; displayName: string; avatar: string | null };
      roleNames: string[];
    }
  >;
}> {
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

  const byCourse = new Map<string, { cp: (typeof relevant)[number]; audience: Audience }>();
  for (const cp of relevant) {
    const cpNode = allNodes.find((n) => n.id === cp.roleNodeId);
    if (!cpNode) continue;
    // Audience within this branch: occupants of the exact placement node, or —
    // when the placement inherits — every subtree occupant the placement reaches.
    // (`occupants` already holds only this branch's subtree.)
    const audience: Audience = new Map();
    for (const o of occupants) {
      const reaches = cp.inheritToDescendants
        ? isSelfOrAncestor(cpNode.path, o.roleNode.path)
        : o.roleNodeId === cp.roleNodeId;
      if (!reaches) continue;
      // It reached them once both were in place — the course on the branch, and them
      // in it. Whichever happened last is when their deadline started running.
      const at = laterOf(cp.createdAt, o.createdAt);
      rememberReach(audience, o.membership.profileId, { at, mandatoryAt: cp.mandatory ? at : null });
    }
    const existing = byCourse.get(cp.courseId);
    if (existing) {
      for (const [profileId, seen] of audience) rememberReach(existing.audience, profileId, seen);
      if (cp.mandatory && !existing.cp.mandatory) existing.cp = cp;
    } else {
      byCourse.set(cp.courseId, { cp, audience });
    }
  }

  const records = await db.completionRecord.findMany({
    where: { courseId: { in: [...byCourse.keys()] } },
  });
  // Editions that expired everyone's completion when they landed: for whoever had
  // completed the old edition, that is the day the course reached them again.
  const resetEditions = await db.courseEdition.findMany({
    where: { courseId: { in: [...byCourse.keys()] }, resetCompletions: true },
    select: { courseId: true, publishedAt: true },
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

  const now = new Date();
  const courses: BranchCourse[] = [...byCourse.values()].map(({ cp, audience }) => {
    const entries: Entry[] = [];
    const deadlineDays = cp.deadlineDays ?? cp.course.deadlineDays;
    const isExam = cp.course.kind === "EXAM";
    const maxAttempts = isExam ? examLimits.get(cp.courseId) ?? null : null;
    const resets = resetEditions.filter((e) => e.courseId === cp.courseId);
    for (const [profileId, reach] of audience) {
      const rec =
        records.find((r) => r.courseId === cp.courseId && r.profileId === profileId) ?? null;
      const done = isCompliant(rec, now);
      const profile = profileOf.get(profileId);
      // The deadline runs from the day the course reached THEM — and from the day it
      // reached them again, when a lapsed recurrence or a reset-on-update edition
      // re-opened it. Somebody who completed it last cycle is not late the moment the
      // next one opens, and somebody who joined the branch today is not late already.
      const status = effectiveStatus(rec, cp.mandatory, now);
      const overdue =
        !done &&
        cp.mandatory &&
        isPastDeadline(
          deadlineStartsAt({
            reachedAt: reach.mandatoryAt ?? reach.at,
            record: rec,
            resetEditions: resets,
            now,
          }),
          deadlineDays,
          now,
        );
      const stat = isExam ? attemptsBy.get(`${cp.courseId}:${profileId}`) : undefined;
      const exhausted =
        !done && isExam && maxAttempts != null && (stat?.count ?? 0) >= maxAttempts && !stat?.passed;

      // The most specific true statement wins: an exhausted exam explains itself
      // better than "overdue" ever could.
      const reason = exhausted
        ? "EXAM_ATTEMPTS_EXHAUSTED"
        : isExam && (stat?.count ?? 0) > 0
          ? "EXAM_FAILED"
          : status === "EXPIRED"
            ? "EXPIRED"
            : overdue
              ? "OVERDUE"
              : status === "IN_PROGRESS"
                ? "IN_PROGRESS"
                : "NOT_STARTED";

      entries.push({
        profileId,
        displayName: profile?.displayName ?? "Unknown",
        username: profile?.username ?? "unknown",
        status,
        overdue,
        reason,
        compliant: done,
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
      entries,
    };
  });

  // Who sits where, so a person's card can say which of the branch's roles they hold.
  const people = new Map<
    string,
    {
      profile: { id: string; username: string; displayName: string; avatar: string | null };
      roleNames: string[];
    }
  >();
  for (const o of occupants) {
    const pr = o.membership.profile;
    const entry = people.get(pr.id) ?? {
      profile: {
        id: pr.id,
        username: pr.username,
        displayName: pr.displayName,
        avatar: pr.avatar ?? null,
      },
      roleNames: [],
    };
    if (!entry.roleNames.includes(o.roleNode.name)) entry.roleNames.push(o.roleNode.name);
    people.set(pr.id, entry);
  }

  return { peopleCount, courses, people };
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

      const { peopleCount, courses } = await branchCompliance(node);
      return {
        roleId: node.id,
        roleName: node.name,
        peopleCount,
        courses: courses.map((c): ComplianceCourse => {
          const { entries, ...rest } = c;
          return {
            ...rest,
            total: entries.length,
            compliant: entries.filter((e) => e.compliant).length,
            pending: entries
              .filter((e) => !e.compliant)
              .map(({ compliant: _compliant, ...person }) => person),
          };
        }),
      };
    },
  );

  // One person, every course that reaches them inside a branch the manager governs.
  // The branch report answers "who is behind on this course"; a manager checking up on
  // somebody in particular is asking the other question, and used to have to read every
  // course card looking for a name.
  app.get<{ Params: { roleId: string }; Querystring: { username?: string } }>(
    "/roles/:roleId/compliance/person",
    { preHandler: app.authenticate },
    async (req, reply): Promise<CompliancePersonReport> => {
      const node = await db.roleNode.findUnique({
        where: { id: req.params.roleId },
        include: { org: true },
      });
      if (!node || node.org.deletedAt) return reply.status(404).send({ error: "Role not found" });
      const placements = await actorPlacements(req.profileId, node.orgId);
      if (!can(placements, "add_people", toRoleRef(node))) {
        return reply.status(403).send({ error: "Only this branch's managers see compliance" });
      }

      const wanted = (req.query.username ?? "").trim().toLowerCase();
      if (!wanted) return reply.status(400).send({ error: "Name somebody to look up" });

      const { courses, people } = await branchCompliance(node);
      const person = [...people.values()].find(
        (p) => p.profile.username.toLowerCase() === wanted,
      );
      // Somebody outside this branch simply has nothing here, and saying so plainly is
      // the honest answer — the manager needs to pick the branch they belong to.
      if (!person) {
        return reply
          .status(404)
          .send({ error: "That person is not in this branch — pick the branch they belong to" });
      }

      const rows: CompliancePersonCourse[] = [];
      for (const c of courses) {
        const entry = c.entries.find((e) => e.profileId === person.profile.id);
        if (!entry) continue; // this course does not reach them
        const { profileId: _p, displayName: _d, username: _u, reason, compliant, ...rest } = entry;
        rows.push({
          code: c.code,
          title: c.title,
          mandatory: c.mandatory,
          viaRoleName: c.viaRoleName,
          isExam: c.isExam,
          compliant,
          reason: compliant ? null : reason,
          ...rest,
        });
      }
      // Mandatory and outstanding first — what a manager is looking for is at the top.
      rows.sort(
        (a, b) =>
          Number(a.compliant) - Number(b.compliant) ||
          Number(b.mandatory) - Number(a.mandatory) ||
          a.title.localeCompare(b.title),
      );

      return {
        roleId: node.id,
        roleName: node.name,
        profileId: person.profile.id,
        username: person.profile.username,
        displayName: person.profile.displayName,
        avatar: person.profile.avatar,
        roleNames: person.roleNames,
        compliant: rows.filter((r) => r.compliant).length,
        total: rows.length,
        courses: rows,
      };
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
      endedIdleSessions: 0,
      prunedSessions: 0,
      // Storage (docs/structure.md §9.8, §9.10)
      storageChecked: 0,
      storageDegraded: 0,
      storagePausedOrgs: 0,
      storageDeletesDone: 0,
      storageOrphansCollected: 0,
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

    // 0c. Sessions (structure.md §8.8). The idle timeout is enforced on every request, so
    //     a session someone comes back to is already refused — but a session nobody ever
    //     comes back to would otherwise sit there marked live for a month. Closing them
    //     here keeps "who is signed in" an honest answer, and it is what the console and
    //     any future "your devices" screen read.
    const idleCutoff = new Date(Date.now() - IDLE_TIMEOUT_MS);
    const stale = await db.session.findMany({
      where: {
        endedAt: null,
        OR: [{ lastActivityAt: { lt: idleCutoff } }, { expiresAt: { lt: new Date() } }],
      },
      select: { id: true, expiresAt: true },
    });
    if (stale.length > 0) {
      const now = new Date();
      const expired = stale.filter((s) => s.expiresAt < now).map((s) => s.id);
      const idled = stale.filter((s) => s.expiresAt >= now).map((s) => s.id);
      for (const [ids, reason] of [
        [idled, "idle"],
        [expired, "expired"],
      ] as const) {
        if (ids.length === 0) continue;
        await db.session.updateMany({
          where: { id: { in: ids } },
          data: { endedAt: now, endedReason: reason },
        });
      }
      // Tokens of an ended session are dead weight — the session is what refuses them,
      // but leaving them unrevoked would misreport what is still live.
      await db.refreshToken.updateMany({
        where: { sessionId: { in: stale.map((s) => s.id) }, revokedAt: null },
        data: { revokedAt: now },
      });
      report.endedIdleSessions = stale.length;
    }
    report.prunedSessions = (
      await db.session.deleteMany({ where: { endedAt: { lt: cutoff15 } } })
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
    //
    // Organizations whose storage is unhealthy are SKIPPED (docs/structure.md §9.8). An
    // overdue notice raised while their documents cannot be opened is a false accusation
    // with an audit trail, against someone who physically could not do the reading.
    const orgs = await db.organization.findMany({ where: { deletedAt: null } });
    const degradedOrgIds = new Set(
      (
        await db.orgStorage.findMany({ where: { status: "DEGRADED" }, select: { orgId: true } })
      ).map((s) => s.orgId),
    );
    for (const org of orgs) {
      if (degradedOrgIds.has(org.id)) {
        report.storagePausedOrgs++;
        continue;
      }
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

    // 4. Organization-provided storage (docs/structure.md §9.8, §9.10). Health first, so
    //    the deletion drain works against backends we have just confirmed reachable.
    //    None of this may take the nightly job down — a customer's NAS being off is not
    //    a reason for recurrence and retention to stop running.
    try {
      const health = await runHealthChecks();
      report.storageChecked = health.checked;
      report.storageDegraded = health.degraded;
    } catch (err) {
      app.log.error({ err }, "storage health sweep failed");
    }
    try {
      report.storageDeletesDone = (await drainDeletionQueue(200)).done;
      report.storageOrphansCollected = await collectOrphans();
    } catch (err) {
      app.log.error({ err }, "storage cleanup failed");
    }

    app.log.info({ report }, "nightly job finished");
    return report;
  });

  // Dev/testing convenience: what the job would do is observable via notifications
  if (!env.isProd) {
    app.log.info("compliance routes ready (dev mode)");
  }
}
