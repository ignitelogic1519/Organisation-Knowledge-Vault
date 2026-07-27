import { db } from "../db.js";
import { hashOtp } from "../platform/otp.js";
import type { PlanStatus } from "@vault/shared";

// Plan helpers shared by org creation and restore: redeem an access code (OTP) into the
// plan terms it grants, and derive the plan status/expiry the org row will carry.

export interface RedeemedPlan {
  requestId: string;
  planKey: string;
  priceCoins: number;
  days: number | null; // duration granted (null = unlimited)
  isCustom: boolean;
}

/** Validate an access code for a user; return the granted plan terms or throw a 4xx. */
export async function redeemAccessCode(
  profileId: string,
  code: string,
  kinds: ("CREATE_ORG" | "CUSTOM_PLAN" | "RESTORE_ORG")[] = ["CREATE_ORG", "CUSTOM_PLAN"],
): Promise<RedeemedPlan> {
  const request = await db.platformRequest.findFirst({
    where: { requesterId: profileId, otpHash: hashOtp(code), status: "APPROVED", kind: { in: kinds } },
  });
  if (!request) {
    throw Object.assign(new Error("Invalid access code — check it or request a new one"), { statusCode: 403 });
  }
  if (!request.otpExpiresAt || request.otpExpiresAt < new Date()) {
    await db.platformRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
    throw Object.assign(new Error("This access code has expired — please request a new one"), { statusCode: 403 });
  }
  const plan = request.planKey ? await db.pricingPlan.findUnique({ where: { key: request.planKey } }) : null;
  return {
    requestId: request.id,
    planKey: request.planKey ?? "custom",
    priceCoins: request.priceCoins ?? 0,
    days: request.grantedDays ?? plan?.durationDays ?? null,
    isCustom: request.kind === "CUSTOM_PLAN" || (plan?.isCustom ?? false),
  };
}

export function planStatusFor(planKey: string | null): PlanStatus {
  if (!planKey || planKey === "custom") return planKey === "custom" ? "ACTIVE" : "NONE";
  return planKey === "demo" ? "DEMO" : "ACTIVE";
}

export function expiryFrom(days: number | null): Date | null {
  return days ? new Date(Date.now() + days * 86400_000) : null;
}
