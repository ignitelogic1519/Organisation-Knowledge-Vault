"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LearningItem, MyLearningView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { courses } from "@/lib/courses-client";
import { CourseViewer } from "./CourseViewer";
import { useDialogs } from "./dialogs";
import { useOrgEvent } from "./org-events";

// My Learning — the member's course list, grouped by what matters to them:
// pending (assigned / in progress / expired / overdue) first, completed below.

type Item = LearningItem & { mandatory: boolean };

function StatusBadge({ item }: { item: Item }) {
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

function Row({
  item,
  onChanged,
  onOpen,
}: {
  item: Item;
  onChanged: () => void;
  onOpen: (item: Item) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const locked = item.missingPrerequisites.length > 0;

  return (
    <li className="learning-row">
      <div className="learning-main">
        <strong>{item.title}</strong> <span className="chip">{item.code}</span>{" "}
        <span className="badge">{item.kind.toLowerCase()}</span>{" "}
        <span className="badge">{item.mandatory ? "mandatory" : "opt-in"}</span>{" "}
        <StatusBadge item={item} />
        <div className="auth-sub">
          via {item.viaRoleName}
          {item.retakeEveryNDays && ` · repeats every ${item.retakeEveryNDays} days`}
          {item.deadlineDays && ` · deadline ${item.deadlineDays} days`}
          {item.validUntil && ` · valid until ${item.validUntil.slice(0, 10)}`}
          {locked && ` · locked — complete first: ${item.missingPrerequisites.join(", ")}`}
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="tree-actions">
        <button className="btn btn-quiet btn-small" onClick={() => onOpen(item)}>
          Open
        </button>
        {item.status !== "COMPLETED" && (
          <button
            className="btn btn-primary btn-small"
            disabled={locked}
            title={locked ? "Prerequisites pending" : undefined}
            onClick={async () => {
              setError(null);
              try {
                await courses.complete(item.code);
                onChanged();
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Failed");
              }
            }}
          >
            Mark complete
          </button>
        )}
      </div>
    </li>
  );
}

export function MyLearning({ orgId }: { orgId: string }) {
  const dialogs = useDialogs();
  const [view, setView] = useState<MyLearningView | null>(null);
  const [viewerItem, setViewerItem] = useState<Item | null>(null);
  const reload = useCallback(() => {
    courses.myLearning(orgId).then(setView).catch(() => setView(null));
  }, [orgId]);
  useEffect(reload, [reload]);
  // Live: newly assigned/changed courses land without a refresh
  useOrgEvent(["courses", "structure"], reload);

  const groups = useMemo(() => {
    if (!view) return null;
    const all: Item[] = [
      ...view.mandatory.map((i) => ({ ...i, mandatory: true })),
      ...view.optIn.map((i) => ({ ...i, mandatory: false })),
    ];
    return {
      all,
      pending: all.filter((i) => i.status !== "COMPLETED"),
      completed: all.filter((i) => i.status === "COMPLETED"),
      overdue: all.filter((i) => i.overdue).length,
    };
  }, [view]);

  // The viewer's item goes stale after reloads — keep it in sync
  useEffect(() => {
    if (!viewerItem || !groups) return;
    const fresh = groups.all.find((i) => i.code === viewerItem.code);
    if (fresh && fresh !== viewerItem) setViewerItem(fresh);
  }, [groups, viewerItem]);

  if (!groups) {
    return (
      <div className="tree" aria-hidden>
        <div className="skeleton" style={{ height: "3rem" }} />
        <div className="skeleton" style={{ height: "3rem" }} />
      </div>
    );
  }

  const empty = groups.pending.length === 0 && groups.completed.length === 0;

  return (
    <div>
      <div className="stat-row">
        <div className="stat-card glass">
          <span className="stat-n gradient-text">{groups.pending.length}</span>
          <span className="stat-l">Pending courses</span>
        </div>
        <div className="stat-card glass">
          <span className="stat-n gradient-text">{groups.completed.length}</span>
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

      {groups.pending.length > 0 && (
        <>
          <h3 className="learning-h">Pending</h3>
          <ul className="owner-list">
            {groups.pending.map((i) => (
              <Row key={i.code} item={i} onChanged={reload} onOpen={setViewerItem} />
            ))}
          </ul>
        </>
      )}

      {groups.completed.length > 0 && (
        <>
          <h3 className="learning-h">Completed</h3>
          <ul className="owner-list">
            {groups.completed.map((i) => (
              <Row key={i.code} item={i} onChanged={reload} onOpen={setViewerItem} />
            ))}
          </ul>
        </>
      )}

      {viewerItem && (
        <CourseViewer
          item={viewerItem}
          onClose={() => setViewerItem(null)}
          onChanged={reload}
          onOpenRelated={(code) => {
            const related = groups.all.find((i) => i.code === code);
            if (related) setViewerItem(related);
            else dialogs.toast("That document doesn't reach your position.", "info");
          }}
        />
      )}
    </div>
  );
}
