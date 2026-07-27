import { z } from "zod";

// Pricing, Knowledge Coins, and the user↔admin request channel — the paywall contract.
// See docs/pricing.md. The super-admin console types live in ./platform.ts.

/** Plan/subscription state on an organization (mirrors Prisma `PlanStatus`). */
export type PlanStatus = "NONE" | "DEMO" | "ACTIVE" | "EXPIRED";

/** The three kinds of ask a user can send the super-admin. */
export type PlatformRequestKind = "CREATE_ORG" | "CUSTOM_PLAN" | "RESTORE_ORG";
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

/** A user filing a request (create an org / propose a custom plan / restore an org). */
export const createPlatformRequestSchema = z
  .object({
    kind: z.enum(["CREATE_ORG", "CUSTOM_PLAN", "RESTORE_ORG"]),
    planKey: z.string().max(60).optional(),
    requestedDays: z.number().int().positive().max(3650).optional(),
    offeredCoins: z.number().int().nonnegative().max(1_000_000).optional(),
    message: z.string().max(600).optional(),
    targetOrgNumber: z.number().int().positive().optional(), // RESTORE_ORG
  })
  .refine((v) => v.kind !== "CUSTOM_PLAN" || (v.requestedDays && v.offeredCoins != null), {
    message: "A custom-plan request needs the number of days and the coins you offer",
  })
  .refine((v) => v.kind !== "RESTORE_ORG" || v.targetOrgNumber != null, {
    message: "A restore request needs the organization number",
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
