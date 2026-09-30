import { db } from "../db.js";

/** Everyone who owns a branch of this organization — who storage news goes to. */
export async function ownerProfileIds(orgId: string): Promise<string[]> {
  const owners = await db.placement.findMany({
    where: { kind: "OWNER", membership: { orgId } },
    select: { membership: { select: { profileId: true } } },
  });
  return [...new Set(owners.map((o) => o.membership.profileId))];
}
