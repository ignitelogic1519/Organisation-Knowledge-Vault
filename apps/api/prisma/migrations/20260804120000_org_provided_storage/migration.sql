-- Organization-provided storage (docs/structure.md §9).
--
-- Document bytes move off our Postgres and onto storage the organization owns: an
-- S3-compatible endpoint, offered as "NAS" and documented with MinIO.
--
-- This migration is deliberately ADDITIVE. Nothing existing is dropped or rewritten:
-- organizations with no storage connected keep using the inline adapter exactly as
-- before, and their StoredFile rows are untouched until they choose to migrate.

-- ── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "StorageStatus" AS ENUM ('UNCONFIGURED', 'ACTIVE', 'DEGRADED');
CREATE TYPE "EncryptionPosture" AS ENUM ('ENCRYPTED', 'PLAIN');

-- ── The organization's backend ──────────────────────────────────────────────
-- accessKeyIdEnc/secretKeyEnc are sealed with STORAGE_KEK, which lives in the
-- environment and never in this database: a dump alone must not reach a customer's
-- storage. wrappedDek holds the org data key under the platform KEK — the
-- Supreme-wrapped copy is computed at .main export time and deliberately not stored.
CREATE TABLE "OrgStorage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "adapter" TEXT NOT NULL DEFAULT 's3',
    "endpoint" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "prefix" TEXT NOT NULL DEFAULT '',
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT true,
    "accessKeyIdEnc" TEXT NOT NULL,
    "secretKeyEnc" TEXT NOT NULL,
    "wrappedDek" TEXT,
    "status" "StorageStatus" NOT NULL DEFAULT 'UNCONFIGURED',
    "encryption" "EncryptionPosture" NOT NULL DEFAULT 'ENCRYPTED',
    "lastCheckAt" TIMESTAMP(3),
    "lastError" TEXT,
    "degradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgStorage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgStorage_orgId_key" ON "OrgStorage"("orgId");

ALTER TABLE "OrgStorage" ADD CONSTRAINT "OrgStorage_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── One row per object held in the organization's storage ───────────────────
-- Unlike StoredFile this carries a real course link and an integrity hash, so orphan
-- collection is an indexed query rather than a scan of every course's storageRef JSON.
CREATE TABLE "StorageObject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "wrappedKey" TEXT,
    "courseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageObject_orgId_objectKey_key" ON "StorageObject"("orgId", "objectKey");
CREATE INDEX "StorageObject_orgId_idx" ON "StorageObject"("orgId");
CREATE INDEX "StorageObject_courseId_idx" ON "StorageObject"("courseId");

-- ── The durable delete queue ────────────────────────────────────────────────
-- A remote delete cannot run inside a Postgres transaction, so course deletion commits
-- a row here with its transaction and the drain executes it afterwards, with retries.
-- Without this, a crash between the two would leave an object the customer pays to
-- store forever.
CREATE TABLE "StorageDeletion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextTryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageDeletion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorageDeletion_nextTryAt_idx" ON "StorageDeletion"("nextTryAt");
CREATE INDEX "StorageDeletion_orgId_idx" ON "StorageDeletion"("orgId");
