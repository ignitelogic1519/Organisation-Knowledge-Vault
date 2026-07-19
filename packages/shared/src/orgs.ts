import { z } from "zod";
import type { PlacementKind } from "./types.js";

// Organization contracts — docs/structure.md §1.2, §4.1.

export const createOrgSchema = z.object({
  name: z.string().min(2, "Organization name is too short").max(80),
  ownerRoleName: z
    .string()
    .min(2, "Name the first role (Owner, CEO, Principal, …)")
    .max(40),
  supremePassword: z
    .string()
    .min(12, "Supreme password must be at least 12 characters")
    .max(200),
  /** The unrecoverability warning must be explicitly acknowledged. */
  acknowledgedUnrecoverable: z.literal(true, {
    errorMap: () => ({ message: "You must acknowledge that the Supreme password is unrecoverable" }),
  }),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const supremeVerifySchema = z.object({
  password: z.string().min(1, "Enter the Supreme password"),
});
export type SupremeVerifyInput = z.infer<typeof supremeVerifySchema>;

export const addOwnerSchema = z.object({
  username: z.string().min(1, "Enter their username"),
});
export type AddOwnerInput = z.infer<typeof addOwnerSchema>;

export interface MyPlacement {
  roleNodeId: string;
  roleName: string;
  roleNumber: number;
  kind: PlacementKind;
  canCreateSubgroups: boolean;
}

export interface OrgSummary {
  id: string;
  name: string;
  orgNumber: number;
  myPlacements: MyPlacement[];
}

export interface OrgOwner {
  profileId: string;
  displayName: string;
  username: string;
}

export interface OrgDetail extends OrgSummary {
  ownerRole: {
    id: string;
    name: string;
    roleNumber: number;
  };
  owners: OrgOwner[];
  createdAt: string;
}

export interface SupremeSession {
  /** Short-lived token authorizing owner-level structural changes. */
  supremeToken: string;
  expiresIn: number;
}
