import { NOTIFICATION_KINDS, RETENTION_DAYS } from "@vault/shared";
import { deliver, type NotifyOptions } from "../notifications/mailbox.js";

// Messages that come "from the Knowledge Base team" (the super-admin). They are durable
// receipts — they carry access codes, coin adjustments and plan decisions — so the shared
// catalog files them under the ADMIN folder at HIGH priority with a 30-day life. They are
// profile-scoped and org-less, so they reach the user's mailbox on every page, even before
// that user belongs to any organization.

/** Kinds the catalog files under ADMIN — used by the legacy retention sweep. */
export const ADMIN_NOTIFICATION_KINDS = new Set(
  Object.entries(NOTIFICATION_KINDS)
    .filter(([, meta]) => meta.category === "ADMIN")
    .map(([kind]) => kind),
);

export const ADMIN_NOTIFICATION_RETENTION_MS = RETENTION_DAYS.ADMIN * 86400_000;

/** Create a super-admin message for a user. */
export async function notifyFromAdmin(
  profileId: string,
  kind: string,
  payload: Record<string, unknown>,
  options: NotifyOptions = {},
) {
  await deliver(
    profileId,
    null,
    kind,
    { from: "Knowledge Base (Super Admin)", category: "Admin", ...payload },
    {
      subject: typeof payload.title === "string" ? payload.title : undefined,
      body: typeof payload.message === "string" ? payload.message : undefined,
      ...options,
    },
  );
}
