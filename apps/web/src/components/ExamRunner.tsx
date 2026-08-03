"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ExamAnswer,
  ExamAttemptResultView,
  ExamCheckView,
  ExamPaperQuestion,
  ExamPaperView,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { useDialogs } from "./dialogs";

// Sitting an exam. One component serves both the candidate (answers marked by the server)
// and the author previewing their own paper in the Studio (marked locally, recorded
// nowhere) — the difference is only in the two callbacks it is handed, so what an author
// tries is exactly what a candidate will get.

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function Facts({ paper }: { paper: ExamPaperView }) {
  const { rules } = paper;
  return (
    <dl className="exam-facts">
      <div>
        <dt>Questions</dt>
        <dd>{paper.questionCount}</dd>
      </div>
      <div>
        <dt>Pass mark</dt>
        <dd>{rules.passPercent}%</dd>
      </div>
      <div>
        <dt>Marks</dt>
        <dd>
          {paper.totalPoints}
          {rules.weighted ? " (weighted)" : ""}
        </dd>
      </div>
      <div>
        <dt>Time</dt>
        <dd>{rules.timeLimitMinutes ? `${rules.timeLimitMinutes} min` : "Untimed"}</dd>
      </div>
      <div>
        <dt>Attempts</dt>
        <dd>
          {rules.maxAttempts == null
            ? "Unlimited"
            : `${paper.attemptsUsed} of ${rules.maxAttempts} used`}
        </dd>
      </div>
      {paper.best && (
        <div>
          <dt>Your best</dt>
          <dd>
            {paper.best.percent}% · {paper.best.passed ? "passed" : "not passed"}
          </dd>
        </div>
      )}
    </dl>
  );
}

