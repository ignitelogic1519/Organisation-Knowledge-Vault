import { z } from "zod";

// Pricing, Knowledge Coins, and the user↔admin request channel — the paywall contract.
// See docs/pricing.md. The super-admin console types live in ./platform.ts.

/** Plan/subscription state on an organization (mirrors Prisma `PlanStatus`). */
export type PlanStatus = "NONE" | "DEMO" | "ACTIVE" | "EXPIRED";

/** The kinds of ask a user can send the super-admin. */
export type PlatformRequestKind =
  | "CREATE_ORG"
  | "KVEP_ORG"
  | "CUSTOM_PLAN"
  | "RESTORE_ORG"
  | "UPGRADE_PLAN";

export const PLATFORM_REQUEST_LABELS: Record<PlatformRequestKind, string> = {
  CREATE_ORG: "Create an organization",
  KVEP_ORG: "Employee perk organization (KVEP)",
  CUSTOM_PLAN: "Custom / organizational plan",
  RESTORE_ORG: "Restore an organization",
  UPGRADE_PLAN: "Upgrade a plan",
};
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
  storageLimitMb: number | null; // total stored bytes allowed, in MB; null = unlimited
  /** Rank in the upgrade ladder — higher is "above" in the Netflix-style comparison. */
  tier: number;
  allowDrafts: boolean; // may authors park work-in-progress documents on the server?
  isCustom: boolean;
  imageUrl: string | null;
  criteria: string | null;
  badge: string | null;
  highlights: string[];
}

/** One of the viewer's organizations, as the Pricing page's upgrade panel sees it. */
export interface UpgradableOrgView {
  id: string;
  name: string;
  orgNumber: number;
  planKey: string | null;
  planName: string | null;
  planStatus: PlanStatus;
  planExpiresAt: string | null;
  tier: number;
  /** Only owners can ask for an upgrade — members see the plan but not the button. */
  canUpgrade: boolean;
  members: number;
  documents: number;
  uploads: number;
}

/** The whole Pricing page payload: cards grouped into tabs, plus the viewer's balance. */
export interface PricingView {
  tabs: string[];
  plans: PricingPlanView[];
  coins: number; // Knowledge Coins — only ever exposed here
  /** Present for a signed-in viewer: what they run today and what sits above it. */
  myOrgs: UpgradableOrgView[];
}

/** A single row of the plan-comparison table (current vs the plan being considered). */
export interface PlanComparisonRow {
  label: string;
  current: string;
  next: string;
  /** True when the next plan is strictly better on this row — drives the ✓ highlight. */
  better: boolean;
}

/** Human text for a limit: a number, or "Unlimited" when the plan doesn't meter it. */
export function limitLabel(limit: number | null, unit = ""): string {
  if (limit == null) return "Unlimited";
  return unit ? `${limit.toLocaleString()} ${unit}` : limit.toLocaleString();
}

