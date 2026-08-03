"use client";

import type {
  CheckExamAnswerInput,
  ExamAttemptResultView,
  ExamCheckView,
  ExamPaperView,
  SubmitExamInput,
} from "@vault/shared";
import { api } from "./auth-client";

// Exam delivery API. The answer key stays on the server: the browser asks for a paper,
// asks about one answer at a time when the exam gives live feedback, and sends the finished
// paper back to be marked.

export const exams = {
  /** This candidate's copy of the paper — shuffled to taste, without the answers. */
  paper: (code: string) => api<ExamPaperView>(`/courses/${code}/exam`),
  /** Live feedback on one question (exams that reveal answers as they are given). */
  check: (code: string, input: CheckExamAnswerInput) =>
    api<ExamCheckView>(`/courses/${code}/exam/check`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Hand the paper in: marked, recorded, and completed when it passes. */
  submit: (code: string, input: SubmitExamInput) =>
    api<ExamAttemptResultView>(`/courses/${code}/exam/attempts`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
