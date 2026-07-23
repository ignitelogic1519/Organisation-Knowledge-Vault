-- Members can be granted content-creation rights; the content they create is a draft that
-- goes through a manager review request before it publishes.

-- AlterEnum
ALTER TYPE "RequestKind" ADD VALUE 'CONTENT_REVIEW';

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN "canCreateContent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invitation" ADD COLUMN "canCreateContent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "draft" BOOLEAN NOT NULL DEFAULT false;
