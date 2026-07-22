"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppNotification } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { notifications } from "@/lib/courses-client";
import { useOrgEvent } from "./org-events";
import { IconBell } from "./icons";

const LABELS: Record<string, string> = {
  completion_expired: "A completion expired — course re-assigned",
  course_overdue: "A mandatory course is overdue",
  escalation_overdue: "Someone you added has an overdue course",
  course_updated_redo: "A course was updated — completion reset",
  request_created: "New request waiting on you",
  request_decided: "Your request was decided",
  inbox_cleanup: "Your inbox is getting full — clear old messages",
};

function detailOf(n: AppNotification): string {
  const p = n.payload;
  if (n.kind === "inbox_cleanup") return `${String(p.count ?? "10+")} messages`;
  if (typeof p.label === "string" && typeof p.roleName === "string") {
    const verdict = "approved" in p ? (p.approved ? " · approved" : " · rejected") : "";
    return `${p.label} · ${p.roleName}${verdict}`;
  }
  if ("title" in p) return String(p.title);
  return String(p.code ?? "");
}

export function NotificationsBell() {
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
            {items.slice(0, 12).map((n) => (
              <li key={n.id} className="bell-item">
                <span className="bell-item-main">
                  <strong>{LABELS[n.kind] ?? n.kind}</strong>
                  <span className="auth-sub">
                    {detailOf(n)} · {n.createdAt.slice(0, 10)}
                  </span>
                </span>
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
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
