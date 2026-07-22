import { z } from "zod";
import type { PlacementKind } from "./types.js";

// Role-tree contracts — docs/structure.md §3.

export const createSubRoleSchema = z.object({
  name: z.string().min(2, "Role name is too short").max(40),
  /** Branches are public by default — ticking "hidden" at creation opts out. */
  isPublic: z.boolean().default(true),
});
export type CreateSubRoleInput = z.infer<typeof createSubRoleSchema>;

export const addPersonSchema = z.object({
  username: z.string().min(1, "Enter their username"),
  kind: z.enum(["OWNER", "MEMBER"]),
  canCreateSubgroups: z.boolean().default(false),
  canAddCoOwners: z.boolean().default(false),
});
export type AddPersonInput = z.infer<typeof addPersonSchema>;

export const updateRoleFlagsSchema = z.object({
  isPublic: z.boolean(),
});
export type UpdateRoleFlagsInput = z.infer<typeof updateRoleFlagsSchema>;

export const updatePersonFlagsSchema = z.object({
  canCreateSubgroups: z.boolean().optional(),
  canAddCoOwners: z.boolean().optional(),
});
export type UpdatePersonFlagsInput = z.infer<typeof updatePersonFlagsSchema>;

export interface RolePerson {
  profileId: string;
  displayName: string;
  username: string;
  kind: PlacementKind;
  canCreateSubgroups: boolean;
  canAddCoOwners: boolean;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  name: string;
  roleNumber: number;
  path: string;
  /** This node's own visibility flag. */
  isPublic: boolean;
  /** True only when the node AND every ancestor below the root are public —
   *  hidden inherits down the branch to the last end. */
  effectivePublic: boolean;
  ownerCount: number;
  memberCount: number;
  childCount: number;
  /** What the requesting user may do here — computed by the central policy. */
  my: {
    kinds: PlacementKind[];
    canAddPeople: boolean;
    /** May appoint co-owners here (strict-ancestor owner or canAddCoOwners flag). */
    canAddCoOwners: boolean;
    /** May pass the sub-group-creation flag on to owners here. */
    canGrantSubgroups: boolean;
    canCreateSubRole: boolean;
    canManageFlags: boolean;
    canDelete: boolean;
    /** Owner of this node without direct delete rights — deletion goes by request. */
    canRequestDelete: boolean;
    /** Public branch the user isn't part of — joining goes by request. */
    canRequestJoin: boolean;
    /** Owner of a public node hidden by a level above — visibility goes by request. */
    canRequestVisibility: boolean;
  };
  /** Occupants — present only when the requester governs this node. */
  people?: RolePerson[];
}

export interface StructureView {
  orgId: string;
  /** Visible slice of the tree, ordered parent-before-child. */
  nodes: TreeNode[];
}

export interface PendingInvite {
  id: string;
  username: string;
  roleName: string;
  kind: PlacementKind;
}
