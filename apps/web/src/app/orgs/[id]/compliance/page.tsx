"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComplianceCourse, ComplianceReport, TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";
import { compliance } from "@/lib/courses-client";
import { useOrg } from "@/components/org-context";
import { useOrgEvent } from "@/components/org-events";
import { useDialogs } from "@/components/dialogs";

// Compliance — the manager's view: pick any branch you govern (ownership can sit on
// several levels at once), see per-course compliance across its subtree, and nudge the
// non-compliant with a default or custom message.

function CourseBlock({
  course,
  roleId,
  onSent,
}: {
  course: ComplianceCourse;
  roleId: string;
  onSent: () => void;
}) {
  const dialogs = useDialogs();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pct = course.total === 0 ? 100 : Math.round((course.compliant / course.total) * 100);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="compliance-card glass">
      <button className="compliance-head" onClick={() => setExpanded((v) => !v)}>
        <div className="compliance-title">
          <strong>{course.title}</strong> <span className="chip">{course.code}</span>{" "}
          <span className="badge">{course.mandatory ? "mandatory" : "opt-in"}</span>{" "}
          <span className="auth-sub">via {course.viaRoleName}</span>
        </div>
        <div className="compliance-score">
          <div className="compliance-bar" role="img" aria-label={`${pct}% compliant`}>
            <span style={{ width: `${pct}%` }} data-full={pct === 100} />
          </div>
          <span className="auth-sub">
            {course.compliant}/{course.total} compliant
            {course.pending.some((p) => p.overdue) && (
              <span className="badge badge-danger" style={{ marginLeft: "0.4rem" }}>
                overdue
              </span>
            )}
          </span>
        </div>
        <span className="drawer-menu-arrow" aria-hidden>
          {expanded ? "▾" : "›"}
        </span>
      </button>

      {expanded && (
        <div className="compliance-body">
          {course.pending.length === 0 ? (
            <p className="auth-sub">Everyone is compliant with this course. 🎉</p>
          ) : (
            <>
              <div className="compliance-select-row">
                <label className="ack-row">
                  <input
                    type="checkbox"
                    checked={selected.size === course.pending.length}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(course.pending.map((p) => p.profileId))
                          : new Set(),
                      )
                    }
                  />
                  <span>Select all non-compliant ({course.pending.length})</span>
                </label>
              </div>
              <ul className="people-list">
                {course.pending.map((p) => (
                  <li key={p.profileId} className="person-card">
                    <label className="ack-row" style={{ flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.profileId)}
                        onChange={() => toggle(p.profileId)}
                      />
                      <span className="person-main">
                        <span className="person-name">{p.displayName}</span>
                        <span className="person-sub">@{p.username}</span>
                      </span>
                    </label>
                    {p.overdue ? (
                      <span className="badge badge-danger">overdue</span>
                    ) : (
                      <span className="badge">{p.status.toLowerCase()}</span>
                    )}
                  </li>
                ))}
              </ul>
              <label className="field">
                <span>Reminder message (optional — a default is sent otherwise)</span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Please complete "${course.title}" — your branch's compliance depends on it.`}
                />
              </label>
              <div className="request-actions">
                <button
                  className="btn btn-primary btn-small"
                  disabled={selected.size === 0 || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await compliance.remind(roleId, {
                        courseCode: course.code,
                        profileIds: [...selected],
                        message: message.trim() || undefined,
                      });
                      dialogs.toast(
                        `Reminder sent to ${res.reminded} member${res.reminded === 1 ? "" : "s"}.`,
                        "success",
                      );
                      setSelected(new Set());
                      setMessage("");
                      onSent();
                    } catch (e) {
                      dialogs.toast(
                        e instanceof ApiError ? e.message : "Could not send reminders",
                        "danger",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  🔔 Send reminder ({selected.size})
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompliancePage() {
  const { org } = useOrg();
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStructure = useCallback(() => {
    roles
      .structure(org.id)
      .then((v) => setNodes(v.nodes))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load structure"));
  }, [org.id]);
  useEffect(loadStructure, [loadStructure]);

  // Every branch this user governs — ownership can exist on several levels at once
  const governed = useMemo(
    () => (nodes ?? []).filter((n) => n.my.canAddPeople),
    [nodes],
  );

  useEffect(() => {
    if (!roleId && governed.length > 0) setRoleId(governed[0].id);
  }, [governed, roleId]);

  const loadReport = useCallback(() => {
    if (!roleId) return;
    setError(null);
    compliance
      .report(roleId)
      .then(setReport)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load compliance"));
  }, [roleId]);
  useEffect(loadReport, [loadReport]);
  useOrgEvent(["courses", "structure"], loadReport);

  if (nodes && governed.length === 0) {
    return (
      <div className="empty-card glass">
        <h2>Managers only</h2>
        <p className="auth-sub">
          Compliance reports are available for branches you own. Your learning lives in My
          Learning.
        </p>
      </div>
    );
  }

  const totals = report
    ? report.courses.reduce(
        (acc, c) => ({
          compliant: acc.compliant + c.compliant,
          total: acc.total + c.total,
          overdue: acc.overdue + c.pending.filter((p) => p.overdue).length,
        }),
        { compliant: 0, total: 0, overdue: 0 },
      )
    : null;

  return (
    <div className="panel-grid stagger">
      <div className="panel glass panel-wide">
        <h2>Compliance</h2>
        <p className="auth-sub">
          Per-course compliance for a branch you govern — and one button to remind
          everyone who still has work to do.
        </p>

        <label className="field" style={{ maxWidth: "24rem" }}>
          <span>Branch</span>
          <select value={roleId ?? ""} onChange={(e) => setRoleId(e.target.value)}>
            {governed.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} (#{n.roleNumber})
              </option>
            ))}
          </select>
        </label>

        {error && <p className="form-error">{error}</p>}
        {!report && !error && <div className="skeleton" style={{ minHeight: "6rem" }} />}

        {report && totals && (
          <>
            <div className="stat-row" style={{ marginTop: "1rem" }}>
              <div className="stat-card glass">
                <span className="stat-n">{report.peopleCount}</span>
                <span className="stat-l">people in this branch</span>
              </div>
              <div className="stat-card glass">
                <span className="stat-n">
                  {totals.total === 0
                    ? "—"
                    : `${Math.round((totals.compliant / totals.total) * 100)}%`}
                </span>
                <span className="stat-l">overall compliance</span>
              </div>
              <div className="stat-card glass">
                <span
                  className="stat-n"
                  style={{ color: totals.overdue > 0 ? "var(--danger)" : undefined }}
                >
                  {totals.overdue}
                </span>
                <span className="stat-l">overdue items</span>
              </div>
            </div>

            {report.courses.length === 0 && (
              <p className="auth-sub">No courses reach this branch yet.</p>
            )}
            <div className="compliance-list">
              {report.courses.map((c) => (
                <CourseBlock key={c.code} course={c} roleId={report.roleId} onSent={loadReport} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
