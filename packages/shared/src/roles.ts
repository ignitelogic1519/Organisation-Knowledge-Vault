import { z } from "zod";
import type { PlacementKind } from "./types.js";

// Role-tree contracts — docs/structure.md §3.

export const createSubRoleSchema = z.object({
  name: z.string().min(2, "Role name is too short").max(40),
  isTerminal: z.boolean().default(false),
});
export type CreateSubRoleInput = z.infer<typeof createSubRoleSchema>;

export const addPersonSchema = z.object({
  username: z.string().min(1, "Enter their username"),
  kind: z.enum(["OWNER", "MEMBER"]),
  canCreateSubgroups: z.boolean().default(false),
});
export type AddPersonInput = z.infer<typeof addPersonSchema>;

export const updateRoleFlagsSchema = z.object({
  isTerminal: z.boolean(),
});
export type UpdateRoleFlagsInput = z.infer<typeof updateRoleFlagsSchema>;

export const updatePersonFlagsSchema = z.object({
  canCreateSubgroups: z.boolean(),
});
export type UpdatePersonFlagsInput = z.infer<typeof updatePersonFlagsSchema>;

export interface RolePerson {
  profileId: string;
  displayName: string;
  username: string;
  kind: PlacementKind;
  canCreateSubgroups: boolean;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  name: string;
  roleNumber: number;
  path: string;
  isTerminal: boolean;
  ownerCount: number;
  memberCount: number;
  childCount: number;
  /** What the requesting user may do here — computed by the central policy. */
  my: {
    kinds: PlacementKind[];
    canAddPeople: boolean;
    canCreateSubRole: boolean;
    canManageFlags: boolean;
    canDelete: boolean;
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
