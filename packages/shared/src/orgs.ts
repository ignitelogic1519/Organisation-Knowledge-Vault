import { z } from "zod";
import type { PlacementKind } from "./types.js";
import { storageConfigSchema } from "./storage.js";

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
  /** The 8-char access code (OTP) the super-admin issued for this creation. */
  accessCode: z
    .string()
    .trim()
    .min(1, "Enter the access code the super-admin sent you"),
  /**
   * Where this organization's documents will live (docs/structure.md §9.3). The
   * dropdown currently offers one backend — NAS — and its connection is tested BEFORE
   * the organization is created, so a failed test consumes nothing.
   *
   * Omitted for a KVEP organization, which keeps its content in our database.
   */
  storage: storageConfigSchema.optional(),
  /**
   * Knowledge Vault Employee Perk. A super-admin's own username and password, re-entered
   * at creation to prove the person creating this organization is one of our staff.
   * Required when the access code came from a KVEP request, refused otherwise.
   */
  kvepAdmin: z
    .object({
      username: z.string().trim().min(1, "Enter the super-admin username"),
      password: z.string().min(1, "Enter the super-admin password"),
    })
    .optional(),
  /**
   * Optional organization logo — a client-downscaled data URL. Without one the UI
   * falls back to the first letter of the organization's name.
   */
  logo: z.string().max(400_000, "That logo is too large — use a smaller image").optional(),
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
  /** Data-URL logo, or null — the UI falls back to the name's first letter. */
  logo: string | null;
  /** Knowledge Vault Employee Perk: internal, hosted on our storage. */
  isKvep: boolean;
  myPlacements: MyPlacement[];
  /** Plan/subscription state — drives the countdown timer above the org card. */
  planStatus: import("./pricing.js").PlanStatus;
  planKey: string | null;
  planExpiresAt: string | null;
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

/**
 * The letter shown when an organization has no logo. One character, uppercased, from
 * the first word that starts with one — so "3M Safety" reads as "3" and "  acme" as "A".
 */
export function orgInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

/** A stable hue per organization, so the fallback badge is recognisable at a glance. */
export function orgBadgeHue(orgNumber: number): number {
  // Golden-angle stepping spreads adjacent org numbers to visibly different colours.
  return Math.round((orgNumber * 137.508) % 360);
}
