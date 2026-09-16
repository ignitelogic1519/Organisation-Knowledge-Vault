"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { versionLabel, type LearningItem, type MyLearningView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { courses } from "@/lib/courses-client";
import { kindLabel } from "@/lib/course-labels";
import { readerPath } from "@/lib/reader-window";
import { ActionMenu, type ActionGroup } from "./ActionMenu";
import {
  CatalogueBar,
  CatalogueEmpty,
  CatalogueRow,
  CatalogueSection,
  kindGlyph,
} from "./Catalogue";
import { IconEye, IconExam } from "./icons";
import { useOrgEvent } from "./org-events";

// My Learning — the member's course list, grouped by what matters to them:
// pending (assigned / in progress / expired / overdue) first, completed below. A member
// of a large organization can hold a hundred of them, so the list is searchable and each
// group collapses; the row opens the document, and the ⋯ beside it holds the rest.
//
// "Open" goes straight to the full-screen reader (/read/:orgId/:code) rather than a dialog
// floating over this page — a document is the one thing here worth the whole screen, and a
// small centred panel with its own internal scrollbars read as broken, not as a preview.

type Item = LearningItem & { mandatory: boolean };

function statusBadge(item: Item) {
  if (item.overdue) return <span className="badge badge-danger">overdue</span>;
  switch (item.status) {
    case "COMPLETED":
      return <span className="badge badge-ok">completed</span>;
    case "EXPIRED":
      return <span className="badge badge-danger">expired — redo</span>;
    case "IN_PROGRESS":
      return <span className="badge">in progress</span>;
    default:
      return <span className="badge">assigned</span>;
  }
}

