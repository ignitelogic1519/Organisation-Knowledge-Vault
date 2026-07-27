import { createHmac } from "node:crypto";
import { env } from "../env.js";
import type { Organization } from "@prisma/client";

// The plan snapshot embedded in a .main file. Because the file is encrypted with the user's
// Supreme password (which the org owner holds), the plan claim is ALSO signed with a server
// secret (HMAC) so an owner cannot forge a "paid forever" file: on revive the server
// verifies this signature before trusting the plan. Unsigned/legacy files are treated as
// needing a fresh plan (see routes).

export interface PlanClaim {
  planKey: string | null;
  planStatus: string;
  planActivatedAt: string | null;
  planExpiresAt: string | null;
  planIsCustom: boolean;
}

export function buildPlanClaim(org: Organization): PlanClaim {
  return {
    planKey: org.planKey,
    planStatus: org.planStatus,
    planActivatedAt: org.planActivatedAt?.toISOString() ?? null,
    planExpiresAt: org.planExpiresAt?.toISOString() ?? null,
    planIsCustom: org.planIsCustom,
  };
}

function canonical(orgNumber: number, claim: PlanClaim): string {
  return JSON.stringify([
    orgNumber,
    claim.planKey,
    claim.planStatus,
    claim.planActivatedAt,
    claim.planExpiresAt,
    claim.planIsCustom,
  ]);
}

export function signPlanClaim(orgNumber: number, claim: PlanClaim): string {
  return createHmac("sha256", env.jwtSecret).update(canonical(orgNumber, claim)).digest("hex");
}

export function verifyPlanClaim(orgNumber: number, claim: PlanClaim | undefined, sig: string | undefined): boolean {
  if (!claim || !sig) return false;
  const expected = signPlanClaim(orgNumber, claim);
  // constant-time-ish compare
  return expected.length === sig.length && createHmac("sha256", env.jwtSecret).update(expected).digest("hex") === createHmac("sha256", env.jwtSecret).update(sig).digest("hex");
}

/** Whether a claim means the org can be revived directly (active, unexpired, non-demo). */
export function claimAllowsFreeRevive(claim: PlanClaim | undefined, sig: string | undefined, orgNumber: number): boolean {
  if (!verifyPlanClaim(orgNumber, claim, sig)) return false;
  if (!claim) return false;
  if (claim.planStatus !== "ACTIVE") return false; // DEMO / EXPIRED / NONE need a restore
  if (claim.planExpiresAt && new Date(claim.planExpiresAt) < new Date()) return false;
  return true;
}
