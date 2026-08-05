"use client";

import { useEffect, useState } from "react";
import {
  versionLabel,
  type CourseHistoryView,
  type OrgPlanLimitsView,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { courses, type CourseDetail } from "@/lib/courses-client";
import { useDialogs } from "@/components/dialogs";
import { DocumentProperties } from "./DocumentProperties";
import { EMPTY_META, type StudioMeta } from "./model";

// Editing the properties of something already published.
//
// The gap this closes: an author could publish a document and then never change what they
// had said about it. Classification, description, shelf, deadline, recurrence,
// prerequisites, download permission — all of it was fixed at publish time, and the only
// route back was to revise the CONTENT in the Studio, which is a new edition and resets
// everybody's completion. Changing a shelf tag should not cost the organization a
// re-read of the document.
//
// So this edits metadata only. It never touches the stored content, which is why it does
// not bump the version and does not require taking the document out of deployment — two
// things that only make sense when what reaches the reader actually changes.

export function PropertiesEditor({
  code,
  orgId,
  limits,
  categories,
  onClose,
  onSaved,
}: {
  code: string;
  orgId: string;
  limits: OrgPlanLimitsView | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogs = useDialogs();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [history, setHistory] = useState<CourseHistoryView | null>(null);
  const [meta, setMeta] = useState<StudioMeta | null>(null);
  const [tab, setTab] = useState<"properties" | "history">("properties");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    courses
      .info(code)
      .then((d) => {
        setDetail(d);
        setMeta({
          ...EMPTY_META,
          title: d.title,
          description: d.description ?? "",
          scope: d.scope ?? "",
          category: d.category ?? "",
          classification: d.classification,
          kind: d.kind === "BOOK" ? "BOOK" : d.kind === "EXAM" ? "EXAM" : "DOCUMENT",
          inLibrary: d.inLibrary,
          resets: d.resetsCompletionOnUpdate,
          allowDownload: d.allowDownload,
          deadlineDays: d.deadlineDays,
          retakeEveryNDays: d.retakeEveryNDays,
          prerequisiteCodes: d.prerequisiteCodes,
        });
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not open this document"));
    courses
      .editions(code)
      .then(setHistory)
      .catch(() => setHistory(null));
  }, [code]);

  const save = async () => {
    if (!meta || !detail) return;
    if (meta.title.trim().length < 2) {
      dialogs.toast("A title of at least two characters is compulsory.", "danger");
      return;
    }
    if (meta.description.trim().length < 8) {
      dialogs.toast("The description is compulsory — a sentence at minimum.", "danger");
      return;
    }
    if (!meta.classification) {
      dialogs.toast("Classification is compulsory.", "danger");
      return;
    }
    setBusy(true);
    try {
      await courses.update(code, {
        title: meta.title.trim(),
        description: meta.description.trim(),
        scope: meta.scope.trim() || null,
        category: meta.category.trim() || null,
        classification: meta.classification,
        inLibrary: meta.inLibrary,
        resetsCompletionOnUpdate: meta.resets,
        allowDownload: meta.allowDownload,
        deadlineDays: meta.deadlineDays,
        retakeEveryNDays: meta.retakeEveryNDays,
        prerequisiteCodes: meta.prerequisiteCodes,
      });
      dialogs.toast(`Properties of ${code} saved.`, "success");
      onSaved();
      onClose();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not save";
      setError(message);
      dialogs.toast(message, "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="sheet-layer"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet sheet-wide glass-strong" role="dialog" aria-modal="true">
        <span className="sheet-grip" aria-hidden />
        <div className="sheet-body">
          <div className="proped-head">
            <div>
              <h3>{detail?.title ?? code}</h3>
              <p className="auth-sub">
                <span className="chip">{code}</span>{" "}
                {detail && <span className="chip">{versionLabel(detail.version)}</span>}{" "}
                {detail?.source === "STUDIO" ? "built in the Studio" : "brought in as an upload"}
              </p>
            </div>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="proped-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "properties"}
              data-active={tab === "properties"}
              onClick={() => setTab("properties")}
            >
              Properties
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "history"}
              data-active={tab === "history"}
              onClick={() => setTab("history")}
              data-hint="Every edition ever published of this document, what changed in each, and what it replaced or was replaced by."
              data-hint-title="Version history"
            >
              Version history
              {history && <span className="proped-tab-count">{history.editions.length}</span>}
            </button>
          </div>

          {error && <p className="form-error">{error}</p>}
          {!meta && !error && <div className="skeleton" style={{ minHeight: "9rem" }} />}

          {meta && tab === "properties" && (
            <>
              <p className="proped-note">
                This changes what the organization <em>says</em> about the document — not the
                document. Nothing here bumps the version or expires anyone&rsquo;s completion, so
                fixing a shelf tag or a deadline costs nobody a re-read. To change the content
                itself, use <strong>Revise</strong> on the branch panel.
              </p>
              <div className="proped-form">
                <label className="field">
                  <span>Title</span>
                  <input
                    value={meta.title}
                    maxLength={120}
                    onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                  />
                </label>
                <DocumentProperties
                  meta={meta}
                  onMeta={setMeta}
                  limits={limits}
                  categories={categories}
                  needsReview={false}
                  noun={detail?.kind === "EXAM" ? "exam" : "document"}
                  showKind={false}
                  // Placement is the branch's decision and is edited on the branch panel;
                  // replacement is a publish-time choice, not an afterthought.
                  showPlacement={false}
                  showVersionControl={false}
                  orgId={orgId}
                  selfCode={code}
                />
              </div>
              <div className="sheet-actions">
                <button className="btn btn-quiet" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={busy} onClick={save}>
                  {busy ? "Saving…" : "Save properties"}
                </button>
              </div>
            </>
          )}

          {tab === "history" && <VersionHistory history={history} />}
        </div>
      </div>
    </div>
  );
}

/** The edition log: what was published, when, by whom and why. */
export function VersionHistory({ history }: { history: CourseHistoryView | null }) {
  if (!history) return <div className="skeleton" style={{ minHeight: "6rem" }} />;

  return (
    <div className="verhist">
      {(history.supersedes || history.supersededBy) && (
        <div className="verhist-chain">
          {history.supersededBy && (
            <p className="insp-warn">
              This document was <strong>retired</strong>
              {history.supersededAt ? ` on ${history.supersededAt.slice(0, 10)}` : ""}. The current
              word on the subject is <strong>{history.supersededBy.title}</strong> (
              {history.supersededBy.code}).
            </p>
          )}
          {history.supersedes && (
            <p className="insp-note">
              Published as a replacement for <strong>{history.supersedes.title}</strong> (
              {history.supersedes.code}), which was retired onto this one.
            </p>
          )}
        </div>
      )}

      <ol className="verhist-list">
        {history.editions.map((e) => (
          <li key={e.version} data-current={e.current}>
            <span className="verhist-dot" aria-hidden />
            <div className="verhist-main">
              <div className="verhist-line">
                <strong>{e.label}</strong>
                {e.current && (
                  <span
                    className="badge badge-ok"
                    data-hint="This is the edition readers receive today."
                  >
                    current
                  </span>
                )}
                {e.resetCompletions && (
                  <span
                    className="badge"
                    data-hint="Publishing this edition expired every completion of the one before it, so everybody had to read it again."
                  >
                    re-read required
                  </span>
                )}
                <span className="badge">{e.source === "STUDIO" ? "Studio" : "upload"}</span>
              </div>
              <p className="verhist-note">
                {e.note ?? <em className="auth-sub">No note was left for this edition.</em>}
              </p>
              <span className="auth-sub">
                {e.publishedBy} · {e.publishedAt.slice(0, 10)}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {history.editions.length === 0 && (
        <p className="auth-sub">No editions recorded for this document yet.</p>
      )}
    </div>
  );
}
