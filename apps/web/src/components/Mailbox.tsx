"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  expiresInLabel,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META,
  notificationMeta,
  PRIORITY_RANK,
  type MailMessage,
  type NotificationCategory,
} from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { mailbox } from "@/lib/courses-client";
import { useMail } from "./mail-events";
import { IconBell } from "./icons";

// The mailbox: the platform's single message surface, opened from the bell on every page.
// It is a real mail client — a folder rail (categories + organization labels), a message
// list with multi-select, and a reading pane — with two things ordinary mail doesn't have:
// messages from the Knowledge Base team are flagged high priority and pinned to the top,
// and every message shows how long it has left before it deletes itself.

type Folder = { kind: "all" } | { kind: "unread" } | { kind: "flagged" } | { kind: "category"; id: NotificationCategory } | { kind: "org"; id: string };

const folderKey = (f: Folder) => (f.kind === "category" || f.kind === "org" ? `${f.kind}:${f.id}` : f.kind);

/** Relative time for the list column ("just now", "3h", "2d", or a date). */
function whenLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  if (ms < 7 * 86400_000) return `${Math.floor(ms / 86400_000)}d`;
  return new Date(iso).toISOString().slice(5, 10);
}

function matches(m: MailMessage, folder: Folder, query: string): boolean {
  if (folder.kind === "unread" && m.readAt) return false;
  if (folder.kind === "flagged" && m.priority !== "HIGH") return false;
  if (folder.kind === "category" && m.category !== folder.id) return false;
  if (folder.kind === "org" && m.orgId !== folder.id) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    m.subject.toLowerCase().includes(q) ||
    m.body.toLowerCase().includes(q) ||
    (m.sublabel ?? "").toLowerCase().includes(q) ||
    (m.orgName ?? "").toLowerCase().includes(q)
  );
}

