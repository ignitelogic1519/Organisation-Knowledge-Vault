import {
  formatCourseCode,
  isSelfOrAncestor,
  type CompletionStatus,
  type LearningItem,
} from "@vault/shared";
import type { Course, CoursePlacement, RoleNode } from "@prisma/client";
import { db } from "../db.js";
import { broadcast } from "../events.js";
import { deliver, type NotifyOptions } from "../notifications/mailbox.js";

export async function nextCourseCode(node: RoleNode & { org: { orgNumber: number } }) {
  const updated = await db.roleNode.update({
    where: { id: node.id },
    data: { nextItemNumber: { increment: 1 } },
  });
  return formatCourseCode({
    orgNumber: node.org.orgNumber,
    roleNumber: node.roleNumber,
    itemNumber: updated.nextItemNumber - 1,
  });
}

/**
 * All course placements that REACH a given role node: placed on the node itself, or placed on
 * an ancestor with inherit-to-descendants (docs/structure.md §3.2 — precedence handled by
 * the caller: mandatory wins when a course arrives via multiple paths).
 */
export function placementReaches(
  placement: CoursePlacement & { roleNode: RoleNode },
  userNodePath: string,
): boolean {
  if (placement.roleNode.path === userNodePath) return true;
  return (
    placement.inheritToDescendants && isSelfOrAncestor(placement.roleNode.path, userNodePath)
  );
}

// ── Deadlines & compliance arithmetic (docs/structure.md §3.4) ───────────────
// One definition, used by My Learning, the branch compliance report, the per-course
// compliance view and the nightly job — so no two of them can ever disagree about
// whether somebody is compliant, or late.

const DAY_MS = 86400_000;

/** What a completion record has to say for itself before compliance believes it. */
export interface CompletionFacts {
  status: string;
  completedAt: Date | null;
  validUntil: Date | null;
}

/** Completed, and the completion still counts (a lapsed recurrence does not). */
export function isCompliant(record: CompletionFacts | null | undefined, now = new Date()): boolean {
  return record?.status === "COMPLETED" && (!record.validUntil || record.validUntil > now);
}

/**
 * A completion whose validity has run out. The nightly job rewrites these to EXPIRED,
 * but the views must not wait for it: between the lapse and the sweep the record still
 * says COMPLETED, and a report that repeats that reads "completed" and "overdue" in the
 * same breath.
 */
export function hasLapsed(record: CompletionFacts | null | undefined, now = new Date()): boolean {
  return (
    record?.status === "COMPLETED" && !!record.validUntil && record.validUntil <= now
  );
}

/** The status a person is actually in, whether or not the nightly sweep has run yet. */
export function effectiveStatus(
  record: CompletionFacts | null | undefined,
  mandatory: boolean,
  now = new Date(),
): CompletionStatus | "AVAILABLE" {
  if (!record) return mandatory ? "ASSIGNED" : "AVAILABLE";
  if (hasLapsed(record, now)) return "EXPIRED";
  return record.status as CompletionStatus;
}

/**
 * When the deadline starts running FOR ONE PERSON.
 *
 * A deadline is "how long someone has to finish it after it reaches them" (the words the
 * Studio itself puts on the field), so it cannot be measured from the day the course was
 * placed on the branch and left there. It reaches a person when the course and the person
 * are both in the branch, and it reaches them AGAIN whenever their completion stops
 * counting — an annual course lapsing, or a new edition published with reset-on-update.
 *
 * Without this, everybody who has ever completed the course is marked overdue the instant
 * the next cycle opens, and everybody who joins the branch late is overdue on day one:
 * both are people who never had the days the deadline promises them.
 */
export function deadlineStartsAt(input: {
  /** When the course reached the branch AND the person — the later of the two. */
  reachedAt: Date;
  /** Their completion record, when they have one. */
  record?: CompletionFacts | null;
  /** Editions that expired existing completions when they landed. */
  resetEditions?: { publishedAt: Date }[];
  now?: Date;
}): Date {
  const { reachedAt, record, resetEditions = [], now = new Date() } = input;
  let start = reachedAt;
  // Only somebody who actually completed it can have a cycle re-open under them.
  if (record?.completedAt) {
    const reopenings: Date[] = [];
    // The recurrence ran out: the next cycle opened the moment it did.
    if (record.validUntil && record.validUntil <= now) reopenings.push(record.validUntil);
    // A republish expired what they had: the next cycle opened when that edition landed.
    for (const edition of resetEditions) {
      if (edition.publishedAt > record.completedAt && edition.publishedAt <= now) {
        reopenings.push(edition.publishedAt);
      }
    }
    for (const reopened of reopenings) if (reopened > start) start = reopened;
  }
  return start;
}

