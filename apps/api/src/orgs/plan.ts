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

/** The org's effective member cap: a per-org override, else the plan's limit, else null (∞). */
export async function orgEffectiveMemberLimit(orgId: string): Promise<number | null> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { memberLimit: true, planKey: true },
  });
  if (!org) return null;
  if (org.memberLimit != null) return org.memberLimit;
  if (!org.planKey) return null;
  const plan = await db.pricingPlan.findUnique({ where: { key: org.planKey }, select: { memberLimit: true } });
  return plan?.memberLimit ?? null;
}

/** Throws a 403 if adding `profileId` (not already a member) would exceed the org's limit. */
export async function assertMemberLimit(orgId: string, profileId: string): Promise<void> {
  const already = await db.membership.findUnique({
    where: { profileId_orgId: { profileId, orgId } },
  });
  if (already) return; // existing member — placing on another role doesn't grow the count
  const limit = await orgEffectiveMemberLimit(orgId);
  if (limit == null) return;
  const count = await db.membership.count({ where: { orgId } });
  if (count >= limit) {
    throw Object.assign(
      new Error(`This organization's plan allows up to ${limit} members. Upgrade the plan to add more.`),
      { statusCode: 403 },
    );
  }
}

/** DEMO/ACTIVE plans past their expiry read as EXPIRED (without needing a write). */
export function effectivePlanStatus(status: PlanStatus, expiresAt: Date | null): PlanStatus {
  if ((status === "DEMO" || status === "ACTIVE") && expiresAt && expiresAt < new Date()) {
    return "EXPIRED";
  }
  return status;
}