/** Human text for a storage ceiling in MB. */
export function storageLabel(mb: number | null): string {
  if (mb == null) return "Unlimited";
  return mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`;
}

/** Human text for a plan's duration. */
export function durationLabel(days: number | null, isCustom = false): string {
  if (days == null) return isCustom ? "You choose" : "Unlimited";
  if (days % 365 === 0) return `${days / 365} year${days / 365 === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  const rest = days - months * 30;
  if (months >= 1 && rest === 0) return `${months} month${months === 1 ? "" : "s"}`;
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"} + ${rest} days`;
  return `${days} days`;
}

/** Build the comparison table between the plan an org runs and one it could move to. */
export function comparePlans(
  current: PricingPlanView | null,
  next: PricingPlanView,
): PlanComparisonRow[] {
  const better = (a: number | null | undefined, b: number | null | undefined) =>
    b == null ? a != null : a != null && b > a;
  return [
    {
      label: "Duration",
      current: current ? durationLabel(current.durationDays, current.isCustom) : "—",
      next: durationLabel(next.durationDays, next.isCustom),
      better: better(current?.durationDays ?? null, next.durationDays),
    },
    {
      label: "People",
      current: current ? limitLabel(current.memberLimit) : "—",
      next: limitLabel(next.memberLimit),
      better: better(current?.memberLimit ?? null, next.memberLimit),
    },
    {
      label: "Custom documents (Studio)",
      current: current ? limitLabel(current.documentLimit) : "—",
      next: limitLabel(next.documentLimit),
      better: better(current?.documentLimit ?? null, next.documentLimit),
    },
    {
      label: "Uploaded documents",
      current: current ? limitLabel(current.uploadLimit) : "—",
      next: limitLabel(next.uploadLimit),
      better: better(current?.uploadLimit ?? null, next.uploadLimit),
    },
    {
      label: "Storage",
      current: current ? storageLabel(current.storageLimitMb) : "—",
      next: storageLabel(next.storageLimitMb),
      better: better(current?.storageLimitMb ?? null, next.storageLimitMb),
    },
    {
      label: "Server-side drafts",
      current: current ? (current.allowDrafts ? "Included" : "Not included") : "—",
      next: next.allowDrafts ? "Included" : "Not included",
      better: !!next.allowDrafts && !current?.allowDrafts,
    },
    {
      label: "Price",
      current: current ? `${current.priceCoins} coins` : "—",
      next: `${next.priceCoins} coins`,
      better: false,
    },
  ];
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
  /** Stored bytes, in MB — the free plan's other ceiling. */
  storageMb: PlanAllowance;
  /** Parking a work-in-progress document on the server is a premium capability. */
  draftsEnabled: boolean;
  /** The formal wording the UI shows when a premium-only action is attempted. */
  upgradeNotice: string;
}

/** A user filing a request (create / upgrade / propose a custom plan / restore an org). */
export const createPlatformRequestSchema = z
  .object({
    kind: z.enum(["CREATE_ORG", "KVEP_ORG", "CUSTOM_PLAN", "RESTORE_ORG", "UPGRADE_PLAN"]),
    planKey: z.string().max(60).optional(),
    requestedDays: z.number().int().positive().max(3650).optional(),
    offeredCoins: z.number().int().nonnegative().max(1_000_000).optional(),
    // The shape of the organization a custom proposal needs — the admin approves these
    // numbers rather than inventing them.
    requestedMembers: z.number().int().positive().max(1_000_000).optional(),
    requestedDocuments: z.number().int().positive().max(1_000_000).optional(),
    requestedUploads: z.number().int().positive().max(1_000_000).optional(),
    message: z.string().max(600).optional(),
    targetOrgNumber: z.number().int().positive().optional(), // RESTORE_ORG / UPGRADE_PLAN
  })
  .refine((v) => v.kind !== "CUSTOM_PLAN" || (v.requestedDays && v.offeredCoins != null), {
    message: "A custom-plan request needs the number of days and the coins you offer",
  })
  .refine(
    (v) => (v.kind !== "RESTORE_ORG" && v.kind !== "UPGRADE_PLAN") || v.targetOrgNumber != null,
    { message: "This request needs the organization number" },
  )
  .refine((v) => v.kind !== "UPGRADE_PLAN" || !!v.planKey, {
    message: "Choose the plan to upgrade to",
  });
export type CreatePlatformRequestInput = z.infer<typeof createPlatformRequestSchema>;

/** A user's view of one of their requests (and, once approved, the OTP itself). */
export interface PlatformRequestView {
  id: string;
  kind: PlatformRequestKind;
  status: PlatformRequestStatus;
  planKey: string | null;
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
  /** Present only to the requester while APPROVED and unexpired. */
  otp: string | null;
  otpExpiresAt: string | null;
  targetOrgNumber: number | null;
  createdAt: string;
  decidedAt: string | null;
}
