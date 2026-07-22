-- Branches are public by default now — hiding is the explicit checkbox choice.
-- Existing branches flip to visible so the org chart is transparent out of the box;
-- owners above a hidden node keep seeing it regardless (hierarchy transparency).

-- AlterTable
ALTER TABLE "RoleNode" ALTER COLUMN "isPublic" SET DEFAULT true;

-- Backfill: make the existing tree visible under the new default
UPDATE "RoleNode" SET "isPublic" = true;
