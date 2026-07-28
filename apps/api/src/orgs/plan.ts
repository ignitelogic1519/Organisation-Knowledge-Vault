import { db } from "../db.js";
import { hashOtp } from "../platform/otp.js";
import type { OrgPlanLimitsView, PlanAllowance, PlanStatus } from "@vault/shared";

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

// ── Content allowances ───────────────────────────────────────────────────────
// A plan meters two things separately: documents BUILT in the Studio ("custom
// documents") and documents BROUGHT IN as an upload or a link. Each has a per-plan
// ceiling that an admin may override per organization; null anywhere means unlimited.
// The free demo plan also loses the premium ability to park a draft on the server.

/** The wording every premium gate uses — formal, and it names who can lift the limit. */
export function upgradeNotice(what: string): string {
  return (
    `${what} is part of the premium plan. This organization is currently running on the ` +
    "free demo structure. Please contact your main administrator to arrange an upgrade " +
    "with the Knowledge Base team, and the capability will be enabled for everyone here."
  );
}

export interface PlanContentTerms {
  planKey: string | null;
  planName: string | null;
  planStatus: PlanStatus;
  isFreePlan: boolean;
  documentLimit: number | null;
  uploadLimit: number | null;
  memberLimit: number | null;
  allowDrafts: boolean;
}

/** Resolve an org's effective content terms: per-org override → plan row → unlimited. */
export async function orgPlanTerms(orgId: string): Promise<PlanContentTerms> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      planKey: true,
      planStatus: true,
      planExpiresAt: true,
      memberLimit: true,
      documentLimit: true,
      uploadLimit: true,
    },
  });
  if (!org) throw Object.assign(new Error("Organization not found"), { statusCode: 404 });
  const plan = org.planKey
    ? await db.pricingPlan.findUnique({ where: { key: org.planKey } })
    : null;
  const status = effectivePlanStatus(org.planStatus, org.planExpiresAt);
  // "Free" = the demo plan, an expired plan, or an org that never activated one. A
  // grandfathered NONE org keeps its unlimited legacy behaviour (no plan row, no limits).
  const isFreePlan = status === "DEMO" || status === "EXPIRED" || (plan?.priceCoins ?? 0) === 0;
  return {
    planKey: org.planKey,
    planName: plan?.name ?? null,
    planStatus: status,
    isFreePlan: isFreePlan && org.planStatus !== "NONE",
    documentLimit: org.documentLimit ?? plan?.documentLimit ?? null,
    uploadLimit: org.uploadLimit ?? plan?.uploadLimit ?? null,
    memberLimit: org.memberLimit ?? plan?.memberLimit ?? null,
    allowDrafts: plan?.allowDrafts ?? true,
  };
}

const allowance = (used: number, limit: number | null): PlanAllowance => ({
  used,
  limit,
  remaining: limit == null ? null : Math.max(0, limit - used),
});

/** The Studio / upload form's read of the plan: what is allowed and what is left. */
export async function orgPlanLimitsView(orgId: string): Promise<OrgPlanLimitsView> {
  const terms = await orgPlanTerms(orgId);
  const [documents, uploads, members] = await Promise.all([
    db.course.count({ where: { orgId, source: "STUDIO" } }),
    db.course.count({ where: { orgId, source: "UPLOAD" } }),
    db.membership.count({ where: { orgId } }),
  ]);
  return {
    planKey: terms.planKey,
    planName: terms.planName,
    planStatus: terms.planStatus,
    isFreePlan: terms.isFreePlan,
    documents: allowance(documents, terms.documentLimit),
    uploads: allowance(uploads, terms.uploadLimit),
    members: allowance(members, terms.memberLimit),
    draftsEnabled: terms.allowDrafts,
    upgradeNotice: upgradeNotice("Saving a document as a draft"),
  };
}

/** Throws a 403 when publishing one more document of `source` would break the plan. */
export async function assertContentQuota(
  orgId: string,
  source: "STUDIO" | "UPLOAD",
): Promise<void> {
  const terms = await orgPlanTerms(orgId);
  const limit = source === "STUDIO" ? terms.documentLimit : terms.uploadLimit;
  if (limit == null) return;
  const used = await db.course.count({ where: { orgId, source } });
  if (used < limit) return;
  const what =
    source === "STUDIO"
      ? `custom documents created in the Studio (${limit} of ${limit} used)`
      : `uploaded documents (${limit} of ${limit} used)`;
  throw Object.assign(
    new Error(
      `This organization has reached the plan's allowance of ${what}. Please ask your main ` +
        "administrator to upgrade to a premium plan, or archive and delete documents that " +
        "are no longer required, to free up capacity.",
    ),
    { statusCode: 403 },
  );
}

/** Throws a 403 when the org's plan doesn't include server-side Studio drafts. */
export async function assertDraftsAllowed(orgId: string): Promise<void> {
  const terms = await orgPlanTerms(orgId);
  if (terms.allowDrafts) return;
  throw Object.assign(new Error(upgradeNotice("Saving a document as a draft")), {
    statusCode: 402,
  });
}
