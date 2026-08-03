"use client";

import type { StudioDraftSummary } from "@vault/shared";

// The "Your drafts" tray, shared by both Studio editors. Each editor passes the drafts it
// can actually reopen — an exam draft would be meaningless in the document editor and the
// other way round — so the list never offers something that cannot be opened.

export function DraftsTray({
  drafts,
  draftsEnabled,
  currentDraftId,
  onOpenDraft,
  onDeleteDraft,
  onNew,
  noun,
  countLabel,
}: {
  drafts: StudioDraftSummary[];
  draftsEnabled: boolean;
  currentDraftId: string | null;
  onOpenDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  onNew: () => void;
  /** "document" / "exam" — the wording of the notes and the new-work button. */
  noun: string;
  /** "block" / "question" — what the count on each card means (pluralized here). */
  countLabel: string;
}) {
  return (
    <div className="studio-rail-body">
      {!draftsEnabled && (
        <p className="studio-premium-note">
          <strong>Premium capability.</strong> Work in progress can be parked on the server and
          reopened from any device on a premium plan. On the free demo structure your work is
          still kept in this browser while you write.
        </p>
      )}
      {draftsEnabled && drafts.length === 0 && (
        <p className="studio-rail-hint">
          No drafts yet. Use <strong>Save draft</strong> to park this {noun} and come back to it
          later.
        </p>
      )}
      {drafts.map((d) => (
        <div key={d.id} className="studio-draft-card" data-active={d.id === currentDraftId}>
          <button type="button" className="studio-draft-open" onClick={() => onOpenDraft(d.id)}>
            <span className="studio-draft-title">{d.title}</span>
            <span className="studio-draft-meta">
              {d.roleName} · {d.blockCount} {countLabel}
              {d.blockCount === 1 ? "" : "s"} · {new Date(d.updatedAt).toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Delete draft"
            onClick={() => onDeleteDraft(d.id)}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-quiet btn-small" onClick={onNew}>
        ✎ Start a new {noun}
      </button>
    </div>
  );
}
