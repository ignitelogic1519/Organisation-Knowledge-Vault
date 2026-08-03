-- MCQ exams: the Studio's second creation mode. An exam is an ordinary Course (same code,
-- classification, library shelf and placement rules) whose storageRef holds the paper;
-- every sitting is recorded here, and a passing one writes the usual CompletionRecord.

-- AlterEnum
ALTER TYPE "CourseKind" ADD VALUE 'EXAM';

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "courseVersion" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL,
    "earnedPoints" DOUBLE PRECISION NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "scorePercent" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "seconds" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamAttempt_courseId_profileId_idx" ON "ExamAttempt"("courseId", "profileId");

-- CreateIndex
CREATE INDEX "ExamAttempt_orgId_submittedAt_idx" ON "ExamAttempt"("orgId", "submittedAt");

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
