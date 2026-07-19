-- Username identity (owner decision 2026-07-19): the email system is removed from v1.
-- Data-preserving: existing email values BECOME the usernames.
ALTER TABLE "Profile" RENAME COLUMN "email" TO "username";
ALTER INDEX "Profile_email_key" RENAME TO "Profile_username_key";
ALTER TABLE "Profile" DROP COLUMN "googleId";
ALTER TABLE "Profile" DROP COLUMN "emailVerifiedAt";

ALTER TABLE "Invitation" RENAME COLUMN "email" TO "username";
ALTER INDEX "Invitation_email_idx" RENAME TO "Invitation_username_idx";

DROP TABLE "EmailToken";
