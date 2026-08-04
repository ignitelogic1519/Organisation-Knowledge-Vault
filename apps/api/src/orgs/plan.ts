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
  /** The code came from a KVEP request: an internal org, hosted on our storage. */
  isKvep: boolean;
}

/** Validate an access code for a user; return the granted plan terms or throw a 4xx. */
export async function redeemAccessCode(
  profileId: string,
  code: string,
  kinds: ("CREATE_ORG" | "CUSTOM_PLAN" | "RESTORE_ORG" | "KVEP_ORG")[] = [
    "CREATE_ORG",
    "CUSTOM_PLAN",
    "KVEP_ORG",
  ],
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
    isKvep: request.kind === "KVEP_ORG",
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
  /** Total stored bytes allowed, in MB; null = unmetered. */
  storageLimitMb: number | null;
  allowDrafts: boolean;
}

/**
 * Bytes this organization currently holds, in MB (rounded up).
 *
 * Counts both stores: files still in our Postgres (`StoredFile`) and objects in the
 * organization's own storage (`StorageObject`). Before organization-provided storage
 * existed this summed `StoredFile` alone, which is also why the plan ceilings have
 * never seen a Studio document or an exam paper — those live inside `Course.storageRef`
 * JSON and are not metered by either table (docs/structure.md §9.12).
 */
export async function orgStorageUsedMb(orgId: string): Promise<number> {
  const [inline, external] = await Promise.all([
    db.storedFile.aggregate({ where: { orgId }, _sum: { size: true } }),
    db.storageObject.aggregate({ where: { orgId }, _sum: { bytes: true } }),
  ]);
  const total = (inline._sum.size ?? 0) + (external._sum.bytes ?? 0);
  return Math.ceil(total / (1024 * 1024));
}

/**
 * Storage ceilings apply to what WE hold. Once an organization brings its own storage
 * the bytes are on their hardware and their bill, so the platform ceiling stops
 * applying — the document and upload counts still do.
 */
export async function orgUsesOwnStorage(orgId: string): Promise<boolean> {
  const row = await db.orgStorage.findUnique({ where: { orgId }, select: { status: true } });
  return row != null && row.status !== "UNCONFIGURED";
}

/**
 * Verify a super-admin's own username and password. This is the KVEP gate: the perk is
 * for our staff, so proving you hold staff credentials is what makes it internal.
 *
 * Deliberately generic on failure — it must not reveal whether a username exists.
 */
export async function verifyPlatformAdminCredentials(
  username: string,
  password: string,
): Promise<{ id: string; username: string }> {
  const { verify: argonVerify } = await import("@node-rs/argon2");
  const admin = await db.platformAdmin.findUnique({
    where: { username: username.trim().toLowerCase() },
  });
  const ok =
    admin && admin.active && (await argonVerify(admin.passwordHash, password).catch(() => false));
  if (!admin || !ok) {
    throw Object.assign(new Error("Wrong super-admin username or password"), { statusCode: 401 });
  }
  return { id: admin.id, username: admin.username };
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
      storageLimitMb: true,
    },
  });
  if (!org) throw Object.assign(new Error("Organization not found"), { statusCode: 404 });
  const plan = org.planKey
    ? await db.pricingPlan.findUnique({ where: { key: org.planKey } })
    : null;
  const status = effectivePlanStatus(org.planStatus, org.planExpiresAt);
  // "Free" = the demo plan, an expired plan, or an org that never activated one. A
  // grandfathered NONE org keeps its unlimited legacy behaviour (no plan row, no limits).
  const free =
    (status === "DEMO" || status === "EXPIRED" || (plan?.priceCoins ?? 0) === 0) &&
    org.planStatus !== "NONE";
  return {
    planKey: org.planKey,
    planName: plan?.name ?? null,
    planStatus: status,
    isFreePlan: free,
    documentLimit: org.documentLimit ?? plan?.documentLimit ?? null,
    uploadLimit: org.uploadLimit ?? plan?.uploadLimit ?? null,
    memberLimit: org.memberLimit ?? plan?.memberLimit ?? null,
    storageLimitMb: org.storageLimitMb ?? plan?.storageLimitMb ?? null,
    // Parking work on the server is a paid capability (docs/pricing.md §2b). A free plan
    // never has it, and a plan that has LAPSED loses it — otherwise an expired paid org
    // would keep a premium capability indefinitely. A grandfathered NONE org (one created
    // before plans existed) is not "free", it is unmetered, and keeps its drafts.
    allowDrafts: (plan?.allowDrafts ?? true) && !free,
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
  const [documents, uploads, members, storageMb] = await Promise.all([
    db.course.count({ where: { orgId, source: "STUDIO" } }),
    db.course.count({ where: { orgId, source: "UPLOAD" } }),
    db.membership.count({ where: { orgId } }),
    orgStorageUsedMb(orgId),
  ]);
  return {
    planKey: terms.planKey,
    planName: terms.planName,
    planStatus: terms.planStatus,
    isFreePlan: terms.isFreePlan,
    documents: allowance(documents, terms.documentLimit),
    uploads: allowance(uploads, terms.uploadLimit),
    members: allowance(members, terms.memberLimit),
    storageMb: allowance(storageMb, terms.storageLimitMb),
    draftsEnabled: terms.allowDrafts,
    upgradeNotice: upgradeNotice("Saving a document as a draft"),
  };
}

/**
 * Throws a 403 when publishing one more document of `source` would break the plan. Paid
 * plans do not meter documents at all (limit = null); the free plan stops at whichever
 * ceiling arrives first — the document count or the storage ceiling.
 */
export async function assertContentQuota(
  orgId: string,
  source: "STUDIO" | "UPLOAD",
  addingBytes = 0,
): Promise<void> {
  const terms = await orgPlanTerms(orgId);
  const limit = source === "STUDIO" ? terms.documentLimit : terms.uploadLimit;
  if (limit != null) {
    const used = await db.course.count({ where: { orgId, source } });
    if (used >= limit) {
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
  }
  // The storage ceiling meters OUR disks. An organization storing on its own hardware
  // has already taken that cost off us, so the ceiling no longer applies to it.
  if (terms.storageLimitMb != null && !(await orgUsesOwnStorage(orgId))) {
    const usedMb = await orgStorageUsedMb(orgId);
    const addingMb = Math.ceil(addingBytes / (1024 * 1024));
    if (usedMb + addingMb > terms.storageLimitMb) {
      throw Object.assign(
        new Error(
          `This organization has used ${usedMb} MB of the ${terms.storageLimitMb} MB its plan ` +
            "includes. Please ask your main administrator to upgrade to a premium plan, or " +
            "delete material that is no longer required, to free up space.",
        ),
        { statusCode: 403 },
      );
    }
  }
}

/** Throws a 403 when the org's plan doesn't include server-side Studio drafts. */
export async function assertDraftsAllowed(orgId: string): Promise<void> {
  const terms = await orgPlanTerms(orgId);
  if (terms.allowDrafts) return;
  throw Object.assign(new Error(upgradeNotice("Saving a document as a draft")), {
    statusCode: 402,
  });
}
