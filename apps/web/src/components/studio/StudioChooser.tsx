"use client";

import { useRouter } from "next/navigation";
import type { OrgPlanLimitsView, TreeNode } from "@vault/shared";

// The Studio's front door. Creating in the Studio is no longer one thing, so the first
// question is which of the two it is: something to read, or something to sit. Both end up
// as a course on this branch — same code, same classification, same library rules — so the
// choice here is only about what the author is going to write.

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

export function StudioChooser({
  node,
  limits,
  roleId,
  orgId,
  canProceed,
  needsReview,
}: {
  node: TreeNode | null;
  limits: OrgPlanLimitsView | null;
  roleId: string;
  orgId: string;
  canProceed: boolean;
  needsReview: boolean;
}) {
  const router = useRouter();
  const quotaFull = limits?.documents.remaining === 0;

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
            onClick={() => router.replace(`/orgs/${orgId}/studio?role=${roleId}&type=${choice.key}`)}
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
