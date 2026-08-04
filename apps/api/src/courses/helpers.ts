import { formatCourseCode, isSelfOrAncestor, type LearningItem } from "@vault/shared";
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

export interface ReachingCourse {
  course: Course;
  mandatory: boolean;
  viaRoleName: string;
  anchor: Date; // earliest placement date — deadline anchor
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
      const existing = byCourse.get(cp.courseId);
      if (!existing) {
        byCourse.set(cp.courseId, {
          course: cp.course,
          mandatory: cp.mandatory,
          viaRoleName: cpNode.name,
          anchor: cp.createdAt,
          deadlineDays: cp.deadlineDays ?? cp.course.deadlineDays,
          retakeEveryNDays: cp.retakeEveryNDays ?? cp.course.retakeEveryNDays,
        });
      } else {
        // mandatory wins over opt-in; keep the earliest anchor for deadlines
        if (cp.mandatory && !existing.mandatory) {
          existing.mandatory = true;
          existing.viaRoleName = cpNode.name;
          existing.deadlineDays = cp.deadlineDays ?? cp.course.deadlineDays;
          existing.retakeEveryNDays = cp.retakeEveryNDays ?? cp.course.retakeEveryNDays;
        }
        if (cp.createdAt < existing.anchor) existing.anchor = cp.createdAt;
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

  const status = record?.status ?? (reach.mandatory ? "ASSIGNED" : "AVAILABLE");
  const overdue =
    reach.mandatory &&
    status !== "COMPLETED" &&
    reach.deadlineDays !== null &&
    new Date(reach.anchor.getTime() + reach.deadlineDays * 86400_000) < new Date();

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
