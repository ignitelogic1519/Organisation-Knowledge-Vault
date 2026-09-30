-- Google Drive as a second organization-provided backend (docs/structure.md §9.16).
-- Additive only: S3 columns become optional because a Drive organization has none,
-- and existing NAS rows keep every value they had.

-- AlterTable
ALTER TABLE "OrgStorage" ADD COLUMN     "credentialEnc" TEXT,
ADD COLUMN     "degradedReason" TEXT,
ADD COLUMN     "failingSince" TIMESTAMP(3),
ADD COLUMN     "gdriveAccountEmail" TEXT,
ADD COLUMN     "gdriveFolders" JSONB,
ADD COLUMN     "gdriveHealthFileId" TEXT,
ADD COLUMN     "gdriveHostedDomain" TEXT,
ADD COLUMN     "gdriveObjectsId" TEXT,
ADD COLUMN     "gdriveRootId" TEXT,
ADD COLUMN     "gdriveTarget" TEXT,
ADD COLUMN     "quotaCheckedAt" TIMESTAMP(3),
ADD COLUMN     "quotaLimitBytes" BIGINT,
ADD COLUMN     "quotaUsedBytes" BIGINT,
ADD COLUMN     "remoteTargetKey" TEXT,
ADD COLUMN     "ticketEpoch" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "endpoint" DROP NOT NULL,
ALTER COLUMN "bucket" DROP NOT NULL,
ALTER COLUMN "accessKeyIdEnc" DROP NOT NULL,
ALTER COLUMN "secretKeyEnc" DROP NOT NULL;

-- AlterTable
ALTER TABLE "StorageDeletion" ADD COLUMN     "remoteId" TEXT;

-- AlterTable
ALTER TABLE "StorageObject" ADD COLUMN     "cipherBytes" INTEGER,
ADD COLUMN     "cipherSha256" TEXT,
ADD COLUMN     "frameBytes" INTEGER,
ADD COLUMN     "headerBytes" INTEGER,
ADD COLUMN     "nonceBase" TEXT,
ADD COLUMN     "remoteId" TEXT,
ADD COLUMN     "remoteRevision" TEXT;

-- CreateTable
CREATE TABLE "StorageUploadSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "sessionUriEnc" TEXT NOT NULL,
    "totalBytes" INTEGER NOT NULL,
    "confirmedBytes" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoragePendingConnection" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "credentialEnc" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "hostedDomain" TEXT,
    "gdriveRootId" TEXT,
    "gdriveObjectsId" TEXT,
    "gdriveHealthFileId" TEXT,
    "testedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoragePendingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamUsage" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "StreamUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageUploadSession_storageObjectId_key" ON "StorageUploadSession"("storageObjectId");

-- CreateIndex
CREATE INDEX "StorageUploadSession_orgId_idx" ON "StorageUploadSession"("orgId");

-- CreateIndex
CREATE INDEX "StorageUploadSession_expiresAt_idx" ON "StorageUploadSession"("expiresAt");

-- CreateIndex
CREATE INDEX "StoragePendingConnection_profileId_idx" ON "StoragePendingConnection"("profileId");

-- CreateIndex
CREATE INDEX "StoragePendingConnection_expiresAt_idx" ON "StoragePendingConnection"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreamUsage_month_orgId_key" ON "StreamUsage"("month", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgStorage_remoteTargetKey_key" ON "OrgStorage"("remoteTargetKey");

-- CreateIndex
CREATE INDEX "StorageObject_remoteId_idx" ON "StorageObject"("remoteId");

