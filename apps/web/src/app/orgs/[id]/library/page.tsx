"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  versionLabel,
  type CourseComplianceView,
  type CourseReviewView,
  type LibraryCourse,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { requests } from "@/lib/orgs-client";
import { courses } from "@/lib/courses-client";
import { Stars } from "@/components/CourseViewer";
import { readerPath } from "@/lib/reader-window";
import { useOrg } from "@/components/org-context";
import { useOrgEvent } from "@/components/org-events";
import { useDialogs } from "@/components/dialogs";

// The organization library — a real library: shelves grouped by category tag,
// filterable by type / category / rating, sortable, searchable. Opening an entry shows
// its description, ratings and member comments, and lets you request the course for
// your branch (the request goes to that branch's handler, who configures it first).

const KIND_LABELS: Record<string, string> = {
  DOCUMENT: "Document",
  BOOK: "Book",
  EXAM: "Exam",
  LINK: "Link",
  AUDIO: "Audio",
  VIDEO: "Video",
};

const CLASS_LABEL: Record<string, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};

const UNSHELVED = "Uncategorised";

function RatingLine({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null) return <span className="auth-sub">not rated yet</span>;
  return (
    <span className="rating-line" title={`${avg} out of 5 from ${count} rating${count === 1 ? "" : "s"}`}>
      <span className="star star-static" data-on="true">
        ★
      </span>
      {avg} <span className="auth-sub">({count})</span>
    </span>
  );
}

