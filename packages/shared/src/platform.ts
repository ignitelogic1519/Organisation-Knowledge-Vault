import { z } from "zod";
import type { PlanStatus, PlatformRequestKind, PlatformRequestStatus } from "./pricing.js";

// Super-super-admin console contracts (the "Knowledge Base" employee portal).
// A SEPARATE auth realm from user Profiles. See docs/pricing.md §Admin.

export const adminLoginSchema = z.object({
  username: z.string().min(1, "Enter your admin username"),
  password: z.string().min(1, "Enter your password"),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export interface AdminSession {
  token: string;
  admin: { id: string; username: string; displayName: string; mustChangePassword: boolean };
}

export const changeAdminPasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10, "New password must be at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: "The new passwords don't match — retype them",
    path: ["confirm"],
  });
export type ChangeAdminPasswordInput = z.infer<typeof changeAdminPasswordSchema>;

/** One row in the "all organizations" dashboard table. */
export interface AdminOrgRow {
  id: string;
  name: string;
  orgNumber: number;
  ownerUsernames: string[];
  planKey: string | null;
  planStatus: PlanStatus;
  planExpiresAt: string | null;
  planIsCustom: boolean;
  memberCount: number;
  memberLimit: number | null; // effective cap (per-org override, else the plan's)
  documentCount: number; // Studio-authored documents published so far
  documentLimit: number | null;
  uploadCount: number; // uploaded / linked documents so far
  uploadLimit: number | null;
  storageUsedMb: number; // bytes held by this org's inline files, in MB
  storageLimitMb: number | null;
  roleCount: number;
  treeDepth: number;
  createdAt: string;
  lastActivityAt: string | null; // most recent user action — spot abandoned orgs
  deletedAt: string | null;
}

/** One editable property on the admin's organization detail card. */
export interface AdminOrgProperty {
  key: string;
  label: string;
  value: string | number | null;
  /** How the detail table renders/edits it. */
  type: "text" | "number" | "date" | "select" | "readonly";
  options?: string[];
  hint?: string;
}

/** Everything the admin's org card expands into: the property table plus live counts. */
export interface AdminOrgDetail {
  org: AdminOrgRow;
  properties: AdminOrgProperty[];
  owners: { username: string; displayName: string; coins: number }[];
  recentActivity: { action: string; at: string }[];
}

/** Set any org property by hand — the admin's manual override for every count. */
export const adminSetOrgSchema = z.object({
  orgNumber: z.number().int().positive(),
  name: z.string().min(1).max(120).optional(),
  planKey: z.string().max(60).nullable().optional(),
  planStatus: z.enum(["NONE", "DEMO", "ACTIVE", "EXPIRED"]).optional(),
  planExpiresAt: z.string().nullable().optional(), // ISO date; null = no expiry
  memberLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
  documentLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
  uploadLimit: z.number().int().min(0).max(1_000_000).nullable().optional(),
  storageLimitMb: z.number().int().min(0).max(10_000_000).nullable().optional(),
});
export type AdminSetOrgInput = z.infer<typeof adminSetOrgSchema>;

/** Send a message (announcement / advert / notice) to the owners of one or more orgs. */
export const adminBroadcastSchema = z.object({
  orgNumbers: z.array(z.number().int().positive()).min(1).max(500),
  subject: z.string().min(1, "Give the message a subject").max(120),
  message: z.string().min(1, "Write the message").max(2000),
  /** HIGH pins it to the top of every recipient's mailbox. */
  priority: z.enum(["HIGH", "NORMAL"]).default("NORMAL"),
});
export type AdminBroadcastInput = z.infer<typeof adminBroadcastSchema>;

/** Delete several organizations in one action from the card grid. */
export const adminBulkDeleteSchema = z.object({
  orgNumbers: z.array(z.number().int().positive()).min(1).max(200),
});
export type AdminBulkDeleteInput = z.infer<typeof adminBulkDeleteSchema>;

/** A pending/served request as the admin sees it (includes the requester's identity). */
export interface AdminRequestRow {
  id: string;
  kind: PlatformRequestKind;
  status: PlatformRequestStatus;
  requesterUsername: string;
  requesterDisplayName: string;
  requesterCoins: number;
  planKey: string | null;
  /** The plan's own terms, resolved server-side so approving needs no data entry. */
  planName: string | null;
  planDurationDays: number | null;
  planPriceCoins: number | null;
  planMemberLimit: number | null;
  planDocumentLimit: number | null;
  planUploadLimit: number | null;
  requestedDays: number | null;
  offeredCoins: number | null;
  requestedMembers: number | null;
  requestedDocuments: number | null;
  requestedUploads: number | null;
  message: string | null;
  grantedDays: number | null;
  grantedMembers: number | null;
  grantedDocuments: number | null;
  grantedUploads: number | null;
  priceCoins: number | null;
  adminMessage: string | null;
  targetOrgNumber: number | null;
  createdAt: string;
  decidedAt: string | null;
}

/**
 * Admin decides a request. An approval needs nothing but the decision — every term
 * defaults to what the requested plan already says (or to what the user asked for on a
 * custom proposal). The optional fields are the manual override, not the normal path.
 */
export const decidePlatformRequestSchema = z.object({
  decision: z.enum(["APPROVE", "DENY"]),
  grantedDays: z.number().int().positive().max(3650).nullable().optional(),
  priceCoins: z.number().int().nonnegative().max(1_000_000).optional(),
  grantedMembers: z.number().int().min(0).max(1_000_000).nullable().optional(),
  grantedDocuments: z.number().int().min(0).max(1_000_000).nullable().optional(),
  grantedUploads: z.number().int().min(0).max(1_000_000).nullable().optional(),
  adminMessage: z.string().max(600).optional(),
});
export type DecidePlatformRequestInput = z.infer<typeof decidePlatformRequestSchema>;

/** Gift or deduct coins for a user (top-up from the admin's end). */
export const giftCoinsSchema = z.object({
  username: z.string().min(1, "Enter the user's username"),
  delta: z.number().int().refine((n) => n !== 0, "Enter a non-zero amount"),
  note: z.string().max(300).optional(),
});
export type GiftCoinsInput = z.infer<typeof giftCoinsSchema>;

/** Upgrade / set an organization's plan directly (after a confirmed payment). */
export const upgradePlanSchema = z.object({
  orgNumber: z.number().int().positive(),
  planKey: z.string().min(1),
  durationDays: z.number().int().positive().max(3650).nullable().optional(), // null = unlimited
  memberLimit: z.number().int().positive().max(1_000_000).nullable().optional(), // null = plan default
  documentLimit: z.number().int().positive().max(1_000_000).nullable().optional(), // Studio documents
  uploadLimit: z.number().int().positive().max(1_000_000).nullable().optional(), // uploads & links
  storageLimitMb: z.number().int().positive().max(10_000_000).nullable().optional(),
  message: z.string().max(600).optional(),
});
export type UpgradePlanInput = z.infer<typeof upgradePlanSchema>;

/** Add another project member as a super-admin. */
export const addAdminSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(60),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  displayName: z.string().min(1, "Enter a display name").max(80),
});
export type AddAdminInput = z.infer<typeof addAdminSchema>;

/** A node in the org's role tree, for the admin's read-only structure view. */
export interface AdminTreeNode {
  id: string;
  name: string;
  roleNumber: number;
  depth: number;
  parentId: string | null;
  isPublic: boolean;
  ownerCount: number;
  memberCount: number;
}
