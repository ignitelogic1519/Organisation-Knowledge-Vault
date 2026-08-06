"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_TEXT,
  REVIEW_OUTCOME_TEXT,
  type RequestView,
  type RequestsOverview,
  type ReviewOutcome,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { requests } from "@/lib/orgs-client";
import { openInWindow } from "@/lib/reader-window";
import { useOrg } from "@/components/org-context";
import { useOrgEvent } from "@/components/org-events";
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
    status === "APPROVED"
      ? "badge badge-ok"
      : status === "REJECTED"
        ? "badge badge-danger"
        : status === "CHANGES_REQUESTED"
          ? "badge badge-warn"
          : "badge";
  const text = REQUEST_STATUS_TEXT[status];
  return (
    <span
      className={cls}
      data-hint={
        text.waitingOn === "author"
          ? "Your reviewer read it and asked for changes. Your draft is untouched — revise it and send it back from the conversation below."
          : text.waitingOn === "reviewer"
            ? "Waiting on the person who decides it."
            : "Decided — nothing further is needed."
      }
      data-hint-title={text.label}
    >
      {text.label}
    </span>
  );
}

/**
 * The conversation on a Document review — the channel that was missing.
 *
 * A reviewer used to have two buttons: publish, or reject, which DELETED the author's
 * draft outright. There was nowhere to say "the scope section is wrong" and no way for the
 * author to answer. This is that channel, and it is shown to both sides of the review.
 */