function CourseDetail({
  course,
  onClose,
}: {
  course: LibraryCourse;
  onClose: () => void;
}) {
  const { org } = useOrg();
  const dialogs = useDialogs();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState<CourseReviewView[] | null>(null);
  // Compliance is manager-only: the endpoint returns 403 for everyone else, so we
  // simply hide the panel unless the fetch succeeds (branch manager or course owner).
  const [compliance, setCompliance] = useState<CourseComplianceView | null>(null);
  const [showCompliance, setShowCompliance] = useState(false);

  useEffect(() => {
    courses
      .reviews(course.code)
      .then((r) => setReviews(r.reviews))
      .catch(() => setReviews([]));
    courses
      .compliance(course.code)
      .then(setCompliance)
      .catch(() => setCompliance(null));
  }, [course.code]);

  const pct =
    compliance && compliance.total > 0
      ? Math.round((compliance.compliant / compliance.total) * 100)
      : 0;

  /**
   * Open a course that already reaches the reader — straight to the full-screen reader
   * (/read/:orgId/:code), the same one My Learning uses. It looks itself up there, so it
   * always has the latest deadline, completion and prerequisites, not a snapshot from the
   * library card.
   */
  const openIt = () => router.push(readerPath(org.id, course.code));

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
            <span className="chip">{versionLabel(course.version)}</span>
            <span className={`badge class-badge class-${course.classification}`}>
              {CLASS_LABEL[course.classification]}
            </span>
            {course.archived && <span className="badge badge-danger">archived</span>}
            {course.category && <span className="chip chip-shelf">{course.category}</span>}
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
              <span className="stat-n">
                <RatingLine avg={course.avgRating} count={course.ratingCount} />
              </span>
              <span className="stat-l">member rating</span>
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
            <p className="auth-sub">Used in: {[...new Set(course.usedIn)].join(" · ")}</p>
          )}

          <div className="library-detail-actions">
            {course.usedInNodeIds.length > 0 && (
              <button
                className="btn btn-quiet btn-small"
                title="Highlight this course's branches in the constellation"
                onClick={() =>
                  router.push(`/orgs/${org.id}?focus=${course.usedInNodeIds.join(",")}`)
                }
              >
                ✦ Show where it&apos;s published
              </button>
            )}
            {compliance && (
              <button
                className="btn btn-quiet btn-small"
                onClick={() => setShowCompliance((v) => !v)}
              >
                {showCompliance ? "Hide compliance" : "📊 View compliance"}
              </button>
            )}
          </div>

          {compliance && showCompliance && (
            <div className="libc-panel glass">
              <div className="libc-head">
                <h4 className="learning-h" style={{ margin: 0 }}>
                  {compliance.mandatory ? "Mandatory compliance" : "Completion"}
                </h4>
                <span className="auth-sub">
                  Visible to this course&apos;s owner and the assigning branch managers only
                </span>
              </div>
              {compliance.mandatory ? (
                <>
                  <div className="libc-bar" role="img" aria-label={`${pct}% compliant`}>
                    <div
                      className="libc-bar-fill"
                      style={{ width: `${pct}%` }}
                      data-level={pct >= 80 ? "ok" : pct >= 50 ? "warn" : "low"}
                    />
                    <span className="libc-bar-label">{pct}% compliant</span>
                  </div>
                  <div className="library-facts" style={{ marginTop: "0.7rem" }}>
                    <div className="library-fact">
                      <span className="stat-n">{compliance.compliant}</span>
                      <span className="stat-l">compliant</span>
                    </div>
                    <div className="library-fact">
                      <span className="stat-n">
                        {compliance.total - compliance.compliant}
                      </span>
                      <span className="stat-l">non-compliant</span>
                    </div>
                    <div className="library-fact">
                      <span className="stat-n">{compliance.total}</span>
                      <span className="stat-l">people assigned</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="library-facts">
                  <div className="library-fact">
                    <span className="stat-n">{compliance.compliant}</span>
                    <span className="stat-l">completed</span>
                  </div>
                  <div className="library-fact">
                    <span className="stat-n">{compliance.total}</span>
                    <span className="stat-l">people it reaches</span>
                  </div>
                </div>
              )}

              {compliance.nonCompliantMembers.length > 0 && (
                <>
                  <h5 className="libc-sub">
                    {compliance.mandatory ? "Non-compliant" : "Not yet completed"} ·{" "}
                    {compliance.nonCompliantMembers.length}
                  </h5>
                  <ul className="people-list libc-list">
                    {compliance.nonCompliantMembers.map((m) => (
                      <li key={`${m.profileId}:${m.viaRoleName}`} className="person-card">
                        <span className="person-main">
                          <span className="person-name">{m.displayName}</span>
                          <span className="person-sub">
                            @{m.username} · {m.viaRoleName}
                          </span>
                        </span>
                        <span className="person-chips">
                          {m.overdue && <span className="badge badge-danger">overdue</span>}
                          <span className="badge">{m.status.toLowerCase()}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {compliance.compliantMembers.length > 0 && (
                <>
                  <h5 className="libc-sub">
                    {compliance.mandatory ? "Compliant" : "Completed"} ·{" "}
                    {compliance.compliantMembers.length}
                  </h5>
                  <ul className="people-list libc-list">
                    {compliance.compliantMembers.map((m) => (
                      <li key={`${m.profileId}:${m.viaRoleName}`} className="person-card">
                        <span className="person-main">
                          <span className="person-name">{m.displayName}</span>
                          <span className="person-sub">
                            @{m.username} · {m.viaRoleName}
                          </span>
                        </span>
                        <span className="person-chips">
                          <span className="badge badge-ok">
                            {m.completedAt ? m.completedAt.slice(0, 10) : "done"}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <h4 className="learning-h">Member reviews</h4>
          {!reviews && <div className="skeleton" style={{ minHeight: "2.5rem" }} />}
          {reviews?.length === 0 && (
            <p className="auth-sub">
              No reviews yet — members can rate and comment after completing the course.
            </p>
          )}
          {reviews && reviews.length > 0 && (
            <ul className="review-list">
              {reviews.map((r, i) => (
                <li key={`${r.username}:${i}`} className="review-item">
                  <div className="review-head">
                    <strong>{r.displayName}</strong>
                    <span className="auth-sub">@{r.username}</span>
                    {r.rating !== null && <Stars value={r.rating} />}
                    <span className="auth-sub">· {r.updatedAt.slice(0, 10)}</span>
                  </div>
                  {r.comment && <p className="review-comment">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}

          {/* ── What you can actually do with it ──────────────────────────────
              The library used to hand everyone the same "request this for my branch"
              form — including for documents already sitting in the reader's own My
              Learning. Asking permission for something you already have is not a step,
              it is an obstacle. So: if it already reaches you, open it. Only the
              branches it does NOT reach are worth requesting it for, and when there are
              none the form does not appear at all. */}
          {course.inMySpace && (
            <div className="library-mine">
              <div className="library-mine-head">
                <span className="library-mine-tick" aria-hidden>
                  ✓
                </span>
                <div>
                  <strong>This is already in your space.</strong>
                  <p className="auth-sub">
                    It reaches you through{" "}
                    <strong>{[...new Set(course.reachesViaRoleNames)].join(", ")}</strong>
                    {course.myStatus === "COMPLETED"
                      ? " — and you have completed it."
                      : course.myStatus === "IN_PROGRESS"
                        ? " — you have it in progress."
                        : "."}
                  </p>
                </div>
              </div>
              <button
                className="btn btn-primary"
                data-hint="Opens in the full-screen reader. No request, no approval — it is already yours."
                data-hint-title="Open it"
                onClick={openIt}
              >
                {course.kind === "EXAM" ? "▷ Sit the exam" : "📖 Open it now"}
              </button>
            </div>
          )}

          {course.supersededByCode && (
            <p className="insp-warn">
              This document has been replaced. The current word on the subject is{" "}
              <strong>{course.supersededByCode}</strong> — look for it on the shelves.
            </p>
          )}

          {course.requestableRoles.length > 0 ? (
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
              <h4 className="learning-h">
                {course.inMySpace ? "Request it for another branch" : "Request this course"}
              </h4>
              <label className="field">
                <span>For your branch</span>
                <select
                  name="target"
                  required
                  defaultValue={course.requestableRoles[0]?.roleNodeId}
                >
                  {course.requestableRoles.map((p) => (
                    <option key={p.roleNodeId} value={p.roleNodeId}>
                      {p.roleName} (you: {p.kind.toLowerCase()})
                    </option>
                  ))}
                </select>
                <small>
                  Only branches this course does not already reach are listed — the request
                  goes to that branch&apos;s handler, who tunes mandatory / recurrence settings
                  before assigning it.
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
            </form>
          ) : (
            <div className="sheet-actions">
              {org.myPlacements.length === 0 && (
                <p className="auth-sub" style={{ marginRight: "auto" }}>
                  You hold no position in this organization yet — join a branch first.
                </p>
              )}
              {org.myPlacements.length > 0 && !course.inMySpace && (
                <p className="auth-sub" style={{ marginRight: "auto" }}>
                  Every branch you hold already receives this.
                </p>
              )}
              {course.inMySpace && course.requestableRoles.length === 0 && (
                <p className="auth-sub" style={{ marginRight: "auto" }}>
                  Every branch you hold already receives this — there is nothing left to ask for.
                </p>
              )}
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Close
              </button>
            </div>
          )}
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
  const [kindFilter, setKindFilter] = useState("all");
  const [shelfFilter, setShelfFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  /** "Already in my space" vs "not yet mine" — the split the reader actually cares about. */
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine" | "new">("all");
  const [sort, setSort] = useState<"newest" | "rating" | "completions" | "title">("newest");

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
  // Live: newly published/removed library courses appear without a refresh
  useOrgEvent(["courses"], () => load(query));

  const shelves = useMemo(() => {
    if (!list) return null;
    const filtered = list.filter(
      (c) =>
        (showArchived || !c.archived) &&
        (scopeFilter === "all" ||
          (scopeFilter === "mine" ? c.inMySpace : !c.inMySpace)) &&
        (kindFilter === "all" || c.kind === kindFilter) &&
        (shelfFilter === "all" || (c.category ?? UNSHELVED) === shelfFilter) &&
        (classFilter === "all" || c.classification === classFilter) &&
        (minRating === 0 || (c.avgRating !== null && c.avgRating >= minRating)),
    );
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "rating") return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      if (sort === "completions") return b.completedCount - a.completedCount;
      if (sort === "title") return a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt);
    });
    const grouped = new Map<string, LibraryCourse[]>();
    for (const c of sorted) {
      const shelf = c.category ?? UNSHELVED;
      grouped.set(shelf, [...(grouped.get(shelf) ?? []), c]);
    }
    // Shelves alphabetically, "Uncategorised" always last
    return [...grouped.entries()].sort(([a], [b]) =>
      a === UNSHELVED ? 1 : b === UNSHELVED ? -1 : a.localeCompare(b),
    );
  }, [list, kindFilter, shelfFilter, classFilter, minRating, showArchived, scopeFilter, sort]);

  const allShelves = useMemo(
    () => [...new Set((list ?? []).map((c) => c.category ?? UNSHELVED))].sort(),
    [list],
  );

  return (
    <div className="panel-grid stagger">
      <div className="panel glass panel-wide">
        <h2>Course library</h2>
        <p className="auth-sub">
          Every course and certificate published to the organization, shelved by category.
          Open one for its description, ratings and member reviews — and request it for
          your branch.
        </p>

        <div className="library-toolbar">
          <label className="field library-search">
            <span className="sr-only">Search the library</span>
            <input
              type="search"
              placeholder="Search title, description, category or code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="all">All types</option>
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Shelf</span>
            <select value={shelfFilter} onChange={(e) => setShelfFilter(e.target.value)}>
              <option value="all">All shelves</option>
              {allShelves.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Class</span>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="all">All classes</option>
              {Object.entries(CLASS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Rating</span>
            <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
              <option value={0}>Any rating</option>
              <option value={4}>★ 4+</option>
              <option value={3}>★ 3+</option>
              <option value={2}>★ 2+</option>
            </select>
          </label>
          <label className="field">
            <span>Scope</span>
            <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)}>
              <option value="all">Everything</option>
              <option value="mine">Already in my space</option>
              <option value="new">Not yet mine</option>
            </select>
          </label>
          <label className="ack-row" style={{ alignSelf: "center" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span>Show archived</span>
          </label>
          <label className="field">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="newest">Newest</option>
              <option value="rating">Best rated</option>
              <option value="completions">Most completed</option>
              <option value="title">Title A–Z</option>
            </select>
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
        {!list && !error && <div className="skeleton" style={{ minHeight: "8rem" }} />}
        {shelves?.length === 0 && (
          <p className="auth-sub">
            {query || kindFilter !== "all" || shelfFilter !== "all" || minRating > 0
              ? "Nothing on the shelves matches your filters."
              : "Nothing has been published to the library yet — owners can publish courses from any branch's Courses panel."}
          </p>
        )}

        {shelves?.map(([shelf, items]) => (
          <section key={shelf} className="shelf">
            <div className="shelf-head">
              <h3>{shelf}</h3>
              <span className="auth-sub">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="library-grid">
              {items.map((c) => (
                <button
                  key={c.code}
                  className="library-card glass"
                  data-mine={c.inMySpace}
                  onClick={() => setOpen(c)}
                  data-hint={
                    c.inMySpace
                      ? `Already yours through ${[...new Set(c.reachesViaRoleNames)].join(", ")} — opening this opens the document, it does not ask for it.`
                      : "Not assigned to you yet. Open it to read what it is and ask for it for your branch."
                  }
                  data-hint-title={c.title}
                >
                  <div className="library-card-head">
                    <span className="badge">{KIND_LABELS[c.kind] ?? c.kind}</span>
                    <span className={`badge class-badge class-${c.classification}`}>
                      {CLASS_LABEL[c.classification]}
                    </span>
                    <RatingLine avg={c.avgRating} count={c.ratingCount} />
                  </div>
                  <h3>
                    {c.title}
                    {c.archived && <span className="badge badge-danger" style={{ marginLeft: "0.4rem" }}>archived</span>}
                  </h3>
                  <p className="library-desc">{c.description ?? "No description added."}</p>
                  <div className="library-meta">
                    {c.inMySpace ? (
                      <span className="library-mine-chip">
                        {c.myStatus === "COMPLETED" ? "✓ completed" : "in my space"}
                      </span>
                    ) : (
                      <span>✓ {c.completedCount} completed</span>
                    )}
                    <span>
                      · {c.usedIn.length} branch{c.usedIn.length === 1 ? "" : "es"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {open && <CourseDetail course={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
