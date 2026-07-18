-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "nextRoleNumber" INTEGER NOT NULL DEFAULT 101;

-- CreateTable
CREATE TABLE "SupremeAudit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorProfileId" TEXT,
    "ip" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupremeAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupremeAudit_orgId_createdAt_idx" ON "SupremeAudit"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupremeAudit" ADD CONSTRAINT "SupremeAudit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Platform-unique organization numbers: monotonic, never reused (docs/structure.md §5.1)
CREATE SEQUENCE IF NOT EXISTS org_number_seq START WITH 100;
