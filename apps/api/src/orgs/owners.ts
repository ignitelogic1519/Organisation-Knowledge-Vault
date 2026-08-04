import { db } from "../db.js";

// Who speaks for an organization: the OWNER placements on its root role. Used wherever a
// message is addressed to "the organization" — plan changes, expiry warnings, broadcasts
// from the Knowledge Base team.

/** Profile ids of an org's root-role owners. */
export async function orgOwnerProfileIds(orgId: string): Promise<string[]> {
  const root = await db.roleNode.findFirst({
    where: { orgId, parentId: null },
    select: { id: true },
  });
  if (!root) return [];
  const owners = await db.placement.findMany({
    where: { roleNodeId: root.id, kind: "OWNER" },
    select: { membership: { select: { profileId: true } } },
  });
  return [...new Set(owners.map((o) => o.membership.profileId))];
}

/** Usernames of an org's root-role owners, for admin-facing lists. */
export async function orgOwnerUsernames(orgId: string): Promise<string[]> {
  const root = await db.roleNode.findFirst({
    where: { orgId, parentId: null },
    select: { id: true },
  });
  if (!root) return [];
  const owners = await db.placement.findMany({
    where: { roleNodeId: root.id, kind: "OWNER" },
    select: { membership: { select: { profile: { select: { username: true } } } } },
  });
  return owners.map((o) => o.membership.profile.username);
}