/** Has the window closed? A course with no deadline is never late. */
export function isPastDeadline(
  startsAt: Date,
  deadlineDays: number | null,
  now = new Date(),
): boolean {
  return deadlineDays !== null && new Date(startsAt.getTime() + deadlineDays * DAY_MS) < now;
}

/** The later of two instants — the course reaches a person only once both are true. */
export function laterOf(a: Date, b: Date): Date {
  return a > b ? a : b;
}

export interface ReachingCourse {
  course: Course;
  mandatory: boolean;
  viaRoleName: string;
  /** When the course reached this person — where their deadline starts counting. */
  anchor: Date;
  /** Effective settings: the winning placement's per-branch override, else the course default. */
  deadlineDays: number | null;
  retakeEveryNDays: number | null;
}

/** Collect every course reaching the user in an org, mandatory-wins de-duplicated. */
export async function coursesReaching(profileId: string, orgId: string): Promise<ReachingCourse[]> {
  const myPlacements = await db.placement.findMany({
    where: { membership: { profileId, orgId } },
    include: { roleNode: true },
  });
  // A course out of deployment reaches nobody while its next edition is written — its
  // placements are untouched, so republishing restores exactly the audience it had.
  const coursePlacements = await db.coursePlacement.findMany({
    where: { course: { orgId, withdrawn: false } },
    include: { course: true, },
  });
  const nodeById = new Map(
    (await db.roleNode.findMany({ where: { orgId } })).map((n) => [n.id, n]),
  );

  const byCourse = new Map<string, ReachingCourse>();
  for (const cp of coursePlacements) {
    const cpNode = nodeById.get(cp.roleNodeId);
    if (!cpNode) continue;
    for (const mine of myPlacements) {
      const reaches =
        cpNode.path === mine.roleNode.path ||
        (cp.inheritToDescendants && isSelfOrAncestor(cpNode.path, mine.roleNode.path));
      if (!reaches) continue;
      // It reaches them once BOTH are in place: the course on the branch, and the
      // person in it. Somebody placed in a branch today has not been late since before
      // they arrived.
      const reachedAt = laterOf(cp.createdAt, mine.createdAt);
      const existing = byCourse.get(cp.courseId);
      if (!existing) {
        byCourse.set(cp.courseId, {
          course: cp.course,
          mandatory: cp.mandatory,
          viaRoleName: cpNode.name,
          anchor: reachedAt,
          deadlineDays: cp.deadlineDays ?? cp.course.deadlineDays,
          retakeEveryNDays: cp.retakeEveryNDays ?? cp.course.retakeEveryNDays,
        });
      } else if (cp.mandatory && !existing.mandatory) {
        // mandatory wins over opt-in — and brings its own clock, so an opt-in placement
        // from years ago cannot start a deadline the mandatory one only set today
        existing.mandatory = true;
        existing.viaRoleName = cpNode.name;
        existing.deadlineDays = cp.deadlineDays ?? cp.course.deadlineDays;
        existing.retakeEveryNDays = cp.retakeEveryNDays ?? cp.course.retakeEveryNDays;
        existing.anchor = reachedAt;
      } else if (cp.mandatory === existing.mandatory && reachedAt < existing.anchor) {
        // among placements that carry the same obligation, the earliest is when it
        // first reached them
        existing.anchor = reachedAt;
      }
    }
  }
  return [...byCourse.values()];
}

