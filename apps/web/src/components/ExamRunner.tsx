"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXAM_AWAY_GRACE_MS,
  EXAM_MAX_WARNINGS,
  type ExamAnswer,
  type ExamAttemptResultView,
  type ExamCheckView,
  type ExamPaperQuestion,
  type ExamPaperView,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";

// Sitting an exam. One component serves both the candidate (answers marked by the server)
// and the author previewing their own paper in the Studio (marked locally, recorded
// nowhere) — the difference is only in the two callbacks it is handed, so what an author
// tries is exactly what a candidate will get.
//
// A real sitting is invigilated: the paper takes the whole screen, and leaving it — another
// tab, another window — for more than a few seconds is counted. Two interruptions earn a
// warning; the third hands the paper in as it stands. An author's preview is not policed,
// because taking their own screen hostage while they write helps nobody; the intro screen
// tells them what candidates will get instead.

/** How the paper ended, for the wording on the result screen. */
type Ending = "self" | "time" | "invigilator";

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
  onSubmit: (
    answers: ExamAnswer[],
    sitting: { seconds: number; violations: number; autoSubmitted: boolean },
  ) => Promise<ExamAttemptResultView>;
  /** Deal a fresh paper for another attempt; omit when retries make no sense. */
  onRetry?: () => Promise<void>;
  /** The sitting changed the course's state (it completed) — refresh the host. */
  onCompleted?: () => void;
}) {
  const [phase, setPhase] = useState<"intro" | "sitting" | "result">("intro");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [checks, setChecks] = useState<Record<string, ExamCheckView>>({});
  const [result, setResult] = useState<ExamAttemptResultView | null>(null);
  const [page, setPage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  // Everything the candidate has to read or answer lives INSIDE the paper: with the exam
  // full-screen, anything rendered elsewhere in the page (the app's dialogs, its toasts)
  // is simply not on screen.
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Invigilation ──────────────────────────────────────────────────────────
  const [strikes, setStrikes] = useState(0);
  /** What is currently blocking the paper: a warning to acknowledge, or "go back full screen". */
  const [guard, setGuard] = useState<null | { kind: "away"; strike: number } | { kind: "fullscreen" }>(
    null,
  );
  const [ending, setEnding] = useState<Ending>("self");
  const strikeCount = useRef(0);
  const awayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the candidate left; null once their absence has been counted (or they are here). */
  const awaySince = useRef<number | null>(null);
  const runRef = useRef<HTMLDivElement>(null);
  const invigilated = !paper.preview;

  const { rules, questions } = paper;
  const live = rules.reveal === "immediate";
  const answeredCount = questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const missingRequired = questions.filter(
    (q) => q.required && (answers[q.id] ?? []).length === 0,
  );
  const outOfAttempts = paper.attemptsLeft === 0;

  // A new paper (first load, or a retry) resets everything — including the strike count:
  // a fresh attempt is a fresh sitting.
  useEffect(() => {
    setPhase("intro");
    setAnswers({});
    setChecks({});
    setResult(null);
    setPage(0);
    setElapsed(0);
    setLeft(paper.rules.timeLimitMinutes ? paper.rules.timeLimitMinutes * 60 : null);
    setStrikes(0);
    setGuard(null);
    setEnding("self");
    strikeCount.current = 0;
    submitted.current = false;
  }, [paper]);

  const submit = useCallback(
    async (auto = false, confirmed = false) => {
      if (submitted.current) return;
      if (!auto && missingRequired.length > 0) {
        setNotice(
          `${missingRequired.length} required question${missingRequired.length === 1 ? "" : "s"} still unanswered.`,
        );
        return;
      }
      if (!auto && !confirmed) {
        setPending(true);
        return;
      }
      setPending(false);
      submitted.current = true;
      setBusy(true);
      try {
        const payload: ExamAnswer[] = questions.map((q) => ({
          questionId: q.id,
          optionIds: answers[q.id] ?? [],
        }));
        const outcome = await onSubmit(payload, {
          seconds: elapsed,
          violations: strikeCount.current,
          autoSubmitted: auto,
        });
        setResult(outcome);
        setGuard(null);
        setPhase("result");
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        if (outcome.completed) onCompleted?.();
      } catch (err) {
        submitted.current = false;
        setNotice(err instanceof ApiError ? err.message : "Could not submit the exam");
      } finally {
        setBusy(false);
      }
    },
    [answers, elapsed, missingRequired.length, onCompleted, onSubmit, questions],
  );

  /** Put the paper back on the whole screen. Needs a gesture, so it is only ever called
   *  from a click (starting the exam, or the "return to full screen" button). */
  const goFullscreen = useCallback(async () => {
    if (!invigilated || document.fullscreenElement) return;
    try {
      await runRef.current?.requestFullscreen();
    } catch {
      /* the browser or a policy refused — the sitting continues windowed */
    }
  }, [invigilated]);

  // `submit` is rebuilt on every tick of the clock. The invigilator must not be: read it
  // through a ref so the watch below is registered ONCE per sitting — re-registering it
  // each second would cancel the very timer that counts an absence.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // Leaving the paper: hidden tab, or the window losing focus. A few seconds are ignored —
  // a notification, a misclick — and beyond that it is counted.
  useEffect(() => {
    if (phase !== "sitting" || !invigilated) return;

    const strike = () => {
      const n = strikeCount.current + 1;
      strikeCount.current = n;
      setStrikes(n);
      if (n > EXAM_MAX_WARNINGS) {
        setEnding("invigilator");
        void submitRef.current(true);
      } else {
        setGuard({ kind: "away", strike: n });
      }
    };

    const away = () => {
      if (awaySince.current !== null || submitted.current) return;
      awaySince.current = Date.now();
      awayTimer.current = setTimeout(() => {
        awayTimer.current = null;
        awaySince.current = null; // this departure is counted; returning must not double it
        strike();
      }, EXAM_AWAY_GRACE_MS);
    };

    // Counted on the way back too, not only by the timer: a browser that suspends a hidden
    // tab may never run it, and "the tab was asleep" is exactly the case worth catching.
    const back = () => {
      const since = awaySince.current;
      awaySince.current = null;
      if (awayTimer.current) clearTimeout(awayTimer.current);
      awayTimer.current = null;
      if (since !== null && Date.now() - since >= EXAM_AWAY_GRACE_MS) strike();
    };

    const onVisibility = () => (document.hidden ? away() : back());
    const onFullscreen = () => {
      if (!document.fullscreenElement && !submitted.current) setGuard({ kind: "fullscreen" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    return () => {
      // Only stop watching. An absence in progress keeps its clock: it is counted when the
      // candidate comes back, whether or not the timer survived.
      if (awayTimer.current) clearTimeout(awayTimer.current);
      awayTimer.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
    };
  }, [phase, invigilated]);

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
      setEnding("time");
      void submit(true);
    }
  }, [left, phase, submit]);

  const runCheck = async (questionId: string, optionIds: string[]) => {
    try {
      const view = await onCheck(questionId, optionIds);
      setChecks((prev) => ({ ...prev, [questionId]: view }));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not check that answer");
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
      <div className="exam-run" ref={runRef}>
        <section className="exam-intro">
          <h2>{paper.title}</h2>
          {paper.preview && (
            <p className="badge">preview — nothing you do here is recorded</p>
          )}
          {paper.intro && <p className="exam-intro-text">{paper.intro}</p>}
          <Facts paper={paper} />
          <p className="exam-note exam-note-rules">
            <strong>Exam conditions.</strong> The paper opens on the whole screen and must stay
            there. Leaving it — another tab or another window — for more than{" "}
            {Math.round(EXAM_AWAY_GRACE_MS / 1000)} seconds is counted: you are warned{" "}
            {EXAM_MAX_WARNINGS} times, and the next interruption hands your paper in as it
            stands.
            {paper.preview && " Candidates are held to this; your preview is not."}
          </p>
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
            <button
              className="btn btn-primary"
              onClick={async () => {
                await goFullscreen();
                setPhase("sitting");
              }}
            >
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
      <div className="exam-run" ref={runRef}>
        <section className="exam-result" data-passed={result.passed}>
          {ending !== "self" && (
            <p className="exam-note exam-note-bad">
              {ending === "invigilator"
                ? `Your paper was handed in automatically: you left the exam ${strikes} times.`
                : "Time ran out — your paper was handed in as it stood."}
            </p>
          )}
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
  const warningsLeft = EXAM_MAX_WARNINGS - strikes;

  return (
    <div className="exam-run" ref={runRef} data-sitting="true">
      {/* The paper is covered whenever the candidate is not where they should be. */}
      {guard && (
        <div className="exam-guard" role="alertdialog" aria-modal="true">
          <div className="exam-guard-card">
            {guard.kind === "away" ? (
              <>
                <span className="exam-guard-icon" aria-hidden>
                  ⚠
                </span>
                <h3>You left the exam</h3>
                <p>
                  Leaving this paper — another tab, another window — is not allowed while it is
                  open. This is warning <strong>{guard.strike}</strong> of {EXAM_MAX_WARNINGS}.
                </p>
                <p className="auth-sub">
                  {warningsLeft > 0
                    ? `Leave it ${warningsLeft === 1 ? "once" : `${warningsLeft} times`} more and your paper is handed in as it stands.`
                    : "The next time, your paper is handed in as it stands."}
                </p>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await goFullscreen();
                    setGuard(null);
                  }}
                >
                  Back to the exam
                </button>
              </>
            ) : (
              <>
                <span className="exam-guard-icon" aria-hidden>
                  ⛶
                </span>
                <h3>The exam runs full screen</h3>
                <p>Your paper is hidden until it is back on the whole screen.</p>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await goFullscreen();
                    setGuard(null);
                  }}
                >
                  Return to full screen
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {pending && (
        <div className="exam-guard" role="alertdialog" aria-modal="true">
          <div className="exam-guard-card" data-tone="ask">
            <h3>Submit this exam?</h3>
            <p>
              {answeredCount < questions.length
                ? `${questions.length - answeredCount} question${questions.length - answeredCount === 1 ? " is" : "s are"} unanswered — they will score nothing.`
                : "Your answers will be marked now."}
            </p>
            <div className="exam-guard-actions">
              <button className="btn btn-quiet" onClick={() => setPending(false)}>
                Keep working
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void submit(false, true)}>
                {busy ? "Marking…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="exam-bar">
        <span>
          {answeredCount} of {questions.length} answered
        </span>
        <span className="exam-bar-track" aria-hidden>
          <span style={{ width: `${(answeredCount / Math.max(1, questions.length)) * 100}%` }} />
        </span>
        {invigilated && strikes > 0 && (
          <span className="exam-strikes" title="Times you have left this paper">
            ⚠ {strikes}/{EXAM_MAX_WARNINGS + 1}
          </span>
        )}
        {left !== null && (
          <span className="exam-timer" data-low={left <= 60}>
            ⏱ {clock(left)}
          </span>
        )}
      </div>

      {notice && (
        <p className="exam-notice" role="alert" onClick={() => setNotice(null)}>
          {notice}
        </p>
      )}

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