function ReviewThread({
  r,
  onDone,
}: {
  r: RequestView;
  onDone: () => void;
}) {
  const dialogs = useDialogs();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [r.messages.length]);

  const post = async (kind: "REPLY" | "RESUBMIT") => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await requests.message(r.id, { body: body.trim(), kind });
      setBody("");
      dialogs.toast(
        kind === "RESUBMIT" ? "Sent back to your reviewer." : "Message sent.",
        "success",
      );
      onDone();
    } catch (e) {
      dialogs.toast(e instanceof ApiError ? e.message : "Could not send", "danger");
    } finally {
      setBusy(false);
    }
  };

  /** The signed-in user is the AUTHOR of a review that has come back to them. */
  const isAuthorSide = r.awaitingAuthor && r.isMyTurn;

  return (
    <div className="revthread">
      <div className="revthread-head">
        <h4>Review conversation</h4>
        {r.revisionRound > 0 && (
          <span
            className="badge"
            data-hint={`This document has been sent back for changes ${r.revisionRound} ${r.revisionRound === 1 ? "time" : "times"}.`}
            data-hint-title="Revision rounds"
          >
            round {r.revisionRound + 1}
          </span>
        )}
      </div>

      {r.messages.length === 0 && (
        <p className="auth-sub">
          Nothing said yet. Write here to ask a question or explain a change before deciding.
        </p>
      )}
      <ul className="revthread-list">
        {r.messages.map((m) => (
          <li key={m.id} data-mine={m.mine} data-kind={m.kind}>
            <div className="revthread-bubble">
              {m.kind === "SUGGESTION" && (
                <span className="revthread-tag">changes requested</span>
              )}
              {m.kind === "RESUBMIT" && <span className="revthread-tag">resubmitted</span>}
              <p>{m.body}</p>
              <span className="revthread-meta">
                {m.mine ? "You" : m.author.displayName} · {m.createdAt.slice(0, 10)}
              </span>
            </div>
          </li>
        ))}
        <div ref={endRef} />
      </ul>

      {r.canMessage && (
        <div className="revthread-compose">
          <textarea
            rows={2}
            maxLength={2000}
            value={body}
            placeholder={
              isAuthorSide
                ? "Say what you changed, then send it back…"
                : "Write to the author…"
            }
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="revthread-compose-actions">
            <button
              className="btn btn-quiet btn-small"
              disabled={busy || !body.trim()}
              data-hint="Adds a message to this review without changing whose turn it is."
              data-hint-title="Send a message"
              onClick={() => post("REPLY")}
            >
              Send message
            </button>
            {r.awaitingAuthor && (
              <button
                className="btn btn-primary btn-small"
                disabled={busy || !body.trim()}
                data-hint="Puts the document back in your reviewer's inbox with this note. Revise it in the Studio first if you have not already."
                data-hint-title="Send back for review"
                onClick={() => post("RESUBMIT")}
              >
                ↩ Send back for review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InboxCard({
  r,
  onDone,
  onRemove,
  onPreview,
  focused,
}: {
  r: RequestView;
  onDone: () => void;
  onRemove: () => void;
  onPreview: (code: string) => void;
  focused: boolean;
}) {
  const dialogs = useDialogs();
  const [panel, setPanel] = useState<null | "approve" | "changes">(null);
  const [busy, setBusy] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const needsConfig = r.kind === "COURSE_ASSIGN" || r.kind === "CONTENT_REVIEW";
  const isReview = r.kind === "CONTENT_REVIEW";

  const decide = async (
    approve: boolean,
    config?: {
      mandatory: boolean;
      inheritToDescendants: boolean;
      deadlineDays?: number | null;
      retakeEveryNDays?: number | null;
      inLibrary?: boolean;
    },
    note?: string,
    outcome?: ReviewOutcome,
  ) => {
    setBusy(true);
    try {
      await requests.decide(r.id, { approve, config, decisionNote: note, outcome });
      dialogs.toast(
        outcome === "CHANGES"
          ? "Sent back to the author with your notes."
          : approve
            ? "Request approved and applied."
            : "Request declined.",
        approve || outcome === "CHANGES" ? "success" : "info",
      );
      onDone();
    } catch (e) {
      dialogs.toast(e instanceof ApiError ? e.message : "Decision failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="request-card glass" id={`request-${r.id}`} data-focus={focused} data-waiting={r.awaitingAuthor}>
      <div className="request-head">
        <KindChip kind={r.kind} />
        {r.awaitingAuthor && (
          <span
            className="badge"
            data-hint="You sent this back for changes. It is with its author until they revise it and send it back — it is not waiting on you."
            data-hint-title="With the author"
          >
            with the author
          </span>
        )}
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
        {isReview && (
          <>
            submitted the document <strong>{r.courseTitle ?? r.courseCode}</strong>{" "}
            {r.courseCode && <span className="chip">{r.courseCode}</span>} for{" "}
            <strong>{r.targetRoleName}</strong> — review before it publishes
          </>
        )}
      </p>
      {r.message && !isReview && <p className="request-msg">“{r.message}”</p>}

      {isReview && showThread && <ReviewThread r={r} onDone={onDone} />}

      {panel === "approve" ? (
        <form
          className="request-config"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            decide(
              true,
              {
                mandatory: d.get("mandatory") === "on",
                inheritToDescendants: d.get("inherit") === "on",
                deadlineDays: d.get("deadline") ? Number(d.get("deadline")) : null,
                retakeEveryNDays: d.get("retake") ? Number(d.get("retake")) : null,
                inLibrary: d.get("inLibrary") === "on",
              },
              String(d.get("note") || "") || undefined,
              isReview ? "APPROVE" : undefined,
            );
          }}
        >
          <p className="auth-sub">
            {isReview ? "Configure and publish this document for " : "Tune the course for "}
            <strong>{r.targetRoleName}</strong>:
          </p>
          <div className="request-config-grid">
            <label className="ack-row">
              <input type="checkbox" name="mandatory" defaultChecked />
              <span
                data-hint="Everyone this branch reaches gets it on their compliance list and is chased until they finish it."
                data-hint-title="Mandatory"
              >
                Mandatory
              </span>
            </label>
            <label className="ack-row">
              <input type="checkbox" name="inherit" />
              <span
                data-hint="Every branch beneath this one receives it too."
                data-hint-title="Inherit to sub-branches"
              >
                Inherit to sub-branches
              </span>
            </label>
            {isReview && (
              <label className="ack-row">
                <input type="checkbox" name="inLibrary" defaultChecked />
                <span
                  data-hint="Other branches can find it in the library and ask for it too."
                  data-hint-title="Publish to library"
                >
                  Publish to library
                </span>
              </label>
            )}
            <label className="field">
              <span>Deadline (days)</span>
              <input name="deadline" type="number" min={1} placeholder="course default" />
            </label>
            <label className="field">
              <span>Retake every N days</span>
              <input name="retake" type="number" min={1} placeholder="course default" />
            </label>
          </div>
          <label className="field">
            <span>A note for the author (optional)</span>
            <textarea name="note" rows={2} maxLength={500} placeholder="Nicely done — published as is." />
          </label>
          <div className="request-actions">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setPanel(null)}>
              Back
            </button>
            <button className="btn btn-primary btn-small" disabled={busy}>
              {isReview ? "Approve & publish" : "Approve & assign"}
            </button>
          </div>
        </form>
      ) : panel === "changes" ? (
        <form
          className="request-config"
          onSubmit={(e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") || "").trim();
            if (!note) return;
            decide(false, undefined, note, "CHANGES");
          }}
        >
          <p className="auth-sub">
            The author keeps their draft. Say what needs changing — they revise it and send it
            back to you.
          </p>
          <label className="field">
            <span>What needs changing</span>
            <textarea
              name="note"
              rows={4}
              required
              maxLength={500}
              autoFocus
              placeholder="The scope section still says “all staff” — this only applies to the field teams. Everything else reads well."
            />
          </label>
          <div className="request-actions">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setPanel(null)}>
              Back
            </button>
            <button className="btn btn-primary btn-small" disabled={busy}>
              ↩ Send back with these notes
            </button>
          </div>
        </form>
      ) : (
        <div className="request-actions">
          {isReview && r.courseCode && (
            <button
              className="btn btn-quiet btn-small"
              disabled={busy}
              data-hint="Opens in a window of its own, filling the screen — read the document exactly as its readers would, before you decide."
              data-hint-title="Preview"
              onClick={() => onPreview(r.courseCode!)}
            >
              👁 Preview document ⤢
            </button>
          )}
          {isReview && (
            <button
              className="btn btn-quiet btn-small"
              data-hint="The conversation with the author about this document."
              data-hint-title="Conversation"
              onClick={() => setShowThread((v) => !v)}
            >
              💬 {showThread ? "Hide" : "Discuss"}
              {r.messages.length > 0 && ` (${r.messages.length})`}
            </button>
          )}
          <button
            className="btn btn-quiet btn-small"
            disabled={busy}
            data-hint="Removes the request without deciding it. The author's entry disappears too."
            data-hint-title="Delete this request"
            onClick={onRemove}
          >
            Delete
          </button>
          <button
            className="btn btn-danger btn-small"
            disabled={busy}
            data-hint={
              isReview
                ? "Discards the proposal and DELETES the author's draft. Use this only when the document should not exist — if it just needs work, send it back instead."
                : undefined
            }
            data-hint-title={isReview ? "Decline" : undefined}
            data-hint-tone="danger"
            onClick={async () => {
              if (
                await dialogs.confirm({
                  title: isReview ? "Decline this document" : "Reject request",
                  message: isReview
                    ? `Declining discards “${r.courseTitle ?? r.courseCode}” and deletes ${r.requester.displayName}'s draft. If it only needs changes, use “Send back” instead — they keep their work.`
                    : `Reject this ${REQUEST_KIND_LABELS[r.kind].toLowerCase()} from ${r.requester.displayName}?`,
                  confirmLabel: isReview ? "Decline & delete" : "Reject",
                  danger: true,
                })
              )
                decide(false, undefined, undefined, isReview ? "REJECT" : undefined);
            }}
          >
            {isReview ? "Decline" : "Reject"}
          </button>
          {isReview && (
            <button
              className="btn btn-quiet btn-small"
              disabled={busy}
              data-hint={REVIEW_OUTCOME_TEXT.CHANGES.blurb}
              data-hint-title={REVIEW_OUTCOME_TEXT.CHANGES.label}
              onClick={() => setPanel("changes")}
            >
              ↩ Send back
            </button>
          )}
          {needsConfig ? (
            <button
              className="btn btn-primary btn-small"
              disabled={busy}
              onClick={() => setPanel("approve")}
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
  const router = useRouter();
  const dialogs = useDialogs();
  const [data, setData] = useState<RequestsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  // Reviewing a document is reading it, not glancing at it: it opens in a window of its
  // own, filling the screen, so nothing of this page is left behind it.
  const openPreview = useCallback(
    (code: string) => {
      if (!openInWindow(org.id, code, true)) {
        dialogs.toast(
          "Your browser blocked the reader window. Allow pop-ups for Knowledge Vault and try again.",
          "danger",
        );
      }
    },
    [org.id, dialogs],
  );

  // Deep link from a notification: /requests?focus=<id> highlights that exact request
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("focus");
    if (f) setFocusId(f);
  }, []);

  const load = useCallback(() => {
    requests
      .overview(org.id)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load requests"));
  }, [org.id]);

  useEffect(load, [load]);
  // Live: new requests and decisions appear without a refresh
  useOrgEvent(["requests"], load);

  useEffect(() => {
    if (!focusId || !data) return;
    document
      .getElementById(`request-${focusId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, data]);

  const removeRequest = async (id: string, title: string, message: string) => {
    if (
      await dialogs.confirm({
        title,
        message,
        confirmLabel: "Delete",
        danger: true,
      })
    ) {
      try {
        await requests.withdraw(id);
        load();
      } catch (e) {
        dialogs.toast(e instanceof ApiError ? e.message : "Could not delete", "danger");
      }
    }
  };

  return (
    <div className="panel-grid stagger">
      <div className="panel glass panel-wide">
        <h2>Inbox — waiting on you</h2>
        <p className="auth-sub">
          Requests you have the authority to decide. Course requests are configured for the
          branch before approval; deletions execute on approval. Decided requests clean up
          automatically after 7 days.
        </p>
        {error && <p className="form-error">{error}</p>}
        {!data && !error && <div className="skeleton" style={{ minHeight: "5rem" }} />}
        {data?.inbox.length === 0 && (
          <p className="auth-sub">Nothing waiting on you right now.</p>
        )}
        <ul className="request-list">
          {data?.inbox.map((r) => (
            <InboxCard
              key={r.id}
              r={r}
              focused={r.id === focusId}
              onDone={load}
              onPreview={openPreview}
              onRemove={() =>
                removeRequest(
                  r.id,
                  "Delete request",
                  `Delete this ${REQUEST_KIND_LABELS[r.kind].toLowerCase()} from ${r.requester.displayName} without deciding it? Their entry disappears too.`,
                )
              }
            />
          ))}
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
            <li
              key={r.id}
              className="request-card glass"
              id={`request-${r.id}`}
              data-focus={r.id === focusId}
            >
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
                )}
                {r.kind === "CONTENT_REVIEW" && (
                  <>
                    Document <strong>{r.courseTitle ?? r.courseCode}</strong> for{" "}
                    <strong>{r.targetRoleName}</strong> (review)
                  </>
                )}{" "}
                <span className="auth-sub">· {r.createdAt.slice(0, 10)}</span>
              </p>
              {r.decisionNote && r.status !== "CHANGES_REQUESTED" && (
                <p className="request-msg">Decision note: “{r.decisionNote}”</p>
              )}
              {r.kind === "CONTENT_REVIEW" && r.status === "CHANGES_REQUESTED" && (
                <p className="request-msg request-msg-warn">
                  Your reviewer asked for changes. Your draft is safe — revise it and send it
                  back below.
                </p>
              )}
              {r.kind === "CONTENT_REVIEW" &&
                (r.status === "PENDING" || r.status === "CHANGES_REQUESTED") && (
                  <ReviewThread r={r} onDone={load} />
                )}
              <div className="request-actions">
                {r.kind === "CONTENT_REVIEW" &&
                  r.status === "CHANGES_REQUESTED" &&
                  r.courseCode && (
                    <button
                      className="btn btn-quiet btn-small"
                      data-hint="Open the document in the Studio and make the changes your reviewer asked for."
                      data-hint-title="Revise it"
                      onClick={() =>
                        router.push(`/orgs/${org.id}/studio?course=${r.courseCode}`)
                      }
                    >
                      ✎ Revise in the Studio
                    </button>
                  )}
                {r.status === "PENDING" ? (
                  <button
                    className="btn btn-quiet btn-small"
                    onClick={() =>
                      removeRequest(r.id, "Withdraw request", "Withdraw this pending request?")
                    }
                  >
                    Withdraw
                  </button>
                ) : (
                  <button
                    className="btn btn-quiet btn-small"
                    title="Remove this entry from your history (auto-cleans after 7 days anyway)"
                    onClick={() =>
                      removeRequest(r.id, "Delete entry", "Remove this decided request from your history?")
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}
