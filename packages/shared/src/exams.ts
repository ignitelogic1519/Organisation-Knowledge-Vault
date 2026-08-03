import { z } from "zod";

// ── MCQ exams (the Studio's second creation mode) ────────────────────────────
// An exam is authored like a form: an ordered list of multiple-choice questions, each with
// its own answer options, and one settings object that governs how the paper is delivered
// and marked. It is stored on a Course exactly the way a Studio document is — same code,
// same classification, same library/placement rules — so everything the platform already
// does with documents (library, requests, inheritance, compliance) works unchanged.
//
// The answer key lives ONLY in the stored exam. What a candidate's browser receives is the
// `ExamPaperView` below, which carries no `correct` flags; marking happens on the server.

/**
 * How a question is answered:
 *  - single  — exactly one of several options is right (the classic MCQ)
 *  - multi   — several options are right; the candidate must pick the whole set
 *  - boolean — a true/false statement (a `single` with two fixed options)
 */
export const examQuestionTypes = ["single", "multi", "boolean"] as const;
export const examQuestionTypeSchema = z.enum(examQuestionTypes);
export type ExamQuestionType = z.infer<typeof examQuestionTypeSchema>;

/** One selectable answer. Ids are stable so shuffling never changes what a choice means. */
export const examOptionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  text: z.string().max(500).default(""),
  correct: z.boolean().default(false),
});
export type ExamOption = z.infer<typeof examOptionSchema>;

/**
 * One question. `points` is the question's weight and is only consulted when the exam runs
 * with unequal weights — by default every question is worth exactly the same.
 * Text is stored and rendered as PLAIN TEXT (never HTML), so nothing authored here can
 * carry markup into a reader's browser.
 */
export const examQuestionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  type: examQuestionTypeSchema.default("single"),
  prompt: z.string().max(4_000).default(""),
  /** Optional helper line under the question. */
  help: z.string().max(500).default(""),
  /** Optional illustration shown with the question. */
  image: z.string().url().optional(),
  options: z.array(examOptionSchema).max(12).default([]),
  /** Marks this question carries when the exam uses unequal weights. */
  points: z.number().min(0).max(100).default(1),
  /** An unanswered required question blocks submission. */
  required: z.boolean().default(true),
  /** Shown once the answer is revealed — why the right answer is right. */
  explanation: z.string().max(1_000).default(""),
});
export type ExamQuestion = z.infer<typeof examQuestionSchema>;

/**
 * When the candidate learns whether an answer was right:
 *  - never     — they only ever see the outcome (and the score, if enabled)
 *  - immediate — right/wrong the moment they answer, question by question (live feedback)
 *  - after     — the whole paper is marked and reviewed once they submit
 */
export const examRevealModes = ["never", "immediate", "after"] as const;
export const examRevealModeSchema = z.enum(examRevealModes);
export type ExamRevealMode = z.infer<typeof examRevealModeSchema>;

/** How the paper is delivered and marked — the "exam properties" half of the inspector. */
export const examSettingsSchema = z.object({
  /** The mark needed to pass, as a percentage of the paper's total weight. */
  passPercent: z.number().int().min(1).max(100).default(70),
  /**
   * false (default) = every question carries the same weight, whatever its `points`.
   * true = each question's own `points` decide its share of the paper.
   */
  weighted: z.boolean().default(false),
  /** Deal the questions in a different order to every candidate. */
  shuffleQuestions: z.boolean().default(false),
  /** Deal each question's options in a different order to every candidate. */
  shuffleOptions: z.boolean().default(false),
  reveal: examRevealModeSchema.default("after"),
  /** When revealing: also show WHICH option was the right one, not just right/wrong. */
  showCorrectAnswer: z.boolean().default(true),
  /** When revealing: show the author's explanation. */
  showExplanation: z.boolean().default(true),
  /** Show the candidate their score and the pass mark on the result screen. */
  showScore: z.boolean().default(true),
  /** Minutes allowed for one attempt; null = untimed. */
  timeLimitMinutes: z.number().int().min(1).max(600).nullable().default(null),
  /** Attempts a candidate may take; null = unlimited. */
  maxAttempts: z.number().int().min(1).max(50).nullable().default(null),
  /** Present one question per screen instead of the whole paper at once. */
  onePerPage: z.boolean().default(false),
  /** true (default) = the exam counts as completed only once it is passed. */
  requirePassToComplete: z.boolean().default(true),
});
export type ExamSettings = z.infer<typeof examSettingsSchema>;

