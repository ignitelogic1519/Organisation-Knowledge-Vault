import type { PlacementRef, RoleNodeRef } from "@vault/shared";
import type { RoleNode } from "@prisma/client";
import { db } from "../db.js";

/** Load the actor's placements in an org as policy references. */
export async function actorPlacements(profileId: string, orgId: string): Promise<PlacementRef[]> {
  const rows = await db.placement.findMany({
    where: { membership: { profileId, orgId } },
    include: { roleNode: true },
  });
  return rows.map((p) => ({
    roleNodeId: p.roleNodeId,
    roleNodePath: p.roleNode.path,
    kind: p.kind,
    canCreateSubgroups: p.canCreateSubgroups,
    canAddCoOwners: p.canAddCoOwners,
    canCreateContent: p.canCreateContent,
  }));
}

export function toRoleRef(node: RoleNode): RoleNodeRef {
  return { id: node.id, orgId: node.orgId, path: node.path };
}

/** Attach a profile to a role node (creates the membership if needed). */
export async function placePerson(opts: {
  profileId: string;
  orgId: string;
  roleNodeId: string;
  kind: "OWNER" | "MEMBER";
  canCreateSubgroups: boolean;
  canAddCoOwners?: boolean;
  canCreateContent?: boolean;
  addedByProfileId: string;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const membership = await tx.membership.upsert({
      where: { profileId_orgId: { profileId: opts.profileId, orgId: opts.orgId } },
      create: { profileId: opts.profileId, orgId: opts.orgId },
      update: {},
    });
    await tx.placement.upsert({
      where: {
        membershipId_roleNodeId_kind: {
          membershipId: membership.id,
          roleNodeId: opts.roleNodeId,
          kind: opts.kind,
        },
      },
      create: {
        membershipId: membership.id,
        roleNodeId: opts.roleNodeId,
        kind: opts.kind,
        canCreateSubgroups: opts.canCreateSubgroups,
        canAddCoOwners: opts.canAddCoOwners ?? false,
        canCreateContent: opts.canCreateContent ?? false,
        addedByProfileId: opts.addedByProfileId,
      },
      update: {},
    });
  });
}

/** Accept every pending placement for a username — called right after registration. */
export async function acceptPendingInvitations(profileId: string, username: string): Promise<number> {
  const invites = await db.invitation.findMany({
    where: { username: username.toLowerCase(), acceptedAt: null },
  });
  for (const invite of invites) {
    await placePerson({
      profileId,
      orgId: invite.orgId,
      roleNodeId: invite.roleNodeId,
      kind: invite.kind,
      canCreateSubgroups: invite.canCreateSubgroups,
      canAddCoOwners: invite.canAddCoOwners,
      canCreateContent: invite.canCreateContent,
      addedByProfileId: invite.invitedByProfileId,
    });
    await db.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
  }
  return invites.length;
}
