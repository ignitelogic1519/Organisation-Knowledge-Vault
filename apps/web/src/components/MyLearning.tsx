"use client";

import { useCallback, useEffect, useState } from "react";
import type { LearningItem, MyLearningView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { courses } from "@/lib/courses-client";

function StatusBadge({ item }: { item: LearningItem }) {
  if (item.overdue) return <span className="badge badge-danger">overdue</span>;
  switch (item.status) {
    case "COMPLETED":
      return <span className="badge badge-ok">completed</span>;
    case "EXPIRED":
      return <span className="badge badge-danger">expired — redo</span>;
    case "ASSIGNED":
      return <span className="badge">assigned</span>;
    default:
      return <span className="badge">opt-in</span>;
  }
}

function Row({ item, onChanged }: { item: LearningItem; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const locked = item.missingPrerequisites.length > 0;

  async function open() {
    // Links redirect via JSON; files stream — open in a new tab either way
    const res = await fetch(courses.contentUrl(item.code), {
      headers: { authorization: `Bearer ${localStorage.getItem("kv.accessToken")}` },
    });
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
        <span className="badge">{item.kind.toLowerCase()}</span> <StatusBadge item={item} />
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

  if (!view) return <p className="auth-sub">Loading…</p>;
  const empty = view.mandatory.length === 0 && view.optIn.length === 0;

  return (
    <div>
      {empty && <p className="auth-sub">No courses reach your position yet.</p>}
      {view.mandatory.length > 0 && (
        <>
          <h3 className="learning-h">Mandatory</h3>
          <ul className="owner-list">
            {view.mandatory.map((i) => (
              <Row key={i.code} item={i} onChanged={reload} />
            ))}
          </ul>
        </>
      )}
      {view.optIn.length > 0 && (
        <>
          <h3 className="learning-h">Available (opt-in)</h3>
          <ul className="owner-list">
            {view.optIn.map((i) => (
              <Row key={i.code} item={i} onChanged={reload} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