/** The exam itself: what the candidate is told, how it is run, and the questions. */
export const examBodySchema = z.object({
  /** Instructions shown on the exam's start screen. */
  intro: z.string().max(4_000).default(""),
  settings: examSettingsSchema.default({}),
  questions: z.array(examQuestionSchema).max(200).default([]),
});
export type ExamBody = z.infer<typeof examBodySchema>;

export const EMPTY_EXAM_SETTINGS: ExamSettings = examSettingsSchema.parse({});

// ── Marking ──────────────────────────────────────────────────────────────────
// Pure functions, shared by the server (authoritative marking) and by the Studio's own
// preview, so an author testing their paper sees precisely what a candidate will get.

/** One question's answer: the option ids the candidate selected. */
export interface ExamAnswer {
  questionId: string;
  optionIds: string[];
}

export interface ExamQuestionResult {
  questionId: string;
  /** The candidate selected something. */
  answered: boolean;
  correct: boolean;
  /** The question's weight in this paper. */
  points: number;
  earned: number;
  correctOptionIds: string[];
}

export interface ExamResult {
  totalPoints: number;
  earnedPoints: number;
  /** Rounded to a whole percent — the number compared against the pass mark. */
  percent: number;
  passed: boolean;
  correctCount: number;
  questionCount: number;
  questions: ExamQuestionResult[];
}

/** The weight one question carries: its own points, or 1 when weights are equal. */
export function questionWeight(question: ExamQuestion, settings: ExamSettings): number {
  return settings.weighted ? question.points : 1;
}

export function correctOptionIds(question: ExamQuestion): string[] {
  return question.options.filter((o) => o.correct).map((o) => o.id);
}

/**
 * A question is right only when the selection matches the answer key exactly — every
 * correct option chosen and no incorrect one. There is no partial credit on a multi-answer
 * question: half an answer to "which of these are hazards" is not a right answer.
 */
export function isAnswerCorrect(question: ExamQuestion, selected: string[]): boolean {
  const key = correctOptionIds(question);
  if (key.length === 0) return false; // a question with no key can never be earned
  const chosen = new Set(selected);
  return key.length === chosen.size && key.every((id) => chosen.has(id));
}

/** Mark a whole paper. Unanswered questions simply earn nothing. */
export function gradeExam(exam: ExamBody, answers: ExamAnswer[]): ExamResult {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a.optionIds]));
  let totalPoints = 0;
  let earnedPoints = 0;
  let correctCount = 0;

  const questions = exam.questions.map((q) => {
    const selected = byQuestion.get(q.id) ?? [];
    const points = questionWeight(q, exam.settings);
    const correct = selected.length > 0 && isAnswerCorrect(q, selected);
    totalPoints += points;
    if (correct) {
      earnedPoints += points;
      correctCount += 1;
    }
    return {
      questionId: q.id,
      answered: selected.length > 0,
      correct,
      points,
      earned: correct ? points : 0,
      correctOptionIds: correctOptionIds(q),
    };
  });

  // A paper whose whole weight is zero (every question weighted 0) can't be scored on
  // marks — fall back to the share of questions answered correctly.
  const percent =
    totalPoints > 0
      ? Math.round((earnedPoints / totalPoints) * 100)
      : questions.length > 0
        ? Math.round((correctCount / questions.length) * 100)
        : 0;

  return {
    totalPoints,
    earnedPoints,
    percent,
    passed: percent >= exam.settings.passPercent,
    correctCount,
    questionCount: questions.length,
    questions,
  };
}

/** The paper's total weight — shown to the author while they distribute marks. */
export function examTotalPoints(exam: ExamBody): number {
  return exam.questions.reduce((sum, q) => sum + questionWeight(q, exam.settings), 0);
}

/**
 * Everything that would make this exam unfair or unmarkable, in the author's words. An
 * empty list means it is ready to publish; the Studio shows the list instead of publishing.
 */
export function examProblems(exam: ExamBody): string[] {
  const problems: string[] = [];
  if (exam.questions.length === 0) {
    problems.push("Add at least one question.");
  }
  exam.questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.prompt.trim()) problems.push(`${label} has no question text.`);
    const usable = question.options.filter((o) => o.text.trim());
    if (usable.length < 2) problems.push(`${label} needs at least two answer options.`);
    const key = usable.filter((o) => o.correct);
    if (key.length === 0) problems.push(`${label} has no correct answer marked.`);
    if (question.type !== "multi" && key.length > 1) {
      problems.push(`${label} accepts one answer but has ${key.length} marked correct.`);
    }
  });
  if (exam.settings.weighted && examTotalPoints(exam) <= 0) {
    problems.push("With unequal weights, at least one question must be worth more than 0.");
  }
  return problems;
}

