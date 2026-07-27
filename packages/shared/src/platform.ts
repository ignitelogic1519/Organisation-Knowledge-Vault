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
  roleCount: number;
  treeDepth: number;
  createdAt: string;
  lastActivityAt: string | null; // most recent user action — spot abandoned orgs
  deletedAt: string | null;
}

/** A pending/served request as the admin sees it (includes the requester's identity). */
export interface AdminRequestRow {
  id: string;
  kind: PlatformRequestKind;
  status: PlatformRequestStatus;
  requesterUsername: string;
  requesterDisplayName: string;
  requesterCoins: number;
  planKey: string | null;
  requestedDays: number | null;
  offeredCoins: number | null;
  message: string | null;
  grantedDays: number | null;
  priceCoins: number | null;
  adminMessage: string | null;
  targetOrgNumber: number | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Admin decides a request: approve (issues an OTP + terms) or deny — both with a message. */
export const decidePlatformRequestSchema = z
  .object({
    decision: z.enum(["APPROVE", "DENY"]),
    grantedDays: z.number().int().positive().max(3650).optional(),
    priceCoins: z.number().int().nonnegative().max(1_000_000).optional(),
    adminMessage: z.string().max(600).optional(),
  })
  .refine((v) => v.decision !== "APPROVE" || v.priceCoins != null, {
    message: "Set the coin price for an approval",
    path: ["priceCoins"],
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
