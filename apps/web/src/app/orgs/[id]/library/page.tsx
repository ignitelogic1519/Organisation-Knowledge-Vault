"use client";

import { useCallback, useEffect, useState } from "react";
import type { LibraryCourse } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { requests } from "@/lib/orgs-client";
import { courses } from "@/lib/courses-client";
import { useOrg } from "@/components/org-context";
import { useDialogs } from "@/components/dialogs";

// The organization library — every course published to it, searchable by anyone in the
// org. Clicking an entry opens its detail window: description, completions, and the
// branches using it. From there a member requests the course; the request goes to the
// immediate handler of their branch, who configures it before it lands.

const KIND_LABELS: Record<string, string> = {
  DOCUMENT: "Document",
  BOOK: "Book",
  LINK: "Link",
  AUDIO: "Audio",
  VIDEO: "Video",
};

function CourseDetail({
  course,
  onClose,
}: {
  course: LibraryCourse;
  onClose: () => void;
}) {
  const { org } = useOrg();
  const dialogs = useDialogs();
  const [busy, setBusy] = useState(false);

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
          <div className="library-detail-head">
            <h3>{course.title}</h3>
            <span className="chip">{course.code}</span>
            <span className="badge">{KIND_LABELS[course.kind] ?? course.kind}</span>
          </div>
          <p className="sheet-msg">
            {course.description ?? "No description was added for this course."}
          </p>
          <div className="library-facts">
            <div className="library-fact">
              <span className="stat-n">{course.completedCount}</span>
              <span className="stat-l">completions</span>
            </div>
            <div className="library-fact">
              <span className="stat-n">{course.usedIn.length}</span>
              <span className="stat-l">branches using it</span>
            </div>
            <div className="library-fact">
              <span className="stat-n">{course.createdAt.slice(0, 10)}</span>
              <span className="stat-l">published by {course.uploaderRoleName}</span>
            </div>
          </div>
          {course.usedIn.length > 0 && (
            <p className="auth-sub">
              Used in: {[...new Set(course.usedIn)].join(" · ")}
            </p>
          )}

          <form
            className="library-request-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const target = String(d.get("target"));
              if (!target) return;
              setBusy(true);
              try {
                await requests.create(org.id, {
                  kind: "COURSE_ASSIGN",
                  targetRoleNodeId: target,
                  courseCode: course.code,
                  message: String(d.get("message") || "") || undefined,
                });
                dialogs.toast(
                  "Course request sent — your branch handler will configure and approve it.",
                  "success",
                );
                onClose();
              } catch (err) {
                dialogs.toast(
                  err instanceof ApiError ? err.message : "Could not send the request",
                  "danger",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <h4 className="learning-h">Request this course</h4>
            {org.myPlacements.length === 0 ? (
              <p className="auth-sub">
                You hold no position in this organization yet — join a branch first.
              </p>
            ) : (
              <>
                <label className="field">
                  <span>For your branch</span>
                  <select name="target" required defaultValue={org.myPlacements[0]?.roleNodeId}>
                    {org.myPlacements.map((p) => (
                      <option key={`${p.roleNodeId}:${p.kind}`} value={p.roleNodeId}>
                        {p.roleName} (you: {p.kind.toLowerCase()})
                      </option>
                    ))}
                  </select>
                  <small>
                    The request goes to this branch&apos;s handler, who tunes mandatory /
                    recurrence settings before assigning it
                  </small>
                </label>
                <label className="field">
                  <span>Message (optional)</span>
                  <textarea name="message" rows={2} maxLength={500} placeholder="Why your branch needs it…" />
                </label>
                <div className="sheet-actions">
                  <button type="button" className="btn btn-quiet" onClick={onClose}>
                    Close
                  </button>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? "Sending…" : "Send course request"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const { org } = useOrg();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<LibraryCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LibraryCourse | null>(null);

  const load = useCallback(
    (q: string) => {
      courses
        .library(org.id, q || undefined)
        .then((r) => setList(r.courses))
        .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the library"));
    },
    [org.id],
  );

  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <div className="panel-grid stagger">
      <div className="panel glass panel-wide">
        <h2>Course library</h2>
        <p className="auth-sub">
          Every course and certificate published to the organization library. Open one for
          its description, reviews of use, and to request it for your branch.
        </p>
        <label className="field library-search">
          <span className="sr-only">Search the library</span>
          <input
            type="search"
            placeholder="Search by title, description or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        {!list && !error && <div className="skeleton" style={{ minHeight: "8rem" }} />}
        {list?.length === 0 && (
          <p className="auth-sub">
            {query
              ? "Nothing in the library matches your search."
              : "Nothing has been published to the library yet — owners can publish courses from any branch's Courses panel."}
          </p>
        )}

        <div className="library-grid">
          {list?.map((c) => (
            <button key={c.code} className="library-card glass" onClick={() => setOpen(c)}>
              <div className="library-card-head">
                <span className="badge">{KIND_LABELS[c.kind] ?? c.kind}</span>
                <span className="chip">{c.code}</span>
              </div>
              <h3>{c.title}</h3>
              <p className="library-desc">
                {c.description ?? "No description added."}
              </p>
              <div className="library-meta">
                <span>✓ {c.completedCount} completed</span>
                <span>· {c.usedIn.length} branch{c.usedIn.length === 1 ? "" : "es"}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {open && <CourseDetail course={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
