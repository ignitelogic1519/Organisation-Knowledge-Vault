"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppNotification } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { notifications } from "@/lib/courses-client";
import { useOrgEvent } from "./org-events";
import { IconBell } from "./icons";

// The bell: informative, categorized, and clickable — each message says what happened,
// carries a category chip, and clicking it jumps to the exact place it's about (the
// specific request, or the learning list).

interface KindMeta {
  label: string;
  category: "Requests" | "Learning" | "Inbox";
  /** Deep link — requests jump to the exact request card. */
  link: (n: AppNotification) => string | null;
}

const requestLink = (n: AppNotification) =>
  n.orgId
    ? `/orgs/${n.orgId}/requests${typeof n.payload.requestId === "string" ? `?focus=${n.payload.requestId}` : ""}`
    : null;
const learningLink = (n: AppNotification) => (n.orgId ? `/orgs/${n.orgId}/learning` : null);

const KINDS: Record<string, KindMeta> = {
  request_created: { label: "New request waiting on you", category: "Requests", link: requestLink },
  request_decided: { label: "Your request was decided", category: "Requests", link: requestLink },
  completion_expired: { label: "A completion expired — course re-assigned", category: "Learning", link: learningLink },
  course_overdue: { label: "A mandatory course is overdue", category: "Learning", link: learningLink },
  escalation_overdue: { label: "Someone you added has an overdue course", category: "Learning", link: learningLink },
  course_updated_redo: { label: "A course was updated — completion reset", category: "Learning", link: learningLink },
  compliance_reminder: { label: "Reminder from your manager", category: "Learning", link: learningLink },
  course_adopted: { label: "Your course was adopted — thank you!", category: "Learning", link: learningLink },
  inbox_cleanup: { label: "Your inbox is getting full — clear old messages", category: "Inbox", link: () => null },
};

function detailOf(n: AppNotification): string {
  const p = n.payload;
  if (n.kind === "inbox_cleanup") return `${String(p.count ?? "10+")} messages`;
  if (n.kind === "compliance_reminder" || n.kind === "course_adopted") {
    return `${String(p.from ?? "A manager")} · "${String(p.title ?? p.code ?? "")}"${p.roleName ? ` @ ${String(p.roleName)}` : ""}: ${String(p.message ?? "")}`;
  }
  if (typeof p.label === "string" && typeof p.roleName === "string") {
    const verdict = "approved" in p ? (p.approved ? " — approved ✓" : " — rejected ✕") : "";
    return `${p.label} for "${p.roleName}"${verdict}`;
  }
  if ("title" in p) return String(p.title);
  return String(p.code ?? "");
}

export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Session state is browser-only — render nothing until mounted so server and client
  // HTML match (hydration safety)
  const [mounted, setMounted] = useState(false);

  const load = useCallback(() => {
    if (!hasSession()) return;
    notifications
      .list()
      .then((r) => {
        setItems(r.notifications);
        setUnread(r.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load]);

  // Live: the bell updates the moment a notification lands (no-op outside org pages)
  useOrgEvent(["notifications"], load);

  if (!mounted || !hasSession()) return null;

  return (
    <div className="bell-wrap">
      <button
        className="icon-btn"
        aria-label="Notifications"
        onClick={async () => {
          const next = !open;
          setOpen(next);
          if (next && unread > 0) {
            await notifications.markAllRead().catch(() => undefined);
            setUnread(0);
          }
        }}
      >
        <IconBell />
        {unread > 0 && <span className="bell-dot" aria-hidden />}
      </button>
      {open && (
        <div className="bell-panel glass">
          <div className="bell-head">
            <span className="auth-sub">Messages auto-clear after 7 days</span>
            {items.length > 0 && (
              <button
                className="btn btn-quiet btn-small"
                onClick={async () => {
                  await notifications.clearAll().catch(() => undefined);
                  load();
                }}
              >
                Clear all
              </button>
            )}
          </div>
          {items.length === 0 && <p className="auth-sub">Nothing yet.</p>}
          <ul className="owner-list">
            {items.slice(0, 12).map((n) => {
              const meta = KINDS[n.kind];
              const href = meta?.link(n) ?? null;
              return (
                <li key={n.id} className="bell-item" data-unread={!n.readAt}>
                  <button
                    className="bell-item-main"
                    data-clickable={!!href}
                    title={href ? "Open" : undefined}
                    onClick={() => {
                      if (!href) return;
                      setOpen(false);
                      router.push(href);
                    }}
                  >
                    <span className="bell-item-top">
                      <span className="chip bell-cat" data-cat={meta?.category ?? "Inbox"}>
                        {meta?.category ?? "Other"}
                      </span>
                      <strong>{meta?.label ?? n.kind}</strong>
                    </span>
                    <span className="auth-sub">
                      {detailOf(n)} · {n.createdAt.slice(0, 10)}
                      {href && " · click to open ↗"}
                    </span>
                  </button>
                  <button
                    className="icon-btn bell-dismiss"
                    aria-label="Dismiss"
                    title="Dismiss"
                    onClick={async () => {
                      await notifications.remove(n.id).catch(() => undefined);
                      load();
                    }}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
