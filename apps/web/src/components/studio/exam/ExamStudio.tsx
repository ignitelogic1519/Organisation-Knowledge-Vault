"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  correctOptionIds,
  EMPTY_EXAM_SETTINGS,
  examProblems,
  gradeExam,
  isAnswerCorrect,
  type ExamAnswer,
  type ExamBody,
  type ExamQuestion,
  type ExamQuestionType,
  type ExamSettings,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { courses } from "@/lib/courses-client";
import { studio } from "@/lib/studio-client";
import { ExamRunner } from "@/components/ExamRunner";
import { useDialogs } from "@/components/dialogs";
import { useOrg } from "@/components/org-context";
import { DraftsTray } from "../DraftsTray";
import { EMPTY_META, type StudioMeta } from "../model";
import { useStudioSession } from "../session";
import { ExamInspector } from "./ExamInspector";
import { QuestionCard } from "./QuestionCard";
import {
  blankExam,
  cleanExam,
  duplicateQuestion,
  examStats,
  moveQuestion,
  newQuestion,
  previewPaper,
  QUESTION_TYPES,
} from "./model";

// The exam builder — the Studio's second creation mode. It is deliberately the same room as
// the document editor: the same top bar, the same three panes, the same draft tray and the
// same publish rules. Only the middle changes — a form of questions instead of a page of
// blocks — because everything AROUND an exam (classification, description, library shelf,
// mandatory/inherit placement, review-before-publish) is identical to a document's.

interface ExamDoc {
  meta: StudioMeta;
  exam: ExamBody;
}

const CLASS_LABEL: Record<string, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};

