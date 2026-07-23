-- The organization document standard: compulsory classification, page-2 scope,
-- owner-controlled downloads, and course archival.

-- CreateEnum
CREATE TYPE "Classification" AS ENUM ('PUBLIC', 'CONFIDENTIAL', 'PRIVATE', 'SECRET');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN "scope" TEXT;
ALTER TABLE "Course" ADD COLUMN "classification" "Classification" NOT NULL DEFAULT 'CONFIDENTIAL';
ALTER TABLE "Course" ADD COLUMN "allowDownload" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
