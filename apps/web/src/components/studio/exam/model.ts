"use client";

import {
  EMPTY_EXAM_SETTINGS,
  examTotalPoints,
  questionWeight,
  shuffled,
  type ExamBody,
  type ExamOption,
  type ExamPaperView,
  type ExamQuestion,
  type ExamQuestionType,
} from "@vault/shared";

// The exam editor's model: the pure helpers the builder works with. Nothing here touches
// React or the DOM, exactly like the document editor's model — the same shapes of
// operation (add, duplicate, move, remove) so both editors behave the same way.

let sequence = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(sequence++).toString(36)}`;

export const newOption = (text = "", correct = false): ExamOption => ({
  id: newId("o"),
  text,
  correct,
});

export const QUESTION_TYPES: { key: ExamQuestionType; label: string; hint: string }[] = [
  { key: "single", label: "One answer", hint: "Exactly one option is right" },
  { key: "multi", label: "Several answers", hint: "The whole set must be picked" },
  { key: "boolean", label: "True / false", hint: "A statement to judge" },
];

export const TYPE_LABEL: Record<ExamQuestionType, string> = {
  single: "One answer",
  multi: "Several answers",
  boolean: "True / false",
};

/** True/false questions always carry the same two options — only the key changes. */
const booleanOptions = (trueIsCorrect = true): ExamOption[] => [
  newOption("True", trueIsCorrect),
  newOption("False", !trueIsCorrect),
];

export function newQuestion(type: ExamQuestionType = "single"): ExamQuestion {
  return {
    id: newId("q"),
    type,
    prompt: "",
    help: "",
    options: type === "boolean" ? booleanOptions() : [newOption(), newOption()],
    points: 1,
    required: true,
    explanation: "",
  };
}

/** A fresh paper: the defaults an author starts from, with one empty question ready. */
export function blankExam(): ExamBody {
  return { intro: "", settings: { ...EMPTY_EXAM_SETTINGS }, questions: [newQuestion()] };
}

/**
 * Change a question's type, keeping as much of the author's work as makes sense:
 * true/false swaps to its fixed pair, and narrowing to one answer keeps only the first
 * option that was marked correct (two right answers can't survive a single-answer rule).
 */
export function retypeQuestion(question: ExamQuestion, type: ExamQuestionType): ExamQuestion {
  if (type === question.type) return question;
  if (type === "boolean") {
    return { ...question, type, options: booleanOptions(question.options[0]?.correct ?? true) };
  }
  const options =
    question.type === "boolean" ? [newOption(), newOption()] : question.options;
  if (type === "single") {
    let kept = false;
    return {
      ...question,
      type,
      options: options.map((o) => {
        const correct = o.correct && !kept;
        if (correct) kept = true;
        return { ...o, correct };
      }),
    };
  }
  return { ...question, type, options };
}

/** Mark (or unmark) an option. One-answer questions move the tick; multi toggles it. */
export function setOptionCorrect(
  question: ExamQuestion,
  optionId: string,
  correct: boolean,
): ExamQuestion {
  if (question.type === "multi") {
    return {
      ...question,
      options: question.options.map((o) => (o.id === optionId ? { ...o, correct } : o)),
    };
  }
  return {
    ...question,
    options: question.options.map((o) => ({ ...o, correct: o.id === optionId && correct })),
  };
}

export function moveQuestion(questions: ExamQuestion[], from: number, to: number): ExamQuestion[] {
  if (from === to || from < 0 || from >= questions.length || to < 0 || to >= questions.length) {
    return questions;
  }
  const next = [...questions];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Duplicate a question with fresh ids, so answers never point at two questions at once. */
export function duplicateQuestion(questions: ExamQuestion[], index: number): ExamQuestion[] {
  const source = questions[index];
  if (!source) return questions;
  const copy: ExamQuestion = {
    ...structuredClone(source),
    id: newId("q"),
    options: source.options.map((o) => ({ ...o, id: newId("o") })),
  };
  const next = [...questions];
  next.splice(index + 1, 0, copy);
  return next;
}

/**
 * The paper as it should be stored: text trimmed and half-written options (an option box
 * the author never typed into) dropped, so nothing empty is ever published or marked.
 */
export function cleanExam(exam: ExamBody): ExamBody {
  return {
    intro: exam.intro.trim(),
    settings: exam.settings,
    questions: exam.questions.map((q) => ({
      ...q,
      prompt: q.prompt.trim(),
      help: q.help.trim(),
      explanation: q.explanation.trim(),
      options: q.options
        .filter((o) => o.text.trim())
        .map((o) => ({ ...o, text: o.text.trim() })),
    })),
  };
}

/** What the status bar reports while the paper is being written. */
export function examStats(exam: ExamBody) {
  const total = examTotalPoints(exam);
  return {
    questions: exam.questions.length,
    totalPoints: Math.round(total * 100) / 100,
    /** Marks a candidate must earn to pass — the pass percentage made concrete. */
    passMark: Math.round(total * (exam.settings.passPercent / 100) * 100) / 100,
    unfinished: exam.questions.filter(
      (q) =>
        !q.prompt.trim() ||
        q.options.filter((o) => o.text.trim()).length < 2 ||
        !q.options.some((o) => o.correct && o.text.trim()),
    ).length,
  };
}

/**
 * Deal the author's own paper for the Studio's preview — the same shuffling a candidate
 * gets, minus the answer key, so an author can try their exam before publishing it without
 * anything being recorded anywhere.
 */
export function previewPaper(exam: ExamBody, title: string): ExamPaperView {
  const questions = (exam.settings.shuffleQuestions ? shuffled(exam.questions) : exam.questions).map(
    (q) => ({
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
    }),
  );
  const { settings } = exam;
  return {
    code: "preview",
    title: title || "Untitled exam",
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
      maxAttempts: null, // a preview is never spent
      onePerPage: settings.onePerPage,
      requirePassToComplete: settings.requirePassToComplete,
    },
    questions,
    attemptsUsed: 0,
    attemptsLeft: null,
    best: null,
    passed: false,
    preview: true,
  };
}
