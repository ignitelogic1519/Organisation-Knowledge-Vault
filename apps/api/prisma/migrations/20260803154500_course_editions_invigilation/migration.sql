-- Editing published Studio material: a course can be taken OUT OF DEPLOYMENT while a new
-- edition is written (it reaches nobody and leaves the library, but keeps its placements),
-- and publishing the edit puts it back with the version bumped — v1.0 → v2.0.
--
-- And exam invigilation: what an attempt records about the candidate leaving the paper.

-- AlterTable
ALTER TABLE "Course" ADD COLUMN "withdrawn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" ADD COLUMN "withdrawnAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN "violations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExamAttempt" ADD COLUMN "autoSubmitted" BOOLEAN NOT NULL DEFAULT false;
