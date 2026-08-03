import type { FastifyInstance } from "fastify";
import {
  can,
  checkExamAnswerSchema,
  correctOptionIds,
  examBodySchema,
  gradeExam,
  isAnswerCorrect,
  questionWeight,
  shuffled,
  submitExamSchema,
  type ExamAttemptResultView,
  type ExamBody,
  type ExamCheckView,
  type ExamPaperQuestion,
  type ExamPaperView,
} from "@vault/shared";
import { db } from "../db.js";
import { actorPlacements, toRoleRef } from "../roles/helpers.js";
import { storage, type StorageRef } from "../storage/adapter.js";
import { coursesReaching, recordCompletion, toLearningItem } from "../courses/helpers.js";
import type { Course } from "@prisma/client";

// Exam delivery & marking. The stored paper (with its answer key) never leaves the server:
// GET /courses/:code/exam deals a candidate's copy without the key, POST .../attempts marks
// what they send back, and POST .../check answers the single question a live-feedback exam
// asks about mid-paper. A passing attempt writes the ordinary completion record, so an exam
// lands in My Learning and the compliance views exactly as a document does.

/** Load an EXAM course and parse its stored paper. */
async function loadExam(code: string): Promise<{ course: Course; exam: ExamBody } | null> {
  const course = await db.course.findUnique({ where: { code } });
  if (!course || course.kind !== "EXAM") return null;
  const content = await storage.resolve(course.storageRef as unknown as StorageRef);
  if (content.exam === undefined) return null;
  // Re-parse: a paper written by an older Studio still opens, with anything the current
  // format no longer accepts dropped.
  return { course, exam: examBodySchema.parse(content.exam) };
}

/** May this profile edit the exam (and therefore preview it without sitting it)? */
async function canManageExam(profileId: string, course: Course): Promise<boolean> {
  if (course.createdByProfileId === profileId) return true;
  const access = await db.courseAdminAccess.findUnique({
    where: { courseId_profileId: { courseId: course.id, profileId } },
  });
  if (access?.level === "EDIT") return true;
  const homeNode = await db.roleNode.findUnique({ where: { id: course.uploaderRoleNodeId } });
  if (!homeNode) return false;
  const placements = await actorPlacements(profileId, course.orgId);
  return can(placements, "create_content", toRoleRef(homeNode));
}

/**
 * Who may open this paper: anyone the course reaches (the candidates), plus the people who
 * may edit it — a reviewer has to be able to read a proposed exam before approving it.
 * `reach` is null for the latter, which is what makes their sitting a preview.
 */
async function openPaperFor(profileId: string, course: Course) {
  const reaching = await coursesReaching(profileId, course.orgId);
  const reach = reaching.find((r) => r.course.id === course.id) ?? null;
  if (reach) return { reach, preview: false };
  return (await canManageExam(profileId, course)) ? { reach: null, preview: true } : null;
}

async function attemptStats(courseId: string, profileId: string, maxAttempts: number | null) {
  const attempts = await db.examAttempt.findMany({
    where: { courseId, profileId },
    orderBy: { submittedAt: "desc" },
  });
  const best = attempts.reduce<(typeof attempts)[number] | null>(
    (top, a) => (!top || a.scorePercent > top.scorePercent ? a : top),
    null,
  );
  return {
    attemptsUsed: attempts.length,
    attemptsLeft: maxAttempts == null ? null : Math.max(0, maxAttempts - attempts.length),
    best: best
      ? {
          percent: best.scorePercent,
          passed: best.passed,
          submittedAt: best.submittedAt.toISOString(),
        }
      : null,
    passed: attempts.some((a) => a.passed),
  };
}

/** Deal one candidate's copy of the paper: no answer key, no explanations, own order. */
function dealPaper(exam: ExamBody): ExamPaperQuestion[] {
  const questions = exam.settings.shuffleQuestions ? shuffled(exam.questions) : exam.questions;
  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    help: q.help,
    ...(q.image ? { image: q.image } : {}),
    options: (exam.settings.shuffleOptions ? shuffled(q.options) : q.options).map((o) => ({
      id: o.id,
      text: o.text,
    })),
    points: questionWeight(q, exam.settings),
    required: q.required,
  }));
}

