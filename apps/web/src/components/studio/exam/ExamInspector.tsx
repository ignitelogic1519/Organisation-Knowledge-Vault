"use client";

import type {
  ExamBody,
  ExamQuestion,
  ExamRevealMode,
  ExamSettings,
  OrgPlanLimitsView,
} from "@vault/shared";
import { DocumentProperties } from "../DocumentProperties";
import { Row, Toggle } from "../fields";
import type { StudioMeta } from "../model";
import { QUESTION_TYPES, retypeQuestion } from "./model";

// The exam inspector. Three tabs, in the order an author thinks: the question they are
// writing, the rules of the paper as a whole, and the document properties the exam is
// published with — the last of which is the very same panel the document editor uses.

const REVEAL: { key: ExamRevealMode; label: string; hint: string }[] = [
  {
    key: "immediate",
    label: "As they answer",
    hint: "The candidate is told right or wrong the moment they pick an answer.",
  },
  {
    key: "after",
    label: "After submitting",
    hint: "The whole paper is reviewed once, on the result screen.",
  },
  { key: "never", label: "Never", hint: "They see the outcome only — no answers are shown." },
];

export function ExamInspector({
  tab,
  onTab,
  question,
  onQuestion,
  exam,
  onSettings,
  meta,
  onMeta,
  limits,
  categories,
  needsReview,
  passMark,
  totalPoints,
}: {
  tab: "question" | "exam" | "document";
  onTab: (t: "question" | "exam" | "document") => void;
  question: ExamQuestion | null;
  onQuestion: (next: ExamQuestion) => void;
  exam: ExamBody;
  onSettings: (next: ExamSettings) => void;
  meta: StudioMeta;
  onMeta: (next: StudioMeta) => void;
  limits: OrgPlanLimitsView | null;
  categories: string[];
  needsReview: boolean;
  /** Marks needed to pass, given the current weights — the pass mark made concrete. */
  passMark: number;
  totalPoints: number;
}) {
  const s = exam.settings;
  const set = (patch: Partial<ExamSettings>) => onSettings({ ...s, ...patch });

  return (
    <aside className="studio-inspector glass">
      <div className="studio-inspector-tabs">
        <button type="button" data-active={tab === "question"} onClick={() => onTab("question")}>
          Question
        </button>
        <button type="button" data-active={tab === "exam"} onClick={() => onTab("exam")}>
          Exam
        </button>
        <button type="button" data-active={tab === "document"} onClick={() => onTab("document")}>
          Document
        </button>
      </div>

      {tab === "question" && (
        <div className="studio-inspector-body">
          {!question && <p className="insp-note">Select a question on the page to set it up.</p>}
          {question && (
            <>
              <h4 className="insp-section">Answering</h4>
              <Row label="Type">
                <select
                  value={question.type}
                  onChange={(e) =>
                    onQuestion(retypeQuestion(question, e.target.value as ExamQuestion["type"]))
                  }
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label} — {t.hint}
                    </option>
                  ))}
                </select>
              </Row>
              <Toggle
                label="Must be answered"
                checked={question.required}
                onChange={(v) => onQuestion({ ...question, required: v })}
                hint="A required question blocks submission until it is answered."
              />
              <Row
                label="Marks"
                hint={
                  s.weighted
                    ? "This question's share of the paper."
                    : "Only used once the paper switches to unequal weights."
                }
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  disabled={!s.weighted}
                  value={question.points}
                  onChange={(e) => onQuestion({ ...question, points: Number(e.target.value) || 0 })}
                />
              </Row>

              <h4 className="insp-section">Extras</h4>
              <Row label="Image" hint="Shown above the options.">
                <input
                  type="url"
                  placeholder="https://…"
                  value={question.image ?? ""}
                  onChange={(e) => onQuestion({ ...question, image: e.target.value || undefined })}
                />
              </Row>
              <Row label="Explanation" hint="Shown with the answer, when answers are revealed.">
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={question.explanation}
                  onChange={(e) => onQuestion({ ...question, explanation: e.target.value })}
                />
              </Row>
            </>
          )}
        </div>
      )}

      {tab === "exam" && (
        <div className="studio-inspector-body">
          <h4 className="insp-section">Marking</h4>
          <Row
            label={`Pass mark — ${s.passPercent}%`}
            hint={`A candidate needs ${passMark} of the paper's ${totalPoints} marks.`}
          >
            <input
              type="range"
              min={1}
              max={100}
              value={s.passPercent}
              onChange={(e) => set({ passPercent: Number(e.target.value) })}
            />
          </Row>
          <Row label="Exact pass percentage">
            <input
              type="number"
              min={1}
              max={100}
              value={s.passPercent}
              onChange={(e) =>
                set({ passPercent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })
              }
            />
          </Row>
          <Toggle
            label="Unequal weights"
            checked={s.weighted}
            onChange={(v) => set({ weighted: v })}
            hint="Off: every question counts the same. On: each question is worth the marks you give it."
          />
          <Toggle
            label="Passing completes the exam"
            checked={s.requirePassToComplete}
            onChange={(v) => set({ requirePassToComplete: v })}
            hint="Off: sitting it once counts as complete, whatever the score."
          />

          <h4 className="insp-section">Answer feedback</h4>
          <p className="insp-note">
            Whether the candidate is told if an answer is right — live as they work, once at the
            end, or not at all.
          </p>
          <Row label="Reveal answers">
            <select
              value={s.reveal}
              onChange={(e) => set({ reveal: e.target.value as ExamRevealMode })}
            >
              {REVEAL.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Row>
          <p className="insp-note">{REVEAL.find((r) => r.key === s.reveal)?.hint}</p>
          <Toggle
            label="Show which option was right"
            checked={s.showCorrectAnswer}
            onChange={(v) => set({ showCorrectAnswer: v })}
            disabled={s.reveal === "never"}
          />
          <Toggle
            label="Show your explanations"
            checked={s.showExplanation}
            onChange={(v) => set({ showExplanation: v })}
            disabled={s.reveal === "never"}
          />
          <Toggle
            label="Show the score and pass mark"
            checked={s.showScore}
            onChange={(v) => set({ showScore: v })}
          />

          <h4 className="insp-section">Delivery</h4>
          <Toggle
            label="Randomise the question order"
            checked={s.shuffleQuestions}
            onChange={(v) => set({ shuffleQuestions: v })}
            hint="Every candidate gets the paper in a different order."
          />
          <Toggle
            label="Randomise the options"
            checked={s.shuffleOptions}
            onChange={(v) => set({ shuffleOptions: v })}
          />
          <Toggle
            label="One question per screen"
            checked={s.onePerPage}
            onChange={(v) => set({ onePerPage: v })}
          />
          <Row label="Time limit (minutes)" hint="Empty = untimed. The paper submits itself at 0.">
            <input
              type="number"
              min={1}
              max={600}
              value={s.timeLimitMinutes ?? ""}
              onChange={(e) =>
                set({ timeLimitMinutes: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Row>
          <Row label="Attempts allowed" hint="Empty = unlimited.">
            <input
              type="number"
              min={1}
              max={50}
              value={s.maxAttempts ?? ""}
              onChange={(e) => set({ maxAttempts: e.target.value ? Number(e.target.value) : null })}
            />
          </Row>
        </div>
      )}

      {tab === "document" && (
        <div className="studio-inspector-body">
          <DocumentProperties
            meta={meta}
            onMeta={onMeta}
            limits={limits}
            categories={categories}
            needsReview={needsReview}
            noun="exam"
            showKind={false}
          />
        </div>
      )}
    </aside>
  );
}