export function Mailbox() {
  const router = useRouter();
  const { view, reload, soundOn, setSoundOn } = useMail();
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState<Folder>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Escape closes the reading pane first, then the mailbox — the usual mail-client feel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (reading) setReading(null);
      else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, reading]);

  const messages = view?.messages ?? [];

  // Sorted once per data change: high priority first, then newest. Filtering is a single
  // pass over an already-sorted array, so switching folders never re-sorts.
  const sorted = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [messages],
  );
  const shown = useMemo(
    () => sorted.filter((m) => matches(m, folder, query.trim())),
    [sorted, folder, query],
  );
  const readingMessage = reading ? messages.find((m) => m.id === reading) ?? null : null;

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* a failed housekeeping call is not worth an alert — the reload re-syncs */
      }
      setSelected(new Set());
      reload();
    },
    [reload],
  );

  const openMessage = useCallback(
    async (m: MailMessage) => {
      setReading(m.id);
      if (!m.readAt) await act(() => mailbox.mark([m.id], true));
    },
    [act],
  );

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!mounted || !hasSession()) return null;

  const unread = view?.unread ?? 0;
  const highUnread = messages.some((m) => !m.readAt && m.priority === "HIGH");

  const folderRow = (f: Folder, label: string, icon: string, count: number, title?: string) => (
    <button
      key={folderKey(f)}
      type="button"
      className="mail-folder"
      data-active={folderKey(folder) === folderKey(f)}
      title={title}
      onClick={() => {
        setFolder(f);
        setReading(null);
      }}
    >
      <span className="mail-folder-icon" aria-hidden>
        {icon}
      </span>
      <span className="mail-folder-label">{label}</span>
      {count > 0 && <span className="mail-folder-count">{count}</span>}
    </button>
  );

  return (
    <div className="mail-wrap" ref={wrapRef}>
      <button
        className="icon-btn mail-bell"
        aria-label={unread ? `Mailbox — ${unread} unread` : "Mailbox"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell />
        {unread > 0 && (
          <span className="mail-badge" data-high={highUnread}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="mail-scrim" onClick={() => setOpen(false)} aria-hidden />
          <section className="mail-panel glass-strong" role="dialog" aria-label="Mailbox">
            <header className="mail-head">
              <div className="mail-head-title">
                <strong>Mailbox</strong>
                <span className="auth-sub">
                  {unread} unread · {view?.total ?? 0} stored
                </span>
              </div>
              <div className="mail-head-tools">
                <input
                  className="mail-search"
                  type="search"
                  placeholder="Search mail"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search mail"
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-pressed={soundOn}
                  title={soundOn ? "Chime is on for new mail" : "Chime is off"}
                  onClick={() => setSoundOn(!soundOn)}
                >
                  {soundOn ? "🔔" : "🔕"}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Close"
                  aria-label="Close mailbox"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>
            </header>

            <div className="mail-body">
              <nav className="mail-rail" aria-label="Mail folders">
                {folderRow({ kind: "all" }, "All mail", "📥", 0)}
                {folderRow({ kind: "unread" }, "Unread", "●", unread)}
                {folderRow({ kind: "flagged" }, "High priority", "🚩", messages.filter((m) => m.priority === "HIGH" && !m.readAt).length, "Anything from the Knowledge Base team, plus urgent learning notices")}

                <p className="mail-rail-head">Categories</p>
                {NOTIFICATION_CATEGORIES.map((c) =>
                  folderRow(
                    { kind: "category", id: c },
                    NOTIFICATION_CATEGORY_META[c].label,
                    NOTIFICATION_CATEGORY_META[c].icon,
                    view?.unreadByCategory?.[c] ?? 0,
                    NOTIFICATION_CATEGORY_META[c].blurb,
                  ),
                )}

                {(view?.orgs.length ?? 0) > 0 && (
                  <>
                    <p className="mail-rail-head">Organizations</p>
                    {view?.orgs.map((o) => folderRow({ kind: "org", id: o.id }, o.name, "🏛", o.unread))}
                  </>
                )}

                <p className="mail-rail-note">
                  Mail deletes itself automatically — the Knowledge Base team&apos;s messages
                  after {view?.retentionDays?.ADMIN ?? 30} days, everything else sooner. The
                  countdown on each message tells you exactly when.
                </p>
              </nav>

              <div className="mail-list-col">
                <div className="mail-actions">
                  <label className="mail-select-all">
                    <input
                      type="checkbox"
                      checked={shown.length > 0 && selected.size === shown.length}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(shown.map((m) => m.id)) : new Set())
                      }
                      aria-label="Select all shown"
                    />
                    <span>{selected.size > 0 ? `${selected.size} selected` : "Select"}</span>
                  </label>
                  {selected.size > 0 ? (
                    <>
                      <button className="btn btn-quiet btn-small" onClick={() => act(() => mailbox.mark([...selected], true))}>
                        Mark read
                      </button>
                      <button className="btn btn-quiet btn-small" onClick={() => act(() => mailbox.mark([...selected], false))}>
                        Mark unread
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => act(() => mailbox.removeMany([...selected]))}>
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() =>
                          act(() =>
                            mailbox.markRead(
                              folder.kind === "category"
                                ? { category: folder.id }
                                : folder.kind === "org"
                                  ? { orgId: folder.id }
                                  : {},
                            ),
                          )
                        }
                      >
                        Mark all read
                      </button>
                      <button
                        className="btn btn-quiet btn-small"
                        title="Delete the mail you have already read in this folder"
                        onClick={() =>
                          act(() =>
                            mailbox.clear({
                              readOnly: true,
                              ...(folder.kind === "category" ? { category: folder.id } : {}),
                              ...(folder.kind === "org" ? { orgId: folder.id } : {}),
                            }),
                          )
                        }
                      >
                        Clear read
                      </button>
                    </>
                  )}
                </div>

                <ul className="mail-list">
                  {shown.length === 0 && (
                    <li className="mail-empty auth-sub">
                      {query ? "Nothing matches that search." : "Nothing here."}
                    </li>
                  )}
                  {shown.map((m) => (
                    <li
                      key={m.id}
                      className="mail-row"
                      data-unread={!m.readAt}
                      data-high={m.priority === "HIGH"}
                      data-active={reading === m.id}
                    >
                      <input
                        type="checkbox"
                        className="mail-row-check"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        aria-label={`Select “${m.subject}”`}
                      />
                      <button type="button" className="mail-row-main" onClick={() => openMessage(m)}>
                        <span className="mail-row-top">
                          <span className="mail-row-icon" aria-hidden>
                            {notificationMeta(m.kind).icon}
                          </span>
                          <span className="mail-row-subject">{m.subject}</span>
                          <span className="mail-row-when">{whenLabel(m.createdAt)}</span>
                        </span>
                        <span className="mail-row-tags">
                          {m.priority === "HIGH" && <span className="mail-tag mail-tag-high">High priority</span>}
                          <span className="mail-tag" data-cat={m.category}>
                            {NOTIFICATION_CATEGORY_META[m.category]?.label ?? m.category}
                          </span>
                          {m.sublabel && <span className="mail-tag mail-tag-sub">{m.sublabel}</span>}
                          {m.orgName && <span className="mail-tag mail-tag-org">{m.orgName}</span>}
                          <span className="mail-tag mail-tag-expiry" title="When this message deletes itself">
                            ⏳ {expiresInLabel(m.expiresAt)}
                          </span>
                        </span>
                        <span className="mail-row-preview">{m.preview}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn mail-row-delete"
                        aria-label="Delete message"
                        title="Delete"
                        onClick={() => act(() => mailbox.remove(m.id))}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {readingMessage && (
                <article className="mail-read" aria-label="Message">
                  <header>
                    <span className="mail-read-icon" aria-hidden>
                      {notificationMeta(readingMessage.kind).icon}
                    </span>
                    <div>
                      <h3>{readingMessage.subject}</h3>
                      <p className="auth-sub">
                        {NOTIFICATION_CATEGORY_META[readingMessage.category]?.label}
                        {readingMessage.sublabel ? ` · ${readingMessage.sublabel}` : ""}
                        {readingMessage.orgName ? ` · ${readingMessage.orgName}` : ""} ·{" "}
                        {new Date(readingMessage.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Close message"
                      onClick={() => setReading(null)}
                    >
                      ✕
                    </button>
                  </header>
                  {readingMessage.priority === "HIGH" && (
                    <p className="mail-read-flag">🚩 High priority — from the Knowledge Base team or a deadline that has passed.</p>
                  )}
                  <p className="mail-read-body">{readingMessage.body}</p>
                  {typeof readingMessage.payload.otp === "string" && (
                    <div className="mail-read-code">
                      <span className="auth-sub">Your access code</span>
                      <code>{readingMessage.payload.otp}</code>
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(String(readingMessage.payload.otp))
                            .catch(() => undefined)
                        }
                      >
                        Copy
                      </button>
                    </div>
                  )}
                  <p className="auth-sub mail-read-expiry">
                    This message deletes itself {expiresInLabel(readingMessage.expiresAt)} (
                    {new Date(readingMessage.expiresAt).toISOString().slice(0, 10)}).
                  </p>
                  <div className="mail-read-actions">
                    {readingMessage.link && (
                      <button
                        className="btn btn-primary btn-small"
                        onClick={() => {
                          setOpen(false);
                          router.push(readingMessage.link as string);
                        }}
                      >
                        Open ↗
                      </button>
                    )}
                    <button
                      className="btn btn-quiet btn-small"
                      onClick={() => act(() => mailbox.mark([readingMessage.id], false))}
                    >
                      Mark unread
                    </button>
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => {
                        setReading(null);
                        void act(() => mailbox.remove(readingMessage.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