export function ExamStudio({ roleId }: { roleId: string }) {
  const { org, isSupremeOwner } = useOrg();
  const router = useRouter();
  const dialogs = useDialogs();
  const session = useStudioSession(org.id, roleId, isSupremeOwner);
  const { node, limits, categories, needsReview, quotaFull } = session;

  const [doc, setDoc] = useState<ExamDoc>({
    meta: { ...EMPTY_META, kind: "EXAM" },
    exam: blankExam(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [railTab, setRailTab] = useState<"questions" | "drafts">("questions");
  const [inspectorTab, setInspectorTab] = useState<"question" | "exam" | "document">("question");
  const [busy, setBusy] = useState<null | "publish" | "draft">(null);
  const [restored, setRestored] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewRun, setPreviewRun] = useState(0);

  const docRef = useRef<ExamDoc>(doc);
  const past = useRef<ExamDoc[]>([]);
  const future = useRef<ExamDoc[]>([]);
  const lastHistoryPush = useRef(0);
  const [, bumpHistory] = useState(0);
  const cardEls = useRef<Record<string, HTMLElement | null>>({});
  const draftKey = `kv.studio.exam.${org.id}.${roleId}`;

  // ── State with undo history (the document editor's model, applied to questions) ──
  const commit = useCallback((updater: (d: ExamDoc) => ExamDoc) => {
    const previous = docRef.current;
    const next = updater(previous);
    if (next === previous) return;
    const now = Date.now();
    if (now - lastHistoryPush.current > 500) {
      lastHistoryPush.current = now;
      past.current = [...past.current.slice(-59), previous];
      future.current = [];
      bumpHistory((n) => n + 1);
    }
    docRef.current = next;
    setDoc(next);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current = [docRef.current, ...future.current].slice(0, 60);
    docRef.current = previous;
    setDoc(previous);
    lastHistoryPush.current = 0;
    bumpHistory((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.shift();
    if (!next) return;
    past.current = [...past.current, docRef.current];
    docRef.current = next;
    setDoc(next);
    bumpHistory((n) => n + 1);
  }, []);

  const setMeta = useCallback((meta: StudioMeta) => commit((d) => ({ ...d, meta })), [commit]);
  const setExam = useCallback(
    (updater: (exam: ExamBody) => ExamBody) => commit((d) => ({ ...d, exam: updater(d.exam) })),
    [commit],
  );
  const setQuestions = useCallback(
    (updater: (questions: ExamQuestion[]) => ExamQuestion[]) =>
      setExam((exam) => ({ ...exam, questions: updater(exam.questions) })),
    [setExam],
  );
  const setSettings = useCallback(
    (settings: ExamSettings) => setExam((exam) => ({ ...exam, settings })),
    [setExam],
  );

  // Local recovery: the browser keeps the paper on every plan, so a reload never costs the
  // author their questions.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ExamDoc>;
        if (parsed.exam?.questions?.length) {
          // Merge over the defaults rather than trusting the stored shape: a paper written
          // by an older Studio reopens with anything it never knew about filled in.
          const next: ExamDoc = {
            meta: { ...EMPTY_META, kind: "EXAM", ...(parsed.meta ?? {}) },
            exam: {
              ...blankExam(),
              ...parsed.exam,
              settings: { ...EMPTY_EXAM_SETTINGS, ...(parsed.exam.settings ?? {}) },
            },
          };
          docRef.current = next;
          setDoc(next);
        }
      }
    } catch {
      /* ignore a corrupt local copy */
    }
    setRestored(true);
  }, [draftKey]);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(doc));
      } catch {
        /* storage full — the server draft (premium) is the durable path */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [doc, restored, draftKey]);

  const selected = doc.exam.questions.find((q) => q.id === selectedId) ?? null;
  const stats = useMemo(() => examStats(doc.exam), [doc.exam]);
  const problems = useMemo(() => examProblems(cleanExam(doc.exam)), [doc.exam]);
  const examDrafts = useMemo(() => session.drafts.filter((d) => d.kind === "EXAM"), [session.drafts]);

  // ── Question operations ────────────────────────────────────────────────────
  const addQuestion = useCallback(
    (type: ExamQuestionType = "single") => {
      const question = newQuestion(type);
      setQuestions((questions) => [...questions, question]);
      setSelectedId(question.id);
      setInspectorTab("question");
      // The new card is appended at the end — bring it into view once it exists.
      requestAnimationFrame(() =>
        cardEls.current[question.id]?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    },
    [setQuestions],
  );

  const updateQuestion = useCallback(
    (next: ExamQuestion) =>
      setQuestions((questions) => questions.map((q) => (q.id === next.id ? next : q))),
    [setQuestions],
  );

  const removeQuestion = useCallback(
    (id: string) => {
      setQuestions((questions) => questions.filter((q) => q.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId, setQuestions],
  );

  const goToQuestion = (id: string) => {
    setSelectedId(id);
    setInspectorTab("question");
    cardEls.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ── Premium gate & drafts ──────────────────────────────────────────────────
  const premiumNotice = () =>
    dialogs.alert({
      title: "Premium capability",
      tone: "info",
      message: (
        <>
          <p>
            Saving an exam as a draft is part of the premium plan. This organization is currently
            running on the <strong>free demo structure</strong>.
          </p>
          <p>
            Please contact your main administrator so they can arrange an upgrade with the
            Knowledge Base team. Once the premium plan is active, the capability is enabled for
            everyone in this organization.
          </p>
          <p className="auth-sub">
            Your work is not lost — this browser keeps the paper while you continue writing, and
            you can publish it at any time.
          </p>
        </>
      ),
    });

  const saveDraft = async () => {
    if (!node) return;
    if (!limits?.draftsEnabled) {
      await premiumNotice();
      return;
    }
    setBusy("draft");
    try {
      const saved = await studio.saveDraft(org.id, {
        id: draftId ?? undefined,
        roleNodeId: node.id,
        document: {
          ...doc.meta,
          kind: "EXAM",
          title: doc.meta.title.trim() || "Untitled exam",
          blocks: [],
          exam: cleanExam(doc.exam),
        },
      });
      setDraftId(saved.id);
      setSavedAt(new Date().toLocaleTimeString());
      session.reloadPlan();
      dialogs.toast("Draft saved — reopen it from the Drafts tab on any device.", "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) await premiumNotice();
      else dialogs.toast(err instanceof ApiError ? err.message : "Could not save the draft", "danger");
    } finally {
      setBusy(null);
    }
  };

  const openDraft = async (id: string) => {
    try {
      const loaded = await studio.draft(org.id, id);
      const { blocks: _blocks, exam, ...meta } = loaded.document;
      if (!exam) {
        dialogs.toast("That draft is a document — open it in the document editor.", "info");
        return;
      }
      const next: ExamDoc = {
        meta: { ...EMPTY_META, ...meta, kind: "EXAM" },
        exam: {
          ...blankExam(),
          ...exam,
          settings: { ...EMPTY_EXAM_SETTINGS, ...exam.settings },
        },
      };
      past.current = [];
      future.current = [];
      docRef.current = next;
      setDoc(next);
      setDraftId(id);
      setSelectedId(null);
      dialogs.toast("Draft opened.", "success");
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not open the draft", "danger");
    }
  };

  const deleteDraft = async (id: string) => {
    const ok = await dialogs.confirm({
      title: "Delete this draft?",
      message: "The saved copy is removed. Anything currently open in the editor stays open.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await studio.deleteDraft(org.id, id);
      if (draftId === id) setDraftId(null);
      session.reloadPlan();
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not delete the draft", "danger");
    }
  };

  const newExam = async () => {
    const ok = await dialogs.confirm({
      title: "Start a new exam?",
      message: "The paper is cleared. Save the current exam as a draft first if you need it.",
      confirmLabel: "Start new",
    });
    if (!ok) return;
    const next: ExamDoc = { meta: { ...EMPTY_META, kind: "EXAM" }, exam: blankExam() };
    past.current = [];
    future.current = [];
    docRef.current = next;
    setDoc(next);
    setDraftId(null);
    setSelectedId(null);
  };

  // ── Publish ────────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!node) return;
    const { meta } = doc;
    if (meta.title.trim().length < 2) {
      dialogs.toast("Give the exam a title.", "danger");
      setInspectorTab("document");
      return;
    }
    if (!meta.classification) {
      dialogs.toast("Classification is compulsory.", "danger");
      setInspectorTab("document");
      return;
    }
    if (meta.description.trim().length < 8) {
      dialogs.toast("Add a short description — it becomes the exam's description page.", "danger");
      setInspectorTab("document");
      return;
    }
    const exam = cleanExam(doc.exam);
    const blocking = examProblems(exam);
    if (blocking.length > 0) {
      await dialogs.alert({
        title: "The paper isn't ready yet",
        tone: "info",
        message: (
          <ul className="sheet-msg">
            {blocking.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ),
      });
      return;
    }
    if (quotaFull) {
      await dialogs.alert({
        title: "Document allowance reached",
        tone: "info",
        message: (
          <>
            <p>
              This organization has used all{" "}
              <strong>{limits?.documents.limit} custom documents</strong> included in its current
              plan — exams draw on the same allowance.
            </p>
            <p>
              Please ask your main administrator to arrange a premium plan with the Knowledge Base
              team, or free up capacity by deleting material that is no longer required.
            </p>
          </>
        ),
      });
      return;
    }

    setBusy("publish");
    try {
      const created = await courses.create(org.id, {
        roleNodeId: node.id,
        kind: "EXAM",
        title: meta.title.trim(),
        description: meta.description.trim(),
        scope: meta.scope.trim() || undefined,
        classification: meta.classification,
        allowDownload: false,
        inLibrary: meta.inLibrary,
        category: meta.category.trim() || undefined,
        exam,
        theme: meta.theme,
        resetsCompletionOnUpdate: meta.resets,
        prerequisiteCodes: [],
      });
      // Owners place immediately; a member's paper is placed by the reviewer on approval
      if (!created.draft) {
        await courses.place(created.code, {
          roleNodeId: node.id,
          mandatory: meta.mandatory,
          inheritToDescendants: meta.inherit,
        });
        dialogs.toast(`Published ${created.code} to ${node.name}.`, "success");
      } else {
        dialogs.toast("Sent to your branch manager for review.", "success");
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      if (draftId) await studio.deleteDraft(org.id, draftId).catch(() => undefined);
      router.push(created.draft ? `/orgs/${org.id}/requests` : `/orgs/${org.id}`);
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Publish failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  // ── Shortcuts ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) {
        if (e.key === "Escape" && mode !== "edit") setMode("edit");
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "s") {
        e.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── The author's own sitting: marked here in the browser, recorded nowhere ──
  const preview = useMemo(
    () => previewPaper(cleanExam(doc.exam), doc.meta.title),
    // A retry re-deals the paper, so the shuffle settings can actually be felt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.exam, doc.meta.title, previewRun],
  );

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (!node) return <div className="skeleton" style={{ minHeight: "12rem" }} />;
  if (!session.canProceed) {
    return (
      <div className="empty-card glass">
        <h2>Studio</h2>
        <p className="auth-sub">
          You don&apos;t have content-creation rights on <strong>{node.name}</strong>. An owner of
          this branch (or the level above) can grant you content rights from the People panel, or
          create the exam themselves.
        </p>
      </div>
    );
  }

  return (
    <div className="studio-shell" data-mode={mode}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="studio-topbar glass">
        <div className="studio-topbar-main">
          <button className="btn btn-quiet btn-small" onClick={() => router.back()}>
            ← Back
          </button>
          <div className="studio-title-wrap">
            <input
              className="studio-title-input"
              placeholder="Untitled exam"
              value={doc.meta.title}
              maxLength={120}
              onChange={(e) => setMeta({ ...doc.meta, title: e.target.value })}
            />
            <span className="studio-title-sub">
              {node.name} · exam
              {doc.meta.classification ? ` · ${CLASS_LABEL[doc.meta.classification]}` : ""}
              {savedAt ? ` · draft saved ${savedAt}` : ""}
            </span>
          </div>
          {needsReview && <span className="badge">needs manager review</span>}
        </div>
        <div className="studio-topbar-actions">
          <div className="studio-mode-switch" role="tablist" aria-label="Studio mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              data-active={mode === "edit"}
              onClick={() => setMode("edit")}
            >
              ✎ Build
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preview"}
              data-active={mode === "preview"}
              onClick={() => {
                setPreviewRun((n) => n + 1);
                setMode("preview");
              }}
            >
              ▷ Try it
            </button>
          </div>
          <button
            className="btn btn-quiet btn-small"
            disabled={busy !== null}
            data-locked={!limits?.draftsEnabled}
            title={
              limits?.draftsEnabled
                ? "Park this exam on the server (Ctrl+S)"
                : "Premium plans can park an exam as a draft"
            }
            onClick={saveDraft}
          >
            {busy === "draft" ? "Saving…" : limits?.draftsEnabled ? "🖫 Save draft" : "🔒 Save draft"}
          </button>
          <button className="btn btn-primary btn-small" disabled={busy !== null} onClick={publish}>
            {busy === "publish" ? "Working…" : needsReview ? "Submit for review" : "Publish"}
          </button>
        </div>
      </div>

      {mode === "edit" && (
        <>
          <div className="studio-workspace">
            {/* ── Rail: the paper's outline, and the drafts tray ─────────────── */}
            <aside className="studio-rail glass">
              <div className="studio-rail-tabs">
                <button
                  type="button"
                  data-active={railTab === "questions"}
                  onClick={() => setRailTab("questions")}
                >
                  Questions
                </button>
                <button
                  type="button"
                  data-active={railTab === "drafts"}
                  onClick={() => setRailTab("drafts")}
                >
                  Drafts
                </button>
              </div>

              {railTab === "questions" && (
                <div className="studio-rail-body">
                  <p className="studio-rail-hint">
                    {stats.questions} question{stats.questions === 1 ? "" : "s"} ·{" "}
                    {stats.totalPoints} marks · pass at {doc.exam.settings.passPercent}% (
                    {stats.passMark} marks)
                  </p>
                  {doc.exam.questions.map((q, i) => (
                    <button
                      key={q.id}
                      type="button"
                      className="exam-outline-item"
                      data-active={q.id === selectedId}
                      data-unfinished={
                        !q.prompt.trim() ||
                        q.options.filter((o) => o.text.trim()).length < 2 ||
                        !q.options.some((o) => o.correct && o.text.trim())
                      }
                      onClick={() => goToQuestion(q.id)}
                    >
                      <span className="exam-outline-no">{i + 1}</span>
                      <span className="exam-outline-text">
                        {q.prompt.trim() || "Untitled question"}
                      </span>
                    </button>
                  ))}
                  <div className="exam-rail-add">
                    {QUESTION_TYPES.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        className="btn btn-quiet btn-small"
                        title={t.hint}
                        onClick={() => addQuestion(t.key)}
                      >
                        + {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {railTab === "drafts" && (
                <DraftsTray
                  drafts={examDrafts}
                  draftsEnabled={!!limits?.draftsEnabled}
                  currentDraftId={draftId}
                  onOpenDraft={openDraft}
                  onDeleteDraft={deleteDraft}
                  onNew={newExam}
                  noun="exam"
                  countLabel="question"
                />
              )}
            </aside>

            {/* ── Canvas: the paper itself ───────────────────────────────────── */}
            <div className="studio-canvas">
              <div className="studio-canvas-sheet exam-sheet">
                <header className="exam-sheet-head">
                  <span className="doc-cover-org">{org.name}</span>
                  <h1>{doc.meta.title || "Untitled exam"}</h1>
                  <textarea
                    className="exam-intro-input"
                    rows={2}
                    maxLength={4000}
                    placeholder="Instructions shown before the exam starts (optional)"
                    value={doc.exam.intro}
                    onChange={(e) => setExam((exam) => ({ ...exam, intro: e.target.value }))}
                  />
                  <p className="auth-sub">
                    Pass mark {doc.exam.settings.passPercent}% ·{" "}
                    {doc.exam.settings.weighted ? "weighted marks" : "every question counts equally"}
                    {doc.exam.settings.shuffleQuestions ? " · randomised order" : ""}
                  </p>
                </header>

                {doc.exam.questions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    count={doc.exam.questions.length}
                    selected={question.id === selectedId}
                    settings={doc.exam.settings}
                    cardRef={(el) => {
                      cardEls.current[question.id] = el;
                    }}
                    onSelect={() => setSelectedId(question.id)}
                    onChange={updateQuestion}
                    onDuplicate={() => setQuestions((qs) => duplicateQuestion(qs, index))}
                    onRemove={() => removeQuestion(question.id)}
                    onMove={(delta) => setQuestions((qs) => moveQuestion(qs, index, index + delta))}
                  />
                ))}

                <button
                  type="button"
                  className="exam-add-question"
                  onClick={() => addQuestion("single")}
                >
                  + Add question
                </button>
              </div>
            </div>

            <ExamInspector
              tab={inspectorTab}
              onTab={setInspectorTab}
              question={selected}
              onQuestion={updateQuestion}
              exam={doc.exam}
              onSettings={setSettings}
              meta={doc.meta}
              onMeta={setMeta}
              limits={limits}
              categories={categories}
              needsReview={needsReview}
              passMark={stats.passMark}
              totalPoints={stats.totalPoints}
            />
          </div>

          <div className="studio-status glass">
            <span>
              {stats.questions} question{stats.questions === 1 ? "" : "s"} · {stats.totalPoints}{" "}
              marks · pass at {stats.passMark}
              {problems.length > 0 && (
                <>
                  {" · "}
                  <strong data-full="true">
                    {problems.length} thing{problems.length === 1 ? "" : "s"} to finish
                  </strong>
                </>
              )}
            </span>
            <span className="studio-status-right">
              {limits && limits.documents.limit != null && (
                <span data-full={quotaFull}>
                  {limits.documents.used} / {limits.documents.limit} custom documents used
                </span>
              )}
              <span>Saved in this browser</span>
            </span>
          </div>
        </>
      )}

      {mode === "preview" && (
        <div className="studio-preview">
          <p className="insp-note studio-preview-note">
            This is the candidate&apos;s view of your paper — marked here in your browser, recorded
            nowhere.
          </p>
          <ExamRunner
            paper={preview}
            onCheck={async (questionId, optionIds) => {
              const question = doc.exam.questions.find((q) => q.id === questionId);
              if (!question) return { correct: false };
              const { settings } = doc.exam;
              return {
                correct: isAnswerCorrect(question, optionIds),
                ...(settings.showCorrectAnswer
                  ? { correctOptionIds: correctOptionIds(question) }
                  : {}),
                ...(settings.showExplanation && question.explanation
                  ? { explanation: question.explanation }
                  : {}),
              };
            }}
            onSubmit={async (answers: ExamAnswer[]) => {
              const exam = cleanExam(doc.exam);
              const result = gradeExam(exam, answers);
              const { settings } = exam;
              return {
                percent: result.percent,
                passed: result.passed,
                earnedPoints: result.earnedPoints,
                totalPoints: result.totalPoints,
                correctCount: result.correctCount,
                questionCount: result.questionCount,
                attemptsUsed: 1,
                attemptsLeft: null,
                completed: false,
                ...(settings.reveal !== "never"
                  ? {
                      review: result.questions.map((q) => {
                        const question = exam.questions.find((x) => x.id === q.questionId);
                        return {
                          questionId: q.questionId,
                          correct: q.correct,
                          answered: q.answered,
                          ...(settings.showCorrectAnswer
                            ? { correctOptionIds: q.correctOptionIds }
                            : {}),
                          ...(settings.showExplanation && question?.explanation
                            ? { explanation: question.explanation }
                            : {}),
                        };
                      }),
                    }
                  : {}),
              };
            }}
            onRetry={async () => setPreviewRun((n) => n + 1)}
          />
        </div>
      )}
    </div>
  );
}
