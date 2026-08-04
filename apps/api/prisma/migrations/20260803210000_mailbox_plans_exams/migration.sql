-- The mailbox, the new plan shape, and exam attempt resets.
--
-- 1. Notification becomes a mail message: it carries its own folder (category), flag
--    (priority), subject/body, and — most importantly — the instant it expires, so
--    retention is a property of the row instead of a rule spread across sweeps.
-- 2. Plans gain a storage ceiling and an upgrade rank; organizations gain a per-org
--    storage override; platform requests carry the shape of the org being asked for.
-- 3. Exam attempts can be voided by a manager, which resets a candidate's allowance
--    without erasing the history of what they sat.

-- AlterTable: Notification → mail message
ALTER TABLE "Notification" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'SYSTEM';
ALTER TABLE "Notification" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Notification" ADD COLUMN "subject" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Notification" ADD COLUMN "body" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Notification" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Existing rows: give them a folder and an expiry so nothing lingers forever.
UPDATE "Notification"
SET "category" = CASE
      WHEN "kind" IN ('admin_otp','admin_denied','admin_message','coins_gift','plan_upgraded') THEN 'ADMIN'
      WHEN "kind" IN ('plan_expiring','plan_expired','coins_spent','plan_activated') THEN 'PLAN'
      WHEN "kind" LIKE 'request_%' THEN 'REQUESTS'
      WHEN "kind" IN ('content_published','content_rejected','course_adopted') THEN 'CONTENT'
      WHEN "kind" IN ('inbox_cleanup') THEN 'SYSTEM'
      ELSE 'LEARNING'
    END,
    "priority" = CASE
      WHEN "kind" IN ('admin_otp','admin_denied','admin_message','coins_gift','plan_upgraded',
                      'plan_expiring','plan_expired','course_overdue','escalation_overdue') THEN 'HIGH'
      WHEN "kind" IN ('inbox_cleanup','course_adopted') THEN 'LOW'
      ELSE 'NORMAL'
    END,
    "expiresAt" = "createdAt" + INTERVAL '14 days';

CREATE INDEX "Notification_profileId_createdAt_idx" ON "Notification"("profileId", "createdAt");
CREATE INDEX "Notification_profileId_category_createdAt_idx" ON "Notification"("profileId", "category", "createdAt");
CREATE INDEX "Notification_expiresAt_idx" ON "Notification"("expiresAt");

-- AlterTable: storage ceilings and the upgrade ladder
ALTER TABLE "Organization" ADD COLUMN "storageLimitMb" INTEGER;
ALTER TABLE "PricingPlan" ADD COLUMN "storageLimitMb" INTEGER;
ALTER TABLE "PricingPlan" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 0;

-- AlterEnum: an existing organization can ask to move up a plan
ALTER TYPE "PlatformRequestKind" ADD VALUE 'UPGRADE_PLAN';

-- AlterTable: what the requester asked for, and what the admin granted
ALTER TABLE "PlatformRequest" ADD COLUMN "requestedMembers" INTEGER;
ALTER TABLE "PlatformRequest" ADD COLUMN "requestedDocuments" INTEGER;
ALTER TABLE "PlatformRequest" ADD COLUMN "requestedUploads" INTEGER;
ALTER TABLE "PlatformRequest" ADD COLUMN "grantedMembers" INTEGER;
ALTER TABLE "PlatformRequest" ADD COLUMN "grantedDocuments" INTEGER;
ALTER TABLE "PlatformRequest" ADD COLUMN "grantedUploads" INTEGER;

-- AlterTable: a manager can reset a candidate's exam allowance
ALTER TABLE "ExamAttempt" ADD COLUMN "voided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ExamAttempt" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "ExamAttempt" ADD COLUMN "voidedByProfileId" TEXT;
