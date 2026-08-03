"use client";

import { versionLabel } from "@vault/shared";
import type { CourseEditSession } from "./edit-session";

// The strip both editors show when they are revising something already published: which
// edition is live, whether it is still deployed, and the one button that changes that.

export function EditBanner({
  session,
  noun,
}: {
  session: CourseEditSession;
  /** "document" / "exam" — the wording only. */
  noun: string;
}) {
  const { detail, live, busy } = session;
  if (!detail) return null;

  return (
    <div className="studio-edit-banner" data-live={live}>
      <span className="studio-edit-state">
        {live ? "🟢 In deployment" : "⏸ Out of deployment"}
      </span>
      <span className="studio-edit-text">
        {live ? (
          <>
            <strong>{detail.code}</strong> is live at {versionLabel(detail.version)}. Take it out
            of deployment before publishing your changes — readers keep {versionLabel(detail.version)}{" "}
            until you do, and nobody is left mid-{noun} on an edition being rewritten.
          </>
        ) : (
          <>
            <strong>{detail.code}</strong> is out of deployment and reaches nobody. Publishing
            saves your changes as{" "}
            <strong>{versionLabel(detail.version + 1)}</strong> and puts it straight back on the
            branches it was already placed on.
          </>
        )}
      </span>
      <button
        className={live ? "btn btn-primary btn-small" : "btn btn-quiet btn-small"}
        disabled={busy}
        onClick={() => void session.setDeployed(!live)}
      >
        {busy ? "Working…" : live ? "⏸ Take out of deployment" : "▲ Put back as is"}
      </button>
    </div>
  );
}