export function ExamRunner({
  paper,
  onCheck,
  onSubmit,
  onRetry,
  onCompleted,
}: {
  paper: ExamPaperView;
  /** Live marking of a single question — only called when answers reveal immediately. */
  onCheck: (questionId: string, optionIds: string[]) => Promise<ExamCheckView>;
  onSubmit: (answers: ExamAnswer[], seconds: number) => Promise<ExamAttemptResultView>;
  /** Deal a fresh paper for another attempt; omit when retries make no sense. */
  onRetry?: () => Promise<void>;
  /** The sitting changed the course's state (it completed) — refresh the host. */
  onCompleted?: () => void;
}) {
  const dialogs = useDialogs();
  const [phase, setPhase] = useState<"intro" | "sitting" | "result">("intro");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [checks, setChecks] = useState<Record<string, ExamCheckView>>({});
  const [result, setResult] = useState<ExamAttemptResultView | null>(null);
  const [page, setPage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);

  const { rules, questions } = paper;
  const live = rules.reveal === "immediate";
  const answeredCount = questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const missingRequired = questions.filter(
    (q) => q.required && (answers[q.id] ?? []).length === 0,
  );
  const outOfAttempts = paper.attemptsLeft === 0;

  // A new paper (first load, or a retry) resets everything.
  useEffect(() => {
    setPhase("intro");
    setAnswers({});
    setChecks({});
    setResult(null);
    setPage(0);
    setElapsed(0);
    setLeft(paper.rules.timeLimitMinutes ? paper.rules.timeLimitMinutes * 60 : null);
    submitted.current = false;
  }, [paper]);

  const submit = useCallback(
    async (auto = false) => {
      if (submitted.current) return;
      if (!auto && missingRequired.length > 0) {
        dialogs.toast(
          `${missingRequired.length} required question${missingRequired.length === 1 ? "" : "s"} still unanswered.`,
          "danger",
        );
        return;
      }
      if (!auto) {
        const ok = await dialogs.confirm({
          title: "Submit this exam?",
          message:
            answeredCount < questions.length
              ? `${questions.length - answeredCount} question(s) are unanswered — they will score nothing.`
              : "Your answers will be marked now.",
          confirmLabel: "Submit",
        });
        if (!ok) return;
      }
      submitted.current = true;
      setBusy(true);
      try {
        const payload: ExamAnswer[] = questions.map((q) => ({
          questionId: q.id,
          optionIds: answers[q.id] ?? [],
        }));
        const outcome = await onSubmit(payload, elapsed);
        setResult(outcome);
        setPhase("result");
        if (outcome.completed) onCompleted?.();
      } catch (err) {
        submitted.current = false;
        dialogs.toast(err instanceof ApiError ? err.message : "Could not submit the exam", "danger");
      } finally {
        setBusy(false);
      }
    },
    [answeredCount, answers, dialogs, elapsed, missingRequired.length, onCompleted, onSubmit, questions],
  );

  // The clock: counts what the candidate spent, and hands the paper in at zero.
  useEffect(() => {
    if (phase !== "sitting") return;
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
      setLeft((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "sitting" && left === 0 && !submitted.current) {
      dialogs.toast("Time is up — your answers were submitted.", "info");
      void submit(true);
    }
  }, [left, phase, submit, dialogs]);

  const runCheck = async (questionId: string, optionIds: string[]) => {
    try {
      const view = await onCheck(questionId, optionIds);
      setChecks((prev) => ({ ...prev, [questionId]: view }));
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not check that answer", "danger");
    }
  };

  const choose = (question: ExamPaperQuestion, optionId: string, on: boolean) => {
    if (live && checks[question.id]) return; // already marked — the answer is settled
    setAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const next =
        question.type === "multi"
          ? on
            ? [...current, optionId]
            : current.filter((id) => id !== optionId)
          : [optionId];
      return { ...prev, [question.id]: next };
    });
    // One-answer questions can be marked the instant they are answered; a multi-answer
    // question waits for the candidate to say they are done choosing.
    if (live && question.type !== "multi" && on) void runCheck(question.id, [optionId]);
  };

  const reviewOf = useMemo(
    () => new Map((result?.review ?? []).map((r) => [r.questionId, r])),
    [result],
  );

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="exam-run">
        <section className="exam-intro">
          <h2>{paper.title}</h2>
          {paper.preview && (
            <p className="badge">preview — nothing you do here is recorded</p>
          )}
          {paper.intro && <p className="exam-intro-text">{paper.intro}</p>}
          <Facts paper={paper} />
          {paper.passed && (
            <p className="exam-note exam-note-ok">
              You have already passed this exam
              {paper.best ? ` with ${paper.best.percent}%.` : "."}
            </p>
          )}
          {outOfAttempts ? (
            <p className="exam-note exam-note-bad">
              You have used every attempt allowed on this exam.
            </p>
          ) : (
            <button className="btn btn-primary" onClick={() => setPhase("sitting")}>
              {paper.attemptsUsed > 0 ? "Start another attempt" : "Start the exam"}
            </button>
          )}
        </section>
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (phase === "result" && result) {
    return (
      <div className="exam-run">
        <section className="exam-result" data-passed={result.passed}>
          <span className="exam-score-ring" data-passed={result.passed}>
            <strong>{rules.showScore ? `${result.percent}%` : result.passed ? "✓" : "✕"}</strong>
            <small>{result.passed ? "Passed" : "Not passed"}</small>
          </span>
          {rules.showScore && (
            <p className="exam-result-line">
              {result.earnedPoints} of {result.totalPoints} marks · {result.correctCount} of{" "}
              {result.questionCount} questions right · pass mark {rules.passPercent}%
            </p>
          )}
          {result.completed && <p className="exam-note exam-note-ok">Marked complete for you.</p>}
          {!result.completed && !paper.preview && rules.requirePassToComplete && !result.passed && (
            <p className="exam-note">
              This exam counts as complete once you reach {rules.passPercent}%.
            </p>
          )}
          <p className="auth-sub">
            {result.attemptsLeft == null
              ? `Attempt ${result.attemptsUsed}`
              : `${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left`}
          </p>

          {result.review && (
            <ol className="exam-review">
              {questions.map((q, i) => {
                const review = reviewOf.get(q.id);
                const mine = answers[q.id] ?? [];
                return (
                  <li key={q.id} className="exam-review-item" data-correct={review?.correct}>
                    <div className="exam-review-head">
                      <span className="exam-review-no">{i + 1}</span>
                      <span className="exam-review-prompt">{q.prompt}</span>
                      <span className="exam-review-mark">
                        {review?.correct ? "✓" : review?.answered ? "✕" : "—"}
                      </span>
                    </div>
                    <ul className="exam-review-options">
                      {q.options.map((o) => {
                        const chosen = mine.includes(o.id);
                        const key = review?.correctOptionIds?.includes(o.id);
                        return (
                          <li key={o.id} data-chosen={chosen} data-key={key}>
                            {o.text}
                            {chosen && <span className="exam-tag">your answer</span>}
                            {key && <span className="exam-tag exam-tag-key">correct</span>}
                          </li>
                        );
                      })}
                    </ul>
                    {review?.explanation && (
                      <p className="exam-review-why">{review.explanation}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {onRetry && result.attemptsLeft !== 0 && (
            <button
              className="btn btn-quiet"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRetry();
                } finally {
                  setBusy(false);
                }
              }}
            >
              ↻ Try again
            </button>
          )}
        </section>
      </div>
    );
  }

  // ── Sitting the paper ──────────────────────────────────────────────────────
  const visible = rules.onePerPage ? questions.slice(page, page + 1) : questions;

  return (
    <div className="exam-run">
      <div className="exam-bar">
        <span>
          {answeredCount} of {questions.length} answered
        </span>
        <span className="exam-bar-track" aria-hidden>
          <span style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }} />
        </span>
        {left !== null && (
          <span className="exam-timer" data-low={left <= 60}>
            ⏱ {clock(left)}
          </span>
        )}
      </div>

      <ol className="exam-paper" start={rules.onePerPage ? page + 1 : 1}>
        {visible.map((q) => {
          const index = questions.indexOf(q);
          const mine = answers[q.id] ?? [];
          const check = checks[q.id];
          const locked = live && !!check;
          return (
            <li key={q.id} className="exam-question" data-checked={check ? check.correct : undefined}>
              <div className="exam-question-head">
                <span className="exam-question-no">{index + 1}</span>
                <p className="exam-question-prompt">{q.prompt}</p>
                {rules.weighted && <span className="chip">{q.points} marks</span>}
                {!q.required && <span className="badge">optional</span>}
              </div>
              {q.help && <p className="exam-question-help">{q.help}</p>}
              {q.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="exam-question-image" src={q.image} alt="" />
              )}
              <ul className="exam-choices">
                {q.options.map((o) => {
                  const chosen = mine.includes(o.id);
                  const isKey = check?.correctOptionIds?.includes(o.id);
                  return (
                    <li key={o.id}>
                      <label className="exam-choice" data-chosen={chosen} data-key={isKey}>
                        <input
                          type={q.type === "multi" ? "checkbox" : "radio"}
                          name={`q-${q.id}`}
                          checked={chosen}
                          disabled={locked}
                          onChange={(e) => choose(q, o.id, e.target.checked)}
                        />
                        <span>{o.text}</span>
                        {isKey && <span className="exam-tag exam-tag-key">correct</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {live && q.type === "multi" && !check && (
                <button
                  className="btn btn-quiet btn-small"
                  disabled={mine.length === 0}
                  onClick={() => void runCheck(q.id, mine)}
                >
                  Check my answer
                </button>
              )}
              {check && (
                <p className="exam-feedback" data-correct={check.correct}>
                  {check.correct ? "✓ Correct" : "✕ Not correct"}
                  {check.explanation ? ` — ${check.explanation}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="exam-actions">
        {rules.onePerPage && (
          <>
            <button
              className="btn btn-quiet btn-small"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Previous
            </button>
            <span className="auth-sub">
              Question {page + 1} of {questions.length}
            </span>
            <button
              className="btn btn-quiet btn-small"
              disabled={page >= questions.length - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? "Marking…" : "Submit answers"}
        </button>
      </div>
    </div>
  );
}