// ── Delivery ─────────────────────────────────────────────────────────────────
// What actually travels to a candidate. Built on the server from the stored exam: the
// answer key, the explanations and the per-question weights the author set are all left
// behind, and the questions/options are dealt in the order that candidate will see.

export interface ExamPaperOption {
  id: string;
  text: string;
}

export interface ExamPaperQuestion {
  id: string;
  type: ExamQuestionType;
  prompt: string;
  help: string;
  image?: string;
  options: ExamPaperOption[];
  /** The question's weight in this paper (already resolved against the weighting mode). */
  points: number;
  required: boolean;
}

/** The settings a candidate's browser legitimately needs to render and pace the paper. */
export interface ExamPaperRules {
  passPercent: number;
  weighted: boolean;
  reveal: ExamRevealMode;
  showCorrectAnswer: boolean;
  showExplanation: boolean;
  showScore: boolean;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  onePerPage: boolean;
  requirePassToComplete: boolean;
}

export interface ExamPaperView {
  code: string;
  title: string;
  intro: string;
  questionCount: number;
  totalPoints: number;
  rules: ExamPaperRules;
  questions: ExamPaperQuestion[];
  /** Attempts already submitted by this candidate, and what is left (null = unlimited). */
  attemptsUsed: number;
  attemptsLeft: number | null;
  /** Their best attempt so far, when they have taken it before. */
  best: { percent: number; passed: boolean; submittedAt: string } | null;
  /** True once a passing attempt exists — the exam already counts as completed. */
  passed: boolean;
  /**
   * The reader is an author or reviewer trying their own paper rather than a candidate:
   * it is marked and shown as usual, but the sitting is never recorded.
   */
  preview: boolean;
}

/** One question's outcome as reported back to the candidate (only when revealing). */
export interface ExamAnswerReview {
  questionId: string;
  correct: boolean;
  answered: boolean;
  /** Present only when the exam is set to show which option was right. */
  correctOptionIds?: string[];
  /** Present only when the exam is set to show the author's explanation. */
  explanation?: string;
}

export interface ExamAttemptResultView {
  percent: number;
  passed: boolean;
  earnedPoints: number;
  totalPoints: number;
  correctCount: number;
  questionCount: number;
  attemptsUsed: number;
  attemptsLeft: number | null;
  /** Whether this attempt marked the course complete for the candidate. */
  completed: boolean;
  /** Per-question review — omitted entirely when the exam never reveals answers. */
  review?: ExamAnswerReview[];
}

export const submitExamSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().max(40),
        optionIds: z.array(z.string().max(40)).max(12),
      }),
    )
    .max(200),
  /** Seconds the candidate spent — recorded with the attempt, never used for marking. */
  seconds: z.number().int().min(0).max(86_400).optional(),
  /** Times the candidate left the paper for longer than the invigilator allows. */
  violations: z.number().int().min(0).max(50).optional(),
  /** True when the invigilator handed the paper in, not the candidate. */
  autoSubmitted: z.boolean().optional(),
});
export type SubmitExamInput = z.infer<typeof submitExamSchema>;

/** Live feedback: one question checked the moment it is answered. */
export const checkExamAnswerSchema = z.object({
  questionId: z.string().max(40),
  optionIds: z.array(z.string().max(40)).max(12),
});
export type CheckExamAnswerInput = z.infer<typeof checkExamAnswerSchema>;

export interface ExamCheckView {
  correct: boolean;
  correctOptionIds?: string[];
  explanation?: string;
}

/**
 * Deterministic-per-call shuffle (Fisher–Yates on a copy). Used server-side when dealing a
 * paper, so two candidates opening the same exam get different orders.
 */
// ── Invigilation ─────────────────────────────────────────────────────────────
// A candidate sits the paper full-screen. Leaving it — another tab, another window —
// is tolerated briefly (a notification, a misclick) and then counted: two warnings, and
// the third interruption hands the paper in as it stands. The rules live here so the
// runner, the wording people read and the recorded attempt all agree on the numbers.

/** How long a candidate may be away before it counts against them, in milliseconds. */
export const EXAM_AWAY_GRACE_MS = 5_000;

/** Interruptions that only earn a warning. The next one ends the paper. */
export const EXAM_MAX_WARNINGS = 2;

export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
