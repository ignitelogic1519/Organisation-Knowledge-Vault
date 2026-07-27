-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('NONE', 'DEMO', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlatformRequestKind" AS ENUM ('CREATE_ORG', 'CUSTOM_PLAN', 'RESTORE_ORG');

-- CreateEnum
CREATE TYPE "PlatformRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'USED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CoinTxnReason" AS ENUM ('SIGNUP_GRANT', 'ADMIN_GIFT', 'ADMIN_DEDUCT', 'PLAN_SPEND', 'REFUND');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "planActivatedAt" TIMESTAMP(3),
ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planGrantedById" TEXT,
ADD COLUMN     "planIsCustom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planKey" TEXT,
ADD COLUMN     "planStatus" "PlanStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 150;

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Plans',
    "priceCoins" INTEGER NOT NULL DEFAULT 0,
    "durationDays" INTEGER,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "criteria" TEXT,
    "badge" TEXT,
    "highlights" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRequest" (
    "id" TEXT NOT NULL,
    "kind" "PlatformRequestKind" NOT NULL,
    "status" "PlatformRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "planKey" TEXT,
    "requestedDays" INTEGER,
    "offeredCoins" INTEGER,
    "message" TEXT,
    "grantedDays" INTEGER,
    "priceCoins" INTEGER,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "adminMessage" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "targetOrgNumber" INTEGER,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinTransaction" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reason" "CoinTxnReason" NOT NULL,
    "note" TEXT,
    "byAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdminAudit" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingPlan_key_key" ON "PricingPlan"("key");

-- CreateIndex
CREATE INDEX "PricingPlan_category_active_sortOrder_idx" ON "PricingPlan"("category", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_username_key" ON "PlatformAdmin"("username");

-- CreateIndex
CREATE INDEX "PlatformRequest_requesterId_status_idx" ON "PlatformRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "PlatformRequest_status_createdAt_idx" ON "PlatformRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CoinTransaction_profileId_createdAt_idx" ON "CoinTransaction"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAdminAudit_adminId_createdAt_idx" ON "PlatformAdminAudit"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformRequest" ADD CONSTRAINT "PlatformRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