export async function toLearningItem(
  profileId: string,
  reach: ReachingCourse,
): Promise<LearningItem> {
  const { course } = reach;
  const record = await db.completionRecord.findFirst({
    where: { profileId, courseId: course.id },
    orderBy: { completedAt: "desc" },
  });
  const prereqs = await db.coursePrerequisite.findMany({
    where: { courseId: course.id },
    include: { requires: true },
  });
  const missing: string[] = [];
  for (const p of prereqs) {
    const done = await db.completionRecord.findFirst({
      where: {
        profileId,
        courseId: p.requiresCourseId,
        status: "COMPLETED",
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
    });
    if (!done) missing.push(p.requires.code);
  }

  const now = new Date();
  // A lapsed completion reads EXPIRED here even before the nightly sweep rewrites the
  // row, so the learner is told to redo it rather than shown a stale "completed".
  const status = effectiveStatus(record, reach.mandatory, now);
  // A republish with reset-on-update re-opens the course for whoever had completed it:
  // their deadline runs again from the day that edition landed.
  const resetEditions = record?.completedAt
    ? await db.courseEdition.findMany({
        where: {
          courseId: course.id,
          resetCompletions: true,
          publishedAt: { gt: record.completedAt },
        },
        select: { publishedAt: true },
      })
    : [];
  const overdue =
    reach.mandatory &&
    !isCompliant(record, now) &&
    isPastDeadline(
      deadlineStartsAt({ reachedAt: reach.anchor, record, resetEditions, now }),
      reach.deadlineDays,
      now,
    );

  const creator = await db.profile.findUnique({ where: { id: course.createdByProfileId } });

  return {
    code: course.code,
    title: course.title,
    kind: course.kind,
    version: course.version,
    deadlineDays: reach.deadlineDays,
    retakeEveryNDays: reach.retakeEveryNDays,
    prerequisiteCodes: prereqs.map((p) => p.requires.code),
    mandatory: reach.mandatory,
    viaRoleName: reach.viaRoleName,
    status,
    completedAt: record?.completedAt?.toISOString() ?? null,
    validUntil: record?.validUntil?.toISOString() ?? null,
    missingPrerequisites: missing,
    overdue,
    description: course.description,
    scope: course.scope,
    classification: course.classification,
    allowDownload: course.allowDownload,
    publishedAt: course.createdAt.toISOString(),
    creatorName: creator?.displayName ?? "—",
  };
}

/**
 * Write (or refresh) the caller's completion of a course and tell the org about it. Used
 * by the manual "mark complete" action and by a passing exam attempt, so both arrive in
 * the compliance views through exactly the same record.
 * Returns the expiry the recurrence rule gives this completion (null = it never lapses).
 */
export async function recordCompletion(
  profileId: string,
  course: Course,
  reach: Pick<ReachingCourse, "retakeEveryNDays">,
): Promise<Date | null> {
  const validUntil = reach.retakeEveryNDays
    ? new Date(Date.now() + reach.retakeEveryNDays * 86400_000)
    : null;
  const existing = await db.completionRecord.findFirst({
    where: { profileId, courseId: course.id },
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
      data: { ...data, courseId: course.id, courseCode: course.code, profileId, orgId: course.orgId },
    });
  }
  broadcast(course.orgId, "courses");
  return validUntil;
}

/**
 * The branch's HANDLER for content decisions — the nearest level that actually has an
 * owner (the node itself, else the closest ancestor with one), NOT every level up to the
 * top. Returns that node's id, or null when the whole chain is ownerless.
 */
export async function courseHandlerNodeId(orgId: string, nodePath: string): Promise<string | null> {
  const nodes = await db.roleNode.findMany({ where: { orgId } });
  const chain = nodes
    .filter((n) => isSelfOrAncestor(n.path, nodePath))
    .sort((a, b) => b.path.length - a.path.length); // deepest (the branch itself) first
  for (const n of chain) {
    const owners = await db.placement.count({ where: { roleNodeId: n.id, kind: "OWNER" } });
    if (owners > 0) return n.id;
  }
  return null;
}

/**
 * Put a message in someone's mailbox. Folder, flag, subject and expiry all come from the
 * shared catalog (see notifications/mailbox.ts) — callers only supply the facts.
 */
export async function notify(
  profileId: string,
  orgId: string | null,
  kind: string,
  payload: Record<string, unknown>,
  options?: NotifyOptions,
): Promise<void> {
  await deliver(profileId, orgId, kind, payload, options);
}

/**
 * Escalation chain (docs/structure.md §3.4): the person who added the user to the audience
 * node → current owners of that node → owners up the branch. Returns distinct profile ids.
 */
export async function escalationTargets(profileId: string, orgId: string): Promise<string[]> {
  const myPlacements = await db.placement.findMany({
    where: { membership: { profileId, orgId } },
    include: { roleNode: true },
  });
  const targets: string[] = [];
  for (const p of myPlacements) {
    if (p.addedByProfileId !== profileId) targets.push(p.addedByProfileId);
  }
  if (targets.length === 0 && myPlacements.length > 0) {
    // fallback: owners of my nodes and their ancestors
    const allNodes = await db.roleNode.findMany({ where: { orgId } });
    const ancestorIds = allNodes
      .filter((n) => myPlacements.some((p) => isSelfOrAncestor(n.path, p.roleNode.path)))
      .map((n) => n.id);
    const owners = await db.placement.findMany({
      where: { roleNodeId: { in: ancestorIds }, kind: "OWNER" },
      include: { membership: true },
    });
    targets.push(...owners.map((o) => o.membership.profileId).filter((id) => id !== profileId));
  }
  return [...new Set(targets)];
}