/** The one line under the title: where it comes from and what it asks of the reader. */
function itemMeta(item: Item): string {
  return [
    item.code,
    kindLabel(item.kind),
    versionLabel(item.version),
    item.viaRoleName && `via ${item.viaRoleName}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function MyLearning({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [view, setView] = useState<MyLearningView | null>(null);
  const [query, setQuery] = useState("");
  /** The item whose action menu is open — the ⋯ beside a row opens it. */
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    courses.myLearning(orgId).then(setView).catch(() => setView(null));
  }, [orgId]);
  useEffect(reload, [reload]);
  // Live: newly assigned/changed courses land without a refresh
  useOrgEvent(["courses", "structure"], reload);

  const openReader = useCallback(
    (code: string) => router.push(readerPath(orgId, code)),
    [router, orgId],
  );

  const groups = useMemo(() => {
    if (!view) return null;
    const all: Item[] = [
      ...view.mandatory.map((i) => ({ ...i, mandatory: true })),
      ...view.optIn.map((i) => ({ ...i, mandatory: false })),
    ];
    const q = query.trim().toLowerCase();
    const matches = q
      ? all.filter((i) =>
          [i.title, i.code, kindLabel(i.kind), i.viaRoleName, i.description ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : all;
    return {
      all,
      matches,
      pending: matches.filter((i) => i.status !== "COMPLETED"),
      completed: matches.filter((i) => i.status === "COMPLETED"),
      overdue: all.filter((i) => i.overdue).length,
    };
  }, [view, query]);

  const open = groups?.all.find((i) => i.code === openCode) ?? null;

  const complete = useCallback(
    async (code: string) => {
      setError(null);
      try {
        await courses.complete(code);
        reload();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not mark it complete");
        throw e;
      }
    },
    [reload],
  );

  const itemActions = (item: Item): ActionGroup[] => {
    const locked = item.missingPrerequisites.length > 0;
    return [
      {
        title: "Read it",
        options: [
          {
            key: "open",
            label: item.kind === "EXAM" ? "Sit the exam" : "Open the document",
            glyph: item.kind === "EXAM" ? <IconExam size={16} /> : <IconEye size={16} />,
            tone: "primary",
            desc:
              item.kind === "EXAM"
                ? "Opens the paper full screen, question by question."
                : "Opens it full screen, with everything it links to.",
            run: () => openReader(item.code),
          },
        ],
      },
      {
        title: "Your progress",
        // An exam completes by being passed, so it is never marked complete by hand.
        options:
          item.status === "COMPLETED" || item.kind === "EXAM"
            ? []
            : [
                {
                  key: "complete",
                  label: "Mark it complete",
                  glyph: <span aria-hidden>✓</span>,
                  disabled: locked,
                  disabledReason: `Locked until you finish ${item.missingPrerequisites.join(", ")}.`,
                  desc: item.retakeEveryNDays
                    ? `Records it as done. It comes back in ${item.retakeEveryNDays} days.`
                    : "Records it as done against your compliance.",
                  run: () => complete(item.code),
                },
              ],
      },
    ];
  };

  if (!groups) {
    return (
      <div className="tree" aria-hidden>
        <div className="skeleton" style={{ height: "3rem" }} />
        <div className="skeleton" style={{ height: "3rem" }} />
      </div>
    );
  }

  const empty = groups.all.length === 0;

  return (
    <div>
      <div className="stat-row">
        <div className="stat-card glass">
          <span className="stat-n gradient-text">
            {groups.all.filter((i) => i.status !== "COMPLETED").length}
          </span>
          <span className="stat-l">Pending courses</span>
        </div>
        <div className="stat-card glass">
          <span className="stat-n gradient-text">
            {groups.all.filter((i) => i.status === "COMPLETED").length}
          </span>
          <span className="stat-l">Completed</span>
        </div>
        <div className="stat-card glass">
          <span
            className="stat-n"
            style={{ color: groups.overdue > 0 ? "var(--danger)" : undefined }}
          >
            {groups.overdue}
          </span>
          <span className="stat-l">Overdue</span>
        </div>
      </div>

      {empty && <p className="auth-sub">No courses reach your position yet.</p>}
      {error && <p className="form-error">{error}</p>}

      {groups.all.length > 5 && (
        <CatalogueBar
          value={query}
          onChange={setQuery}
          label="Search your courses"
          placeholder="Search title, code or the branch it comes from…"
          shown={groups.matches.length}
          total={groups.all.length}
          noun="course"
        />
      )}

      {!empty && groups.matches.length === 0 && (
        <CatalogueEmpty>Nothing assigned to you matches that search.</CatalogueEmpty>
      )}

      {/* The list scrolls in itself from tablet width up, so the page stays the height of the
          display and the counts above it stay in view. A phone scrolls the page instead — a
          scroller inside a scrolling page is a trap under a thumb. */}
      <div className="learning-scroll">
        {groups.pending.length > 0 && (
          <CatalogueSection
            title="Pending"
            count={groups.pending.length}
            forceOpen={query.trim().length > 0}
          >
            {groups.pending.map((i) => (
              <CatalogueRow
                key={i.code}
                leading={kindGlyph(i.kind)}
                title={i.title}
                meta={itemMeta(i)}
                chips={
                  <>
                    <span className="badge">{i.mandatory ? "mandatory" : "opt-in"}</span>
                    {statusBadge(i)}
                    {i.missingPrerequisites.length > 0 && (
                      <span className="badge badge-danger">
                        locked · {i.missingPrerequisites.join(", ")}
                      </span>
                    )}
                    {i.validUntil && (
                      <span className="badge">valid until {i.validUntil.slice(0, 10)}</span>
                    )}
                  </>
                }
                hint={i.kind === "EXAM" ? "Open the paper" : "Open the document"}
                hintTitle={i.title}
                onOpen={() => openReader(i.code)}
                onMore={() => setOpenCode(i.code)}
                moreLabel={`What you can do with ${i.title}`}
              />
            ))}
          </CatalogueSection>
        )}

        {groups.completed.length > 0 && (
          <CatalogueSection
            title="Completed"
            count={groups.completed.length}
            tone="muted"
            defaultOpen={groups.pending.length === 0}
            forceOpen={query.trim().length > 0}
          >
            {groups.completed.map((i) => (
              <CatalogueRow
                key={i.code}
                leading={kindGlyph(i.kind)}
                title={i.title}
                meta={itemMeta(i)}
                chips={
                  <>
                    {statusBadge(i)}
                    {i.validUntil && (
                      <span className="badge">valid until {i.validUntil.slice(0, 10)}</span>
                    )}
                  </>
                }
                hint="Read it again — it stays open to you"
                hintTitle={i.title}
                onOpen={() => openReader(i.code)}
                onMore={() => setOpenCode(i.code)}
                moreLabel={`What you can do with ${i.title}`}
              />
            ))}
          </CatalogueSection>
        )}
      </div>

      {open && (
        <ActionMenu
          title={open.title}
          subtitle={itemMeta(open)}
          chips={
            <>
              <span className="badge">{open.mandatory ? "mandatory" : "opt-in"}</span>
              {statusBadge(open)}
              {open.deadlineDays && (
                <span className="badge">deadline {open.deadlineDays} days</span>
              )}
              {open.retakeEveryNDays && (
                <span className="badge">repeats every {open.retakeEveryNDays} days</span>
              )}
            </>
          }
          groups={itemActions(open)}
          onClose={() => setOpenCode(null)}
        />
      )}
    </div>
  );
}
