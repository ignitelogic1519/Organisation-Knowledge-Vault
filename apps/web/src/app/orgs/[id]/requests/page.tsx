"use client";

import { useCallback, useEffect, useState } from "react";
import {
  REQUEST_KIND_LABELS,
  type RequestView,
  type RequestsOverview,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { requests } from "@/lib/orgs-client";
import { useOrg } from "@/components/org-context";
import { useDialogs } from "@/components/dialogs";

// Requests — the ask-and-approve center. Two views:
//  · Inbox: pending requests the signed-in user has the authority to decide. Course
//    requests are configured (mandatory / inheritance / deadline / recurrence) before
//    approval; join and deletion requests are approved or rejected directly.
//  · My requests: everything this user asked for, with live status.

function KindChip({ kind }: { kind: RequestView["kind"] }) {
  return (
    <span className="chip" data-kind={kind}>
      {REQUEST_KIND_LABELS[kind]}
    </span>
  );
}

function StatusBadge({ status }: { status: RequestView["status"] }) {
  const cls =
    status === "APPROVED" ? "badge badge-ok" : status === "REJECTED" ? "badge badge-danger" : "badge";
  return <span className={cls}>{status.toLowerCase()}</span>;
}

function InboxCard({
  r,
  onDone,
}: {
  r: RequestView;
  onDone: () => void;
}) {
  const dialogs = useDialogs();
  const [configOpen, setConfigOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const decide = async (
    approve: boolean,
    config?: {
      mandatory: boolean;
      inheritToDescendants: boolean;
      deadlineDays?: number | null;
      retakeEveryNDays?: number | null;
    },
    note?: string,
  ) => {
    setBusy(true);
    try {
      await requests.decide(r.id, { approve, config, decisionNote: note });
      dialogs.toast(
        approve ? "Request approved and applied." : "Request rejected.",
        approve ? "success" : "info",
      );
      onDone();
    } catch (e) {
      dialogs.toast(e instanceof ApiError ? e.message : "Decision failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="request-card glass">
      <div className="request-head">
        <KindChip kind={r.kind} />
        <span className="auth-sub">{r.createdAt.slice(0, 10)}</span>
      </div>
      <p className="request-line">
        <strong>{r.requester.displayName}</strong>{" "}
        <span className="auth-sub">@{r.requester.username}</span>{" "}
        {r.kind === "JOIN_BRANCH" && (
          <>
            asks to join <strong>{r.targetRoleName}</strong> as{" "}
            <strong>{r.joinAs === "OWNER" ? "sub-owner" : "member"}</strong>
          </>
        )}
        {r.kind === "DELETE_BRANCH" && (
          <>
            asks to delete the branch <strong>{r.targetRoleName}</strong>
          </>
        )}
        {r.kind === "VISIBILITY" && (
          <>
            asks to unhide the chain above <strong>{r.targetRoleName}</strong> so it becomes
            publicly visible
          </>
        )}
        {r.kind === "COURSE_ASSIGN" && (
          <>
            asks for <strong>{r.courseTitle ?? r.courseCode}</strong>{" "}
            {r.courseCode && <span className="chip">{r.courseCode}</span>} on{" "}
            <strong>{r.targetRoleName}</strong>
          </>
        )}
      </p>
      {r.message && <p className="request-msg">“{r.message}”</p>}

      {r.kind === "COURSE_ASSIGN" && configOpen ? (
        <form
          className="request-config"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            decide(true, {
              mandatory: d.get("mandatory") === "on",
              inheritToDescendants: d.get("inherit") === "on",
              deadlineDays: d.get("deadline") ? Number(d.get("deadline")) : null,
              retakeEveryNDays: d.get("retake") ? Number(d.get("retake")) : null,
            });
          }}
        >
          <p className="auth-sub">
            Tune the course for <strong>{r.targetRoleName}</strong> before it lands:
          </p>
          <div className="request-config-grid">
            <label className="ack-row">
              <input type="checkbox" name="mandatory" defaultChecked />
              <span>Mandatory</span>
            </label>
            <label className="ack-row">
              <input type="checkbox" name="inherit" />
              <span>Inherit to sub-branches</span>
            </label>
            <label className="field">
              <span>Deadline (days)</span>
              <input name="deadline" type="number" min={1} placeholder="course default" />
            </label>
            <label className="field">
              <span>Retake every N days</span>
              <input name="retake" type="number" min={1} placeholder="course default" />
            </label>
          </div>
          <div className="request-actions">
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => setConfigOpen(false)}
            >
              Back
            </button>
            <button className="btn btn-primary btn-small" disabled={busy}>
              Approve &amp; assign
            </button>
          </div>
        </form>
      ) : (
        <div className="request-actions">
          <button
            className="btn btn-danger btn-small"
            disabled={busy}
            onClick={async () => {
              if (
                await dialogs.confirm({
                  title: "Reject request",
                  message: `Reject this ${REQUEST_KIND_LABELS[r.kind].toLowerCase()} from ${r.requester.displayName}?`,
                  confirmLabel: "Reject",
                  danger: true,
                })
              )
                decide(false);
            }}
          >
            Reject
          </button>
          {r.kind === "COURSE_ASSIGN" ? (
            <button
              className="btn btn-primary btn-small"
              disabled={busy}
              onClick={() => setConfigOpen(true)}
            >
              Review &amp; configure
            </button>
          ) : (
            <button
              className="btn btn-primary btn-small"
              disabled={busy}
              onClick={async () => {
                if (
                  await dialogs.confirm({
                    title: `Approve ${REQUEST_KIND_LABELS[r.kind].toLowerCase()}`,
                    message:
                      r.kind === "DELETE_BRANCH"
                        ? `Approving deletes the branch "${r.targetRoleName}" (it must be empty).`
                        : r.kind === "VISIBILITY"
                          ? `Approving unhides every hidden level above "${r.targetRoleName}" and makes the branch publicly visible.`
                          : `Approving adds ${r.requester.displayName} as a ${r.joinAs === "OWNER" ? "sub-owner (no delegation rights until granted)" : "member"} of "${r.targetRoleName}".`,
                    confirmLabel: "Approve",
                    danger: r.kind === "DELETE_BRANCH",
                  })
                )
                  decide(true);
              }}
            >
              Approve
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export default function RequestsPage() {
  const { org } = useOrg();
  const dialogs = useDialogs();
  const [data, setData] = useState<RequestsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    requests
      .overview(org.id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load requests"));
  }, [org.id]);

  useEffect(load, [load]);

  return (
    <div className="panel-grid stagger">
      <div className="panel glass panel-wide">
        <h2>Inbox — waiting on you</h2>
        <p className="auth-sub">
          Requests you have the authority to decide. Course requests are configured for the
          branch before approval; deletions execute on approval.
        </p>
        {error && <p className="form-error">{error}</p>}
        {!data && !error && <div className="skeleton" style={{ minHeight: "5rem" }} />}
        {data?.inbox.length === 0 && (
          <p className="auth-sub">Nothing waiting on you right now.</p>
        )}
        <ul className="request-list">
          {data?.inbox.map((r) => <InboxCard key={r.id} r={r} onDone={load} />)}
        </ul>
      </div>

      <div className="panel glass panel-wide">
        <h2>My requests</h2>
        <p className="auth-sub">Everything you asked for, and where it stands.</p>
        {data?.mine.length === 0 && (
          <p className="auth-sub">
            You haven&apos;t made any requests yet — find courses in the Library, or public
            branches on the Constellation.
          </p>
        )}
        <ul className="request-list">
          {data?.mine.map((r) => (
            <li key={r.id} className="request-card glass">
              <div className="request-head">
                <KindChip kind={r.kind} />
                <StatusBadge status={r.status} />
              </div>
              <p className="request-line">
                {r.kind === "JOIN_BRANCH" && (
                  <>
                    Join <strong>{r.targetRoleName}</strong> as{" "}
                    {r.joinAs === "OWNER" ? "sub-owner" : "member"}
                  </>
                )}
                {r.kind === "DELETE_BRANCH" && (
                  <>
                    Delete the branch <strong>{r.targetRoleName}</strong>
                  </>
                )}
                {r.kind === "VISIBILITY" && (
                  <>
                    Make <strong>{r.targetRoleName}</strong> publicly visible
                  </>
                )}
                {r.kind === "COURSE_ASSIGN" && (
                  <>
                    <strong>{r.courseTitle ?? r.courseCode}</strong> for{" "}
                    <strong>{r.targetRoleName}</strong>
                  </>
                )}{" "}
                <span className="auth-sub">· {r.createdAt.slice(0, 10)}</span>
              </p>
              {r.decisionNote && <p className="request-msg">Decision note: “{r.decisionNote}”</p>}
              {r.status === "PENDING" && (
                <div className="request-actions">
                  <button
                    className="btn btn-quiet btn-small"
                    onClick={async () => {
                      if (
                        await dialogs.confirm({
                          title: "Withdraw request",
                          message: "Withdraw this pending request?",
                          confirmLabel: "Withdraw",
                        })
                      ) {
                        try {
                          await requests.withdraw(r.id);
                          load();
                        } catch (e) {
                          dialogs.toast(
                            e instanceof ApiError ? e.message : "Could not withdraw",
                            "danger",
                          );
                        }
                      }
                    }}
                  >
                    Withdraw
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
