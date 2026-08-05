-- Document version control, the edition log, and the review channel.
--
-- Three things were missing and are added together because they are one story: an author
-- publishing a document had no way to say what it replaces, no record of what each
-- edition changed, and no way to hear back from the manager reviewing it other than
-- "approved" or "gone".
--
--  1. Course.supersedes/supersededBy  — replace-or-coexist, decided at publish time.
--  2. CourseEdition                   — one row per publication: what changed, when, who.
--  3. RequestMessage + CHANGES_REQUESTED — a reviewer can send a draft BACK with
--     suggestions instead of deleting the author's work.

-- ── 1. Replacement links ────────────────────────────────────────────────────
ALTER TABLE "Course" ADD COLUMN "supersedesCourseId" TEXT;
ALTER TABLE "Course" ADD COLUMN "supersededByCourseId" TEXT;
ALTER TABLE "Course" ADD COLUMN "supersededAt" TIMESTAMP(3);

CREATE INDEX "Course_supersedesCourseId_idx" ON "Course"("supersedesCourseId");
CREATE INDEX "Course_supersededByCourseId_idx" ON "Course"("supersededByCourseId");

-- ── 2. The edition log ──────────────────────────────────────────────────────
CREATE TABLE "CourseEdition" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "source" "ContentSource" NOT NULL,
    "resetCompletions" BOOLEAN NOT NULL DEFAULT false,
    "publishedByProfileId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEdition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseEdition_courseId_version_key" ON "CourseEdition"("courseId", "version");
CREATE INDEX "CourseEdition_courseId_publishedAt_idx" ON "CourseEdition"("courseId", "publishedAt");

ALTER TABLE "CourseEdition"
  ADD CONSTRAINT "CourseEdition_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every course that exists today has published at least its current edition.
-- Without this the history panel would open empty on documents that predate the log.
INSERT INTO "CourseEdition" ("id", "courseId", "version", "note", "source", "resetCompletions", "publishedByProfileId", "publishedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  "version",
  'Recorded when the edition log was introduced',
  "source",
  "resetsCompletionOnUpdate",
  "createdByProfileId",
  "createdAt"
FROM "Course";

-- ── 3. The review channel ───────────────────────────────────────────────────
ALTER TYPE "RequestStatus" ADD VALUE 'CHANGES_REQUESTED';

ALTER TABLE "VaultRequest" ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "VaultRequest" ADD COLUMN "revisionRound" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VaultRequest" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "RequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorProfileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REPLY',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RequestMessage_requestId_createdAt_idx" ON "RequestMessage"("requestId", "createdAt");

ALTER TABLE "RequestMessage"
  ADD CONSTRAINT "RequestMessage_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "VaultRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The opening message of every Document review already exists as the request's own
-- `message` — lift it into the thread so a returning author reads one conversation.
INSERT INTO "RequestMessage" ("id", "requestId", "authorProfileId", "kind", "body", "createdAt")
SELECT
  gen_random_uuid()::text,
  "id",
  "requesterProfileId",
  'REPLY',
  "message",
  "createdAt"
FROM "VaultRequest"
WHERE "kind" = 'CONTENT_REVIEW' AND "message" IS NOT NULL AND length(trim("message")) > 0;
