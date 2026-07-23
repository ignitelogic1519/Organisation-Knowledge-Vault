"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CourseReviewView, LibraryCourse } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { requests } from "@/lib/orgs-client";
import { courses } from "@/lib/courses-client";
import { Stars } from "@/components/CourseViewer";
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
  const [busy, setBusy] = useState(false);
  const [reviews, setReviews] = useState<CourseReviewView[] | null>(null);

  useEffect(() => {
    courses
      .reviews(course.code)
      .then((r) => setReviews(r.reviews))
      .catch(() => setReviews([]));
  }, [course.code]);

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
  const [kindFilter, setKindFilter] = useState("all");
  const [shelfFilter, setShelfFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
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
  }, [list, kindFilter, shelfFilter, classFilter, minRating, showArchived, sort]);

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
                <button key={c.code} className="library-card glass" onClick={() => setOpen(c)}>
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
                    <span>✓ {c.completedCount} completed</span>
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
