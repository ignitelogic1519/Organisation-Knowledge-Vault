"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMPLIANCE_REASON_TEXT,
  type ComplianceCourse,
  type CompliancePersonReport,
  type ComplianceReport,
  type TreeNode,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";
import { compliance } from "@/lib/courses-client";
import { useOrg } from "@/components/org-context";
import { useOrgEvent } from "@/components/org-events";
import { useDialogs } from "@/components/dialogs";
import { UsernameField } from "@/components/UsernameField";

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
              {/* Every non-compliant person carries the REASON, in plain words. An exam
                  also shows how the candidate stands against its attempt allowance —
                  "used every attempt" is a very different problem from "hasn't started",
                  and only one of them a reminder can fix. */}
              <ul className="people-list">
                {course.pending.map((p) => (
                  <li
                    key={p.profileId}
                    className="person-card compliance-person"
                    data-blocked={p.reason === "EXAM_ATTEMPTS_EXHAUSTED"}
                  >
                    <label className="ack-row" style={{ flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.profileId)}
                        onChange={() => toggle(p.profileId)}
                      />
                      <span className="person-main">
                        <span className="person-name">{p.displayName}</span>
                        <span className="person-sub">@{p.username}</span>
                        <span className="compliance-reason">
                          {COMPLIANCE_REASON_TEXT[p.reason]}
                          {course.isExam && p.attemptsUsed !== undefined && (
                            <>
                              {" · "}
                              {p.attemptsUsed} attempt{p.attemptsUsed === 1 ? "" : "s"} used
                              {p.attemptsAllowed != null ? ` of ${p.attemptsAllowed}` : ""}
                              {p.bestPercent != null && p.attemptsUsed > 0
                                ? ` · best ${p.bestPercent}%`
                                : ""}
                            </>
                          )}
                        </span>
                      </span>
                    </label>
                    {p.reason === "EXAM_ATTEMPTS_EXHAUSTED" ? (
                      <span className="badge badge-danger">no attempts left</span>
                    ) : p.overdue ? (
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

                {/* Reset is the manager's release valve: a candidate who has spent every
                    attempt cannot sit the paper again on their own. The sittings stay on
                    record — only the allowance goes back to zero. */}
                {course.isExam && (
                  <button
                    className="btn btn-quiet btn-small"
                    disabled={selected.size === 0 || busy}
                    title="Give these candidates their attempts back so they can sit the exam again"
                    onClick={async () => {
                      const names = course.pending
                        .filter((p) => selected.has(p.profileId))
                        .map((p) => p.displayName)
                        .join(", ");
                      const ok = await dialogs.confirm({
                        title: "Reset exam attempts?",
                        message: `${names} will be able to sit “${course.title}” again from a clean allowance. Their previous sittings stay on record but stop counting.`,
                        confirmLabel: "Reset attempts",
                      });
                      if (!ok) return;
                      setBusy(true);
                      try {
                        const res = await compliance.resetExam(roleId, {
                          courseCode: course.code,
                          profileIds: [...selected],
                          note: message.trim() || undefined,
                        });
                        dialogs.toast(
                          `Attempts reset for ${res.reset} candidate${res.reset === 1 ? "" : "s"}.`,
                          "success",
                        );
                        setSelected(new Set());
                        setMessage("");
                        onSent();
                      } catch (e) {
                        dialogs.toast(
                          e instanceof ApiError ? e.message : "Could not reset attempts",
                          "danger",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    ♻ Reset attempts ({selected.size})
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Look somebody up ─────────────────────────────────────────────────────────
   The course cards answer "who is behind on this?". A manager asking after one
   person — before a review, after a complaint, when somebody is up for a move —
   was left reading every card hunting for a name. This asks the other question.

   The suggestions are the ORGANIZATION's own people, never the platform's: a
   manager looking up an employee must not be offered a stranger who happens to
   share a first name. */
function PersonLookup({ orgId, roleId, roleName }: { orgId: string; roleId: string; roleName: string }) {
  const [username, setUsername] = useState("");
  const [report, setReport] = useState<CompliancePersonReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const look = useCallback(
    async (who: string) => {
      const name = who.trim().replace(/^@/, "");
      if (!name) return;
      setBusy(true);
      setError(null);
      setReport(null);
      try {
        setReport(await compliance.person(roleId, name));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not look that person up");
      } finally {
        setBusy(false);
      }
    },
    [roleId],
  );

  // A different branch is a different question — the old answer would be misleading.
  useEffect(() => {
    setReport(null);
    setError(null);
  }, [roleId]);

  const pct = report && report.total > 0 ? Math.round((report.compliant / report.total) * 100) : null;

  return (
    <div className="person-lookup">
      <form
        className="person-lookup-form"
        onSubmit={(e) => {
          e.preventDefault();
          void look(username);
        }}
      >
        <UsernameField
          label="Look up a person"
          memberOfOrgId={orgId}
          value={username}
          onChange={setUsername}
          onPick={(u) => void look(u)}
          placeholder="Name or username…"
          hint={`Anyone in ${roleName} or below it — see every course that reaches them.`}
          emptyNote="Nobody in this organization matches that name."
        />
        <button className="btn btn-primary btn-small" disabled={busy || !username.trim()}>
          {busy ? "Looking…" : "Check compliance"}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {report && (
        <div className="person-report">
          <div className="person-report-head">
            {report.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="username-suggest-avatar" src={report.avatar} alt="" />
            ) : (
              <span className="username-suggest-avatar" aria-hidden>
                {report.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="person-report-who">
              <strong>{report.displayName}</strong>
              <span className="auth-sub">
                @{report.username}
                {report.roleNames.length > 0 && ` · ${report.roleNames.join(", ")}`}
              </span>
            </div>
            <span className={`badge ${pct === 100 ? "badge-ok" : pct === null ? "" : "badge-danger"}`}>
              {pct === null ? "no courses reach them" : `${report.compliant}/${report.total} · ${pct}%`}
            </span>
          </div>

          {report.courses.length === 0 ? (
            <p className="auth-sub">
              No course placed on this branch reaches {report.displayName} — there is nothing
              for them to be compliant with here.
            </p>
          ) : (
            <ul className="person-report-list">
              {report.courses.map((c) => (
                <li key={c.code} data-ok={c.compliant} data-overdue={c.overdue}>
                  <span className="person-report-mark" aria-hidden>
                    {c.compliant ? "✓" : c.overdue ? "!" : "○"}
                  </span>
                  <span className="person-report-main">
                    <strong>{c.title}</strong>
                    <span className="auth-sub">
                      {c.code} · {c.mandatory ? "mandatory" : "opt-in"} · via {c.viaRoleName}
                    </span>
                    <span className="compliance-reason">
                      {c.compliant
                        ? "Compliant"
                        : COMPLIANCE_REASON_TEXT[c.reason ?? "NOT_STARTED"]}
                      {c.isExam && c.attemptsUsed !== undefined && (
                        <>
                          {" · "}
                          {c.attemptsUsed} attempt{c.attemptsUsed === 1 ? "" : "s"} used
                          {c.attemptsAllowed != null ? ` of ${c.attemptsAllowed}` : ""}
                          {c.bestPercent != null && c.attemptsUsed > 0
                            ? ` · best ${c.bestPercent}%`
                            : ""}
                        </>
                      )}
                    </span>
                  </span>
                  {!c.compliant && c.overdue && <span className="badge badge-danger">overdue</span>}
                </li>
              ))}
            </ul>
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

        {roleId && (
          <PersonLookup
            orgId={org.id}
            roleId={roleId}
            roleName={governed.find((n) => n.id === roleId)?.name ?? "this branch"}
          />
        )}

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
