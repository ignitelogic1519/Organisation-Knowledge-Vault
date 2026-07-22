"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LearningItem, MyLearningView } from "@vault/shared";
import { ApiError, authFetch } from "@/lib/auth-client";
import { courses } from "@/lib/courses-client";
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

function Row({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const locked = item.missingPrerequisites.length > 0;

  async function open() {
    // Links redirect via JSON; files stream — open in a new tab either way
    const res = await authFetch(`/courses/${item.code}/content`);
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const { url } = (await res.json()) as { url?: string };
      if (url) window.open(url, "_blank");
    } else {
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    }
  }

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
        <button className="btn btn-quiet btn-small" onClick={open}>
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
  const [view, setView] = useState<MyLearningView | null>(null);
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
      pending: all.filter((i) => i.status !== "COMPLETED"),
      completed: all.filter((i) => i.status === "COMPLETED"),
      overdue: all.filter((i) => i.overdue).length,
    };
  }, [view]);

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
              <Row key={i.code} item={i} onChanged={reload} />
            ))}
          </ul>
        </>
      )}

      {groups.completed.length > 0 && (
        <>
          <h3 className="learning-h">Completed</h3>
          <ul className="owner-list">
            {groups.completed.map((i) => (
              <Row key={i.code} item={i} onChanged={reload} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
