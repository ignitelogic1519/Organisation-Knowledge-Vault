-- Plan renewal & expiry reminders: owners of an existing organization can ask the
-- super-admin to renew or upgrade its plan, and the nightly job warns them before the
-- plan lapses (20 → 7 → 1 days out).

-- AlterEnum: a renewal request targets an org that already exists, so approving it
-- applies the plan directly instead of minting an OTP to redeem.
ALTER TYPE "PlatformRequestKind" ADD VALUE 'PLAN_RENEWAL';

-- AlterTable: the lowest reminder rung already sent for the current plan period.
-- Null = nothing sent yet (also the state a freshly renewed plan is reset to).
ALTER TABLE "Organization" ADD COLUMN "planReminderDays" INTEGER;
