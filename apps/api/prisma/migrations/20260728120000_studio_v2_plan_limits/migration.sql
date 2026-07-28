-- Studio v2: separate plan allowances for Studio-authored ("custom") documents and for
-- uploaded/linked documents, a premium-only server-side draft store, and the content
-- source flag the quota counters read.

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('STUDIO', 'UPLOAD');

-- AlterTable: plan-level allowances (null = unlimited / admin-set)
ALTER TABLE "PricingPlan" ADD COLUMN "documentLimit" INTEGER;
ALTER TABLE "PricingPlan" ADD COLUMN "uploadLimit" INTEGER;
ALTER TABLE "PricingPlan" ADD COLUMN "allowDrafts" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: per-organization overrides of the plan's allowances
ALTER TABLE "Organization" ADD COLUMN "documentLimit" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "uploadLimit" INTEGER;

-- AlterTable: where each course's content came from
ALTER TABLE "Course" ADD COLUMN "source" "ContentSource" NOT NULL DEFAULT 'UPLOAD';

-- Backfill: everything stored through the `authored` adapter was built in the Studio
UPDATE "Course" SET "source" = 'STUDIO' WHERE "storageRef"->>'adapter' = 'authored';

-- CreateTable: work-in-progress Studio documents (premium plans)
CREATE TABLE "StudioDraft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleNodeId" TEXT NOT NULL,
    "authorProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "document" JSONB NOT NULL,
    "blockCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioDraft_orgId_authorProfileId_updatedAt_idx" ON "StudioDraft"("orgId", "authorProfileId", "updatedAt");

-- AddForeignKey
ALTER TABLE "StudioDraft" ADD CONSTRAINT "StudioDraft_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
