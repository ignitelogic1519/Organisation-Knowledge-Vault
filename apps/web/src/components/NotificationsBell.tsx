"use client";

import { useEffect, useState } from "react";
import type { AppNotification } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { notifications } from "@/lib/courses-client";

const LABELS: Record<string, string> = {
  completion_expired: "A completion expired — course re-assigned",
  course_overdue: "A mandatory course is overdue",
  escalation_overdue: "Someone you added has an overdue course",
  course_updated_redo: "A course was updated — completion reset",
};

export function NotificationsBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Session state is browser-only — render nothing until mounted so server and client
  // HTML match (hydration safety)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!hasSession()) return;
    notifications
      .list()
      .then((r) => {
        setItems(r.notifications);
        setUnread(r.unread);
      })
      .catch(() => undefined);
  }, []);

  if (!mounted || !hasSession()) return null;

  return (
    <div className="bell-wrap">
      <button
        className="theme-toggle"
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
        🔔{unread > 0 && <span className="bell-dot" aria-hidden />}
      </button>
      {open && (
        <div className="bell-panel">
          {items.length === 0 && <p className="auth-sub">Nothing yet.</p>}
          <ul className="owner-list">
            {items.slice(0, 12).map((n) => (
              <li key={n.id} className="bell-item">
                <strong>{LABELS[n.kind] ?? n.kind}</strong>
                <span className="auth-sub">
                  {"title" in n.payload ? String(n.payload.title) : String(n.payload.code ?? "")} ·{" "}
                  {n.createdAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
