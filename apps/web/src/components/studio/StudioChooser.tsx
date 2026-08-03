"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrgPlanLimitsView, StudioDraftSummary, TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { studio } from "@/lib/studio-client";
import { useDialogs } from "@/components/dialogs";
import { localDraftsFor, type LocalDraft } from "./local-drafts";

// The Studio's front door. Creating in the Studio is no longer one thing, so the first
// question is which of the two it is: something to read, or something to sit. Both end up
// as a course on this branch — same code, same classification, same library rules — so the
// choice here is only about what the author is going to write.
//
// It is also where unfinished work is picked up. Two things are listed, because work in
// progress lives in two places: the drafts parked on the SERVER (a paid capability, reachable
// from any device) and the copy this BROWSER keeps of whatever was last open (every plan,
// this device only).

interface Choice {
  key: "document" | "exam";
  icon: string;
  title: string;
  blurb: string;
  points: string[];
}

const CHOICES: Choice[] = [
  {
    key: "document",
    icon: "📄",
    title: "Document",
    blurb: "An interactive document, handbook or deck people read in the app.",
    points: [
      "Text, tables, images, audio & video, embeds",
      "Pages with turn animations, themes and layouts",
      "Completed by reading it through",
    ],
  },
  {
    key: "exam",
    icon: "🧠",
    title: "Test / exam",
    blurb: "A multiple-choice paper people sit, marked automatically against a pass mark.",
    points: [
      "Single-answer, multi-answer and true/false questions",
      "Pass percentage, equal or weighted marks, randomised order",
      "Completed by passing it — the score decides",
    ],
  },
];

const modeOf = (kind: StudioDraftSummary["kind"]) => (kind === "EXAM" ? "exam" : "document");
const iconOf = (kind: StudioDraftSummary["kind"]) => (kind === "EXAM" ? "🧠" : "📄");