export async function examRoutes(app: FastifyInstance) {
  // The candidate's paper — the only exam endpoint their browser ever needs to render it.
  app.get<{ Params: { code: string } }>(
    "/courses/:code/exam",
    { preHandler: app.authenticate },
    async (req, reply): Promise<ExamPaperView> => {
      const loaded = await loadExam(req.params.code);
      if (!loaded) return reply.status(404).send({ error: "Exam not found" });
      const { course, exam } = loaded;
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Exam not found" });
      const opened = await openPaperFor(req.profileId, course);
      if (!opened) {
        return reply.status(403).send({ error: "This exam isn't assigned or available to you" });
      }

      const { settings } = exam;
      const stats = await attemptStats(course.id, req.profileId, settings.maxAttempts);
      const questions = dealPaper(exam);
      return {
        code: course.code,
        title: course.title,
        intro: exam.intro,
        questionCount: questions.length,
        totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
        rules: {
          passPercent: settings.passPercent,
          weighted: settings.weighted,
          reveal: settings.reveal,
          showCorrectAnswer: settings.showCorrectAnswer,
          showExplanation: settings.showExplanation,
          showScore: settings.showScore,
          timeLimitMinutes: settings.timeLimitMinutes,
          maxAttempts: settings.maxAttempts,
          onePerPage: settings.onePerPage,
          requirePassToComplete: settings.requirePassToComplete,
        },
        questions,
        preview: opened.preview,
        ...stats,
      };
    },
  );

  // Live feedback: was THIS answer right? Only an exam set to reveal answers immediately
  // will answer — otherwise the endpoint would be a way to read the key mid-paper.
  app.post<{ Params: { code: string } }>(
    "/courses/:code/exam/check",
    { preHandler: app.authenticate },
    async (req, reply): Promise<ExamCheckView> => {
      const body = checkExamAnswerSchema.parse(req.body);
      const loaded = await loadExam(req.params.code);
      if (!loaded) return reply.status(404).send({ error: "Exam not found" });
      const { course, exam } = loaded;
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Exam not found" });
      if (!(await openPaperFor(req.profileId, course))) {
        return reply.status(403).send({ error: "This exam isn't assigned or available to you" });
      }
      if (exam.settings.reveal !== "immediate") {
        return reply
          .status(409)
          .send({ error: "This exam reveals its answers only after it is submitted" });
      }
      const question = exam.questions.find((q) => q.id === body.questionId);
      if (!question) return reply.status(404).send({ error: "Question not found" });

      const correct = isAnswerCorrect(question, body.optionIds);
      return {
        correct,
        ...(exam.settings.showCorrectAnswer ? { correctOptionIds: correctOptionIds(question) } : {}),
        ...(exam.settings.showExplanation && question.explanation
          ? { explanation: question.explanation }
          : {}),
      };
    },
  );

  // Sit the paper: marked here, recorded here, and — when it passes — completed here.
  app.post<{ Params: { code: string } }>(
    "/courses/:code/exam/attempts",
    { preHandler: app.authenticate },
    async (req, reply): Promise<ExamAttemptResultView> => {
      const body = submitExamSchema.parse(req.body);
      const loaded = await loadExam(req.params.code);
      if (!loaded) return reply.status(404).send({ error: "Exam not found" });
      const { course, exam } = loaded;
      const member = await db.membership.findUnique({
        where: { profileId_orgId: { profileId: req.profileId, orgId: course.orgId } },
      });
      if (!member) return reply.status(404).send({ error: "Exam not found" });
      const opened = await openPaperFor(req.profileId, course);
      if (!opened) {
        return reply.status(403).send({ error: "This exam isn't assigned or available to you" });
      }

      // Prerequisites gate an exam the same way they gate any other course.
      if (opened.reach) {
        const item = await toLearningItem(req.profileId, opened.reach);
        if (item.missingPrerequisites.length > 0) {
          return reply.status(409).send({
            error: `Complete the prerequisite course(s) first: ${item.missingPrerequisites.join(", ")}`,
          });
        }
      }

      const before = await attemptStats(course.id, req.profileId, exam.settings.maxAttempts);
      if (!opened.preview && before.attemptsLeft === 0) {
        return reply.status(409).send({
          error: `You have used all ${exam.settings.maxAttempts} attempts allowed on this exam`,
        });
      }

      const result = gradeExam(exam, body.answers);
      const completed =
        !opened.preview && !!opened.reach && (result.passed || !exam.settings.requirePassToComplete);

      // A preview sitting (an author or reviewer trying their own paper) is marked and
      // shown, but never recorded — it is not a candidate's result.
      if (!opened.preview) {
        await db.examAttempt.create({
          data: {
            courseId: course.id,
            profileId: req.profileId,
            orgId: course.orgId,
            courseVersion: course.version,
            answers: result.questions.map((q) => ({
              questionId: q.questionId,
              optionIds: body.answers.find((a) => a.questionId === q.questionId)?.optionIds ?? [],
              correct: q.correct,
              points: q.points,
              earned: q.earned,
            })) as object,
            earnedPoints: result.earnedPoints,
            totalPoints: result.totalPoints,
            scorePercent: result.percent,
            passed: result.passed,
            seconds: body.seconds ?? null,
            // What the invigilator saw: how often they left the paper, and whether it was
            // handed in for them.
            violations: body.violations ?? 0,
            autoSubmitted: body.autoSubmitted ?? false,
          },
        });
      }
      if (completed && opened.reach) {
        await recordCompletion(req.profileId, course, opened.reach);
      }

      const after = await attemptStats(course.id, req.profileId, exam.settings.maxAttempts);
      const reveal = exam.settings.reveal !== "never";
      return {
        percent: result.percent,
        passed: result.passed,
        earnedPoints: result.earnedPoints,
        totalPoints: result.totalPoints,
        correctCount: result.correctCount,
        questionCount: result.questionCount,
        attemptsUsed: after.attemptsUsed,
        attemptsLeft: after.attemptsLeft,
        completed,
        ...(reveal
          ? {
              review: result.questions.map((q) => {
                const question = exam.questions.find((x) => x.id === q.questionId);
                return {
                  questionId: q.questionId,
                  correct: q.correct,
                  answered: q.answered,
                  ...(exam.settings.showCorrectAnswer
                    ? { correctOptionIds: q.correctOptionIds }
                    : {}),
                  ...(exam.settings.showExplanation && question?.explanation
                    ? { explanation: question.explanation }
                    : {}),
                };
              }),
            }
          : {}),
      };
    },
  );
}
