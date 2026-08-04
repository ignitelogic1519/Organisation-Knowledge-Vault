-- Knowledge Vault Employee Perk, and the organization logo.
--
-- KVEP is an internal organization created by one of our own super-admins for staff
-- use. It skips the storage step entirely and keeps its content in our database via the
-- inline adapter, exactly as every organization did before organization-provided
-- storage existed. Requesting one and creating one both require a super-admin username
-- and password, which is what keeps the perk internal.
--
-- Additive: existing organizations are not KVEP and have no logo, which is the correct
-- reading of both defaults.

ALTER TYPE "PlatformRequestKind" ADD VALUE 'KVEP_ORG';

ALTER TABLE "Organization" ADD COLUMN "isKvep" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "logo" TEXT;