export function StudioChooser({
  node,
  limits,
  drafts,
  onDraftsChanged,
  roleId,
  orgId,
  canProceed,
  needsReview,
}: {
  node: TreeNode | null;
  limits: OrgPlanLimitsView | null;
  /** The author's own drafts parked on the server, newest first. */
  drafts: StudioDraftSummary[];
  onDraftsChanged: () => void;
  roleId: string;
  orgId: string;
  canProceed: boolean;
  needsReview: boolean;
}) {
  const router = useRouter();
  const dialogs = useDialogs();
  const quotaFull = limits?.documents.remaining === 0;
  const draftsEnabled = !!limits?.draftsEnabled;

  // The browser's own copy of whatever was last open here — read after mount, since
  // localStorage does not exist while the page is rendered on the server.
  const [local, setLocal] = useState<LocalDraft[]>([]);
  useEffect(() => setLocal(localDraftsFor(orgId, roleId)), [orgId, roleId]);

  const open = (mode: "document" | "exam", role: string, draftId?: string) =>
    router.replace(
      `/orgs/${orgId}/studio?role=${role}&type=${mode}${draftId ? `&draft=${draftId}` : ""}`,
    );

  const discard = async (draft: StudioDraftSummary) => {
    const ok = await dialogs.confirm({
      title: "Delete this draft?",
      message: `“${draft.title}” is removed from the server. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await studio.deleteDraft(orgId, draft.id);
      onDraftsChanged();
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not delete the draft", "danger");
    }
  };

  if (!node) return <div className="skeleton" style={{ minHeight: "12rem" }} />;
  if (!canProceed) {
    return (
      <div className="empty-card glass">
        <h2>Studio</h2>
        <p className="auth-sub">
          You don&apos;t have content-creation rights on <strong>{node.name}</strong>. An owner of
          this branch (or the level above) can grant you content rights from the People panel, or
          create the material themselves.
        </p>
      </div>
    );
  }

  return (
    <div className="studio-chooser">
      <header className="studio-chooser-head">
        <h1>What are you creating?</h1>
        <p className="auth-sub">
          For <strong>{node.name}</strong>
          {needsReview && " · your work will go to the branch manager for review"}
        </p>
      </header>

      <div className="studio-chooser-grid">
        {CHOICES.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className="studio-chooser-card glass"
            onClick={() => open(choice.key, roleId)}
          >
            <span className="studio-chooser-icon" aria-hidden>
              {choice.icon}
            </span>
            <span className="studio-chooser-title">{choice.title}</span>
            <span className="studio-chooser-blurb">{choice.blurb}</span>
            <ul className="studio-chooser-points">
              {choice.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <span className="studio-chooser-go">Start →</span>
          </button>
        ))}
      </div>

      {/* ── Pick up where you left off ─────────────────────────────────────── */}
      <section className="studio-resume glass">
        <div className="studio-resume-head">
          <h2>Continue a draft</h2>
          <p className="auth-sub">
            Saved drafts live on the server under your account and open on any device. This
            browser also keeps whatever you last had open here, on every plan.
          </p>
        </div>

        {local.length > 0 && (
          <>
            <h3 className="studio-resume-group">On this browser</h3>
            {local.map((d) => (
              <div key={d.mode} className="studio-resume-row" data-source="local">
                <button
                  type="button"
                  className="studio-resume-open"
                  onClick={() => open(d.mode, roleId)}
                >
                  <span className="studio-resume-icon" aria-hidden>
                    {d.mode === "exam" ? "🧠" : "📄"}
                  </span>
                  <span className="studio-resume-text">
                    <span className="studio-resume-title">{d.title}</span>
                    <span className="studio-resume-meta">
                      {d.mode === "exam" ? "Exam" : "Document"} · {d.count}{" "}
                      {d.mode === "exam" ? "question" : "block"}
                      {d.count === 1 ? "" : "s"} · unsaved, kept in this browser
                    </span>
                  </span>
                  <span className="studio-resume-go">Continue →</span>
                </button>
              </div>
            ))}
          </>
        )}

        <h3 className="studio-resume-group">
          Saved drafts
          {!draftsEnabled && <span className="badge">premium</span>}
        </h3>
        {!draftsEnabled && (
          <p className="studio-premium-note">
            <strong>Premium capability.</strong> Parking work on the server — and reopening it on
            another device — is part of a paid plan. This organization is on the{" "}
            <strong>free plan</strong>, so <strong>Save draft</strong> is locked in both editors;
            your work is still kept in this browser while you write, and you can publish at any
            time. Your main administrator can arrange an upgrade with the Knowledge Base team.
          </p>
        )}
        {draftsEnabled && drafts.length === 0 && (
          <p className="studio-rail-hint">
            Nothing parked yet. Use <strong>Save draft</strong> in either editor and it will be
            listed here.
          </p>
        )}
        {drafts.map((d) => (
          <div key={d.id} className="studio-resume-row" data-source="server">
            <button
              type="button"
              className="studio-resume-open"
              onClick={() => open(modeOf(d.kind), d.roleNodeId, d.id)}
            >
              <span className="studio-resume-icon" aria-hidden>
                {iconOf(d.kind)}
              </span>
              <span className="studio-resume-text">
                <span className="studio-resume-title">{d.title}</span>
                <span className="studio-resume-meta">
                  {d.kind === "EXAM" ? "Exam" : "Document"} · {d.roleName} · {d.blockCount}{" "}
                  {d.kind === "EXAM" ? "question" : "block"}
                  {d.blockCount === 1 ? "" : "s"} · saved {new Date(d.updatedAt).toLocaleString()}
                </span>
              </span>
              <span className="studio-resume-go">Open →</span>
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              title="Delete this draft"
              onClick={() => discard(d)}
            >
              ✕
            </button>
          </div>
        ))}
      </section>

      {limits && limits.documents.limit != null && (
        <p className="plan-allowance" data-full={quotaFull}>
          <span>
            Studio material: <strong>{limits.documents.used}</strong> of {limits.documents.limit}{" "}
            used
          </span>
          <span className="auth-sub">
            Documents and exams share the organization&apos;s custom-material allowance.
          </span>
        </p>
      )}

      <button className="btn btn-quiet btn-small" onClick={() => router.back()}>
        ← Back
      </button>
    </div>
  );
}
