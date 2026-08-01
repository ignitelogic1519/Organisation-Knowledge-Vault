import { z } from "zod";

// Pricing, Knowledge Coins, and the user↔admin request channel — the paywall contract.
// See docs/pricing.md. The super-admin console types live in ./platform.ts.

/** Plan/subscription state on an organization (mirrors Prisma `PlanStatus`). */
export type PlanStatus = "NONE" | "DEMO" | "ACTIVE" | "EXPIRED";

/** The kinds of ask a user can send the super-admin. */
export type PlatformRequestKind =
  | "CREATE_ORG"
  | "CUSTOM_PLAN"
  | "RESTORE_ORG"
  /** Renew or upgrade the plan of an organization that already exists. */
  | "PLAN_RENEWAL";
export type PlatformRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "USED"
  | "EXPIRED"
  | "WITHDRAWN";

/** A pricing card as shown on the public Pricing page (from the DB `PricingPlan`). */
export interface PricingPlanView {
  key: string;
  name: string;
  tagline: string | null;
  category: string; // the tab this card sits under
  priceCoins: number;
  durationDays: number | null;
  memberLimit: number | null; // max people in an org on this plan; null = unlimited
  documentLimit: number | null; // max Studio-authored documents; null = unlimited
  uploadLimit: number | null; // max uploaded/linked documents; null = unlimited
  allowDrafts: boolean; // may authors park work-in-progress documents on the server?
  isCustom: boolean;
  imageUrl: string | null;
  criteria: string | null;
  badge: string | null;
  highlights: string[];
}

/** The whole Pricing page payload: cards grouped into tabs, plus the viewer's balance. */
export interface PricingView {
  tabs: string[];
  plans: PricingPlanView[];
  coins: number; // Knowledge Coins — only ever exposed here
}

/** One metered allowance on an organization's plan. `limit: null` = unlimited. */
export interface PlanAllowance {
  used: number;
  limit: number | null;
  remaining: number | null;
}

/**
 * What the organization's plan permits, and how much of it is already spent — read by
 * the Studio and the upload form so a member sees the ceiling before they hit it. The
 * server enforces the same numbers on write; this view only informs the UI.
 */
export interface OrgPlanLimitsView {
  planKey: string | null;
  planName: string | null;
  planStatus: PlanStatus;
  /** True on the free demo plan (and on an org that never activated a paid plan). */
  isFreePlan: boolean;
  /** Documents built in the Studio ("custom documents"). */
  documents: PlanAllowance;
  /** Documents brought in as an upload or an external link. */
  uploads: PlanAllowance;
  members: PlanAllowance;
  /** Parking a work-in-progress document on the server is a premium capability. */
  draftsEnabled: boolean;
  /** The formal wording the UI shows when a premium-only action is attempted. */
  upgradeNotice: string;
}

/** A user filing a request (create an org / propose a custom plan / restore / renew). */
export const createPlatformRequestSchema = z
  .object({
    kind: z.enum(["CREATE_ORG", "CUSTOM_PLAN", "RESTORE_ORG", "PLAN_RENEWAL"]),
    planKey: z.string().max(60).optional(),
    requestedDays: z.number().int().positive().max(3650).optional(),
    offeredCoins: z.number().int().nonnegative().max(1_000_000).optional(),
    message: z.string().max(600).optional(),
    targetOrgNumber: z.number().int().positive().optional(), // RESTORE_ORG | PLAN_RENEWAL
  })
  .refine((v) => v.kind !== "CUSTOM_PLAN" || (v.requestedDays && v.offeredCoins != null), {
    message: "A custom-plan request needs the number of days and the coins you offer",
  })
  .refine((v) => v.kind !== "RESTORE_ORG" || v.targetOrgNumber != null, {
    message: "A restore request needs the organization number",
  })
  .refine((v) => v.kind !== "PLAN_RENEWAL" || v.targetOrgNumber != null, {
    message: "A renewal request needs the organization number",
  });
export type CreatePlatformRequestInput = z.infer<typeof createPlatformRequestSchema>;

// ── Plan expiry reminders ────────────────────────────────────────────────────
// The org's owners are reminded on a fixed ladder before the plan lapses. The first
// notice lands 20 days out — early enough to arrange a renewal, upgrade, or a
// conversation with the super-admin without any interruption to the organization.

export const PLAN_REMINDER_DAYS = [20, 7, 1] as const;
export type PlanReminderStage = (typeof PLAN_REMINDER_DAYS)[number];

/**
 * Which reminder rung `daysLeft` falls on, or null when expiry is still far away.
 * Returns the SMALLEST threshold that still covers the remaining days, so the ladder
 * only ever tightens: 15 days left → the 20-day notice, 5 → the 7-day, 0.5 → the 1-day.
 * Callers persist the rung they last sent, which makes the sweep idempotent.
 */
export function planReminderStage(daysLeft: number): PlanReminderStage | null {
  const covering = PLAN_REMINDER_DAYS.filter((d) => daysLeft <= d);
  return covering.length ? (Math.min(...covering) as PlanReminderStage) : null;
}

/** Whole days (rounded up) until `expiresAt`; negative once the plan has lapsed. */
export function daysUntil(expiresAt: string | Date): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** A user's view of one of their requests (and, once approved, the OTP itself). */
export interface PlatformRequestView {
  id: string;
  kind: PlatformRequestKind;
  status: PlatformRequestStatus;
  planKey: string | null;
  requestedDays: number | null;
  offeredCoins: number | null;
  message: string | null;
  grantedDays: number | null;
  priceCoins: number | null;
  adminMessage: string | null;
  /** Present only to the requester while APPROVED and unexpired. */
  otp: string | null;
  otpExpiresAt: string | null;
  targetOrgNumber: number | null;
  createdAt: string;
  decidedAt: string | null;
}
