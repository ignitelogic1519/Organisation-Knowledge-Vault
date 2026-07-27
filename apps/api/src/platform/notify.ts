import { db } from "../db.js";

// Notifications that come "from the Super Admin". These are durable receipts (they carry
// OTPs and plan decisions), so they get a 30-DAY retention instead of the usual 7 —
// the cleanup sweep in compliance/routes.ts checks this set. They are profile-scoped and
// org-less, so they show up on the user's global surfaces (the bell + the Account page)
// even before the user belongs to any organization.

export const ADMIN_NOTIFICATION_KINDS = new Set([
  "admin_otp", // an approved OTP to create/restore an org
  "admin_denied", // a denied request, with the admin's message
  "admin_message", // a general message from the super-admin
  "coins_gift", // coins gifted / adjusted
  "plan_upgraded", // an org's plan was changed by the admin
  "plan_expiring", // reminder that a plan is close to expiry
  "plan_expired", // a plan has lapsed
]);

export const ADMIN_NOTIFICATION_RETENTION_MS = 30 * 86400_000;

/** Create a super-admin notification for a user. `payload.category` drives the chip label. */
export async function notifyFromAdmin(
  profileId: string,
  kind: string,
  payload: Record<string, unknown>,
) {
  await db.notification.create({
    data: {
      profileId,
      orgId: null,
      kind,
      payload: { from: "Knowledge Base (Super Admin)", category: "Admin", ...payload },
    },
  });
}
