-- Terminal roles are removed from the product; branches gain public visibility,
-- owners gain a co-owner-appointment flag, courses gain library metadata, and the
-- ask-and-approve request system (course / join / deletion requests) arrives.

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('COURSE_ASSIGN', 'JOIN_BRANCH', 'DELETE_BRANCH');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: RoleNode — drop the terminal flag, add public visibility
ALTER TABLE "RoleNode" DROP COLUMN "isTerminal";
ALTER TABLE "RoleNode" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Placement — whether an owner may appoint co-owners on their node
ALTER TABLE "Placement" ADD COLUMN "canAddCoOwners" BOOLEAN NOT NULL DEFAULT false;

-- Root-role owners have always been able to shape their org: keep that true
UPDATE "Placement" SET "canAddCoOwners" = true
WHERE "kind" = 'OWNER'
  AND "roleNodeId" IN (SELECT "id" FROM "RoleNode" WHERE "parentId" IS NULL);

-- AlterTable: Invitation
ALTER TABLE "Invitation" ADD COLUMN "canAddCoOwners" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Course — library metadata
ALTER TABLE "Course" ADD COLUMN "description" TEXT;
ALTER TABLE "Course" ADD COLUMN "inLibrary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: CoursePlacement — per-branch overrides configured at approval time
ALTER TABLE "CoursePlacement" ADD COLUMN "deadlineDays" INTEGER;
ALTER TABLE "CoursePlacement" ADD COLUMN "retakeEveryNDays" INTEGER;

-- CreateTable
CREATE TABLE "VaultRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requesterProfileId" TEXT NOT NULL,
    "targetRoleNodeId" TEXT NOT NULL,
    "courseId" TEXT,
    "message" TEXT,
    "decidedByProfileId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultRequest_orgId_status_idx" ON "VaultRequest"("orgId", "status");

-- CreateIndex
CREATE INDEX "VaultRequest_requesterProfileId_idx" ON "VaultRequest"("requesterProfileId");
