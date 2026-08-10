"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  PLATFORM_REQUEST_LABELS,
  type AdminOrgDetail,
  type AdminOrgProperty,
  type AdminOrgRow,
  type AdminUserRow,
  type AdminRequestRow,
  type AdminSession,
} from "@vault/shared";
import { admin, AdminApiError, clearAdminSession, hasAdminSession } from "@/lib/admin-client";
import { OrgBadge } from "@/components/OrgLogoField";
import { Define } from "@/components/Define";
import { KBASE_GLOSSARY, defineProperty } from "@/lib/kbase-glossary";
import { IconLogout } from "@/components/icons";
import { UsernameField, type Suggestion } from "@/components/UsernameField";
import "./kbase.css";

/* ═══════════════════════════════════════════════════════════════════════════
   The Knowledge Base console.

   Three commitments shape this screen:

   1. It works in a small window. The console is used beside a support ticket,
      not full-screen, so every grid is `auto-fit`, every table collapses into
      cards under 768px, and nothing has a fixed width. Bootstrap's grid and
      utilities carry the layout; kbase.css carries the material.

   2. Nothing is a number you have to already understand. Every property is a
      `Define` — point at it and the console tells you what it is and what
      changing it does. The same sentences are collected in the Glossary tab.

   3. What can be changed, can be changed here. Limits, plans, dates, coins and
      access are edited in place, with the save pinned where you can reach it.
   ═══════════════════════════════════════════════════════════════════════════ */

type Tab = "overview" | "orgs" | "users" | "requests" | "coins" | "admins" | "glossary";

const TABS: { id: Tab; label: string; icon: React.ReactNode; blurb: string }[] = [
  { id: "overview", label: "Overview", icon: <IconGauge />, blurb: "The platform at a glance" },
  { id: "orgs", label: "Organizations", icon: <IconBuilding />, blurb: "Every organization, live" },
  { id: "users", label: "Users", icon: <IconPeople />, blurb: "Profiles, coins and access" },
  { id: "requests", label: "Requests", icon: <IconInboxTray />, blurb: "Plans waiting on a decision" },
  { id: "coins", label: "Coins", icon: <IconCoin />, blurb: "Knowledge Coins and defaults" },
  { id: "admins", label: "Administrators", icon: <IconKey />, blurb: "Who can open this portal" },
  { id: "glossary", label: "Glossary", icon: <IconBookOpen />, blurb: "What every property means" },
];

// ── Icons ───────────────────────────────────────────────────────────────────
// Stroke icons, inheriting currentColor so they follow the theme and the accent.

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconGauge() {
  return (
    <Ico>
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <path d="m12 13.5 4-4" />
      <circle cx="12" cy="14" r="1.4" />
    </Ico>
  );
}
function IconBuilding() {
  return (
    <Ico>
      <path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
      <path d="M14 10h4a2 2 0 0 1 2 2v9" />
      <path d="M7.5 8h3M7.5 12h3M7.5 16h3M17 14h.01M17 18h.01M3 21h18" />
    </Ico>
  );
}
function IconPeople() {
  return (
    <Ico>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c1-3.2 3.5-4.5 6.5-4.5s5.5 1.3 6.5 4.5" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.9M18.5 15.9c1.6.7 2.7 2 3.2 4.1" />
    </Ico>
  );
}
function IconInboxTray() {
  return (
    <Ico>
      <path d="M3.5 13.5 6 5.5h12l2.5 8" />
      <path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5.2a2.8 2.8 0 0 1-5.6 0Z" />
    </Ico>
  );
}
function IconCoin() {
  return (
    <Ico>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.5 9.5c-.6-.7-1.5-1-2.5-1-1.4 0-2.5.7-2.5 1.8s1 1.5 2.5 1.7 2.5.6 2.5 1.7-1.1 1.8-2.5 1.8c-1 0-1.9-.3-2.5-1" />
    </Ico>
  );
}
function IconKey() {
  return (
    <Ico>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21M18 12v3M15 12v2.2" />
    </Ico>
  );
}
function IconBookOpen() {
  return (
    <Ico>
      <path d="M12 6.5C10.5 5 8.5 4.5 4 4.5V18c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2V4.5c-4.5 0-6.5.5-8 2Z" />
      <path d="M12 6.5V20" />
    </Ico>
  );
}
function IconMenu({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** Human byte sizes — "0 MB" for a 200 KB file is not a useful answer. */
function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

const fmtLimit = (used: number, limit: number | null) =>
  limit == null ? `${used} / ∞` : `${used} / ${limit}`;

/** How full a metered allowance is, or null when the plan does not meter it. */
function ratio(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(1, used / limit);
}

function meterTone(r: number | null): "ok" | "warn" | "danger" {
  if (r == null) return "ok";
  return r >= 0.95 ? "danger" : r >= 0.8 ? "warn" : "ok";
}

function planTone(status: string): string {
  return status === "ACTIVE" ? "badge-ok" : status === "EXPIRED" ? "badge-danger" : "";
}

/** Days until a plan lapses — negative once it has. `null` when there is no expiry. */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000);
}

// ── Shell ───────────────────────────────────────────────────────────────────

export default function AdminConsole() {
  const router = useRouter();
  const [me, setMe] = useState<AdminSession["admin"] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [toast, setToast] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  // Verbose is the default: an administration console that assumes prior knowledge
  // is a console only its author can use. Compact is there for the second week.
  const [verbose, setVerbose] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!hasAdminSession()) {
      router.replace("/kbase/login");
      return;
    }
    admin
      .me()
      .then((r) => setMe(r.admin))
      .catch(() => router.replace("/kbase/login"));
  }, [router]);

  // The pending-request count lives in the shell so the rail can badge it from any tab.
  useEffect(() => {
    if (!me) return;
    const read = () =>
      admin
        .requests()
        .then((r) => setPending(r.requests.filter((x) => x.status === "PENDING").length))
        .catch(() => undefined);
    read();
    const t = setInterval(read, 15_000);
    return () => clearInterval(t);
  }, [me]);

  // Restore the last tab and the verbosity preference, so a refresh lands where you were.
  useEffect(() => {
    try {
      const t = localStorage.getItem("kv.kbase.tab") as Tab | null;
      if (t && TABS.some((x) => x.id === t)) setTab(t);
      setVerbose(localStorage.getItem("kv.kbase.verbose") !== "false");
    } catch {
      /* private mode — defaults are fine */
    }
  }, []);

  const go = (next: Tab) => {
    setTab(next);
    setRailOpen(false);
    try {
      localStorage.setItem("kv.kbase.tab", next);
    } catch {
      /* ignore */
    }
  };

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  }, []);

  if (!me) {
    return (
      <main className="kv-auth-wrap" style={{ minHeight: "100svh" }}>
        <p className="auth-sub">Opening the portal…</p>
      </main>
    );
  }
  if (me.mustChangePassword) {
    return <ChangePassword onDone={() => setMe({ ...me, mustChangePassword: false })} />;
  }

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="kb" data-verbose={verbose}>
      {railOpen && (
        <div className="kb-rail-scrim" onClick={() => setRailOpen(false)} aria-hidden />
      )}

      <nav className="kb-rail" data-open={railOpen} aria-label="Console sections">
        <div className="kb-rail-brand">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          <span style={{ minWidth: 0 }}>
            <strong>Knowledge Base</strong>
            <span>Super-admin console</span>
          </span>
        </div>

        <ul className="kb-rail-nav">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="kb-nav-btn"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => go(t.id)}
              >
                <span className="kb-nav-ico">{t.icon}</span>
                <span className="kb-nav-label">{t.label}</span>
                {t.id === "requests" && pending > 0 && (
                  <span className="kb-nav-count">{pending}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="kb-rail-foot">
          <div className="kb-rail-who kb-sunken">
            <span className="brand-mark" aria-hidden style={{ width: "1.4rem", height: "1.4rem", fontSize: "0.7rem" }}>
              {me.username.slice(0, 1).toUpperCase()}
            </span>
            <span title={`@${me.username}`}>@{me.username}</span>
          </div>
          <button
            type="button"
            className="btn btn-quiet btn-small btn-block"
            onClick={() => {
              clearAdminSession();
              router.replace("/kbase/login");
            }}
          >
            <IconLogout size={15} /> Sign out
          </button>
        </div>
      </nav>

      <div className="kb-content">
        <header className="kb-top">
          <button
            type="button"
            className="kb-burger kb-raised"
            aria-expanded={railOpen}
            aria-label={railOpen ? "Close the section menu" : "Open the section menu"}
            onClick={() => setRailOpen((v) => !v)}
          >
            <IconMenu open={railOpen} />
          </button>

          <div className="kb-top-title">
            <h1>{current.label}</h1>
            <p>{current.blurb}</p>
          </div>

          <div className="kb-top-actions">
            <div className="kb-seg kb-sunken" role="group" aria-label="How much explanation to show">
              <button
                type="button"
                aria-pressed={verbose}
                onClick={() => {
                  setVerbose(true);
                  try {
                    localStorage.setItem("kv.kbase.verbose", "true");
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Verbose
              </button>
              <button
                type="button"
                aria-pressed={!verbose}
                onClick={() => {
                  setVerbose(false);
                  try {
                    localStorage.setItem("kv.kbase.verbose", "false");
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Compact
              </button>
            </div>
          </div>
        </header>

        <main className="kb-body">
          {tab === "overview" && <OverviewTab onJump={go} />}
          {tab === "orgs" && <OrgsTab flash={flash} />}
          {tab === "users" && <UsersTab flash={flash} />}
          {tab === "requests" && <RequestsTab flash={flash} />}
          {tab === "coins" && <CoinsTab flash={flash} />}
          {tab === "admins" && <AdminsTab flash={flash} />}
          {tab === "glossary" && <GlossaryTab />}
        </main>
      </div>

      {toast && (
        <div className="kb-toast kb-glass" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="kv-auth-wrap" style={{ minHeight: "100svh" }}>
      <form
        className="card kv-auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          const d = new FormData(e.currentTarget);
          try {
            await admin.changePassword(
              String(d.get("cur")),
              String(d.get("new")),
              String(d.get("confirm")),
            );
            onDone();
          } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="brand-mark" aria-hidden>
          ✦
        </span>
        <h1 className="h4 mb-1">Set a new password</h1>
        <p className="auth-sub mb-4">
          This account is still on the password it was created with. The portal stays closed
          until it is replaced.
        </p>
        <input name="cur" type="password" className="form-control mb-2" placeholder="Current password" required />
        <input
          name="new"
          type="password"
          className="form-control mb-2"
          placeholder="New password (at least 10 characters)"
          required
          minLength={10}
        />
        <input name="confirm" type="password" className="form-control mb-3" placeholder="Retype the new password" required />
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary w-100" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </main>
  );
}

// ── Small shared pieces ─────────────────────────────────────────────────────

/**
 * Anything that must cover the window rather than its panel.
 *
 * The console's panels are glass, and `backdrop-filter` makes an element a containing
 * block for `position: fixed` descendants — so a drawer rendered inside a panel anchors
 * itself to that panel and hangs off the bottom of the window instead of filling it.
 * Everything overlay-shaped therefore goes to `<body>` through a portal.
 */
function Overlay({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // While a drawer is open the page behind it must not scroll away underneath.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

/** A statistic with its own definition attached. */
function Tile({
  k,
  v,
  note,
  tone,
  meter,
  defKey,
}: {
  k: string;
  v: React.ReactNode;
  note?: React.ReactNode;
  tone?: "ok" | "warn" | "danger";
  meter?: number | null;
  defKey?: string;
}) {
  const def = defKey ? KBASE_GLOSSARY[defKey] : undefined;
  return (
    <div className="kb-tile kb-raised" data-tone={tone}>
      <span className="kb-tile-k">
        {def ? <Define def={def}>{k}</Define> : k}
      </span>
      <span className="kb-tile-v">{v}</span>
      {note && <span className="kb-tile-note">{note}</span>}
      {meter != null && (
        <span className="kb-meter kb-sunken" data-tone={meterTone(meter)}>
          <i style={{ width: `${Math.round(meter * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function LivePill({ at }: { at: Date | null }) {
  return (
    <span className="kb-live kb-sunken">
      <i aria-hidden />
      <Define def={KBASE_GLOSSARY.liveRefresh}>Live</Define>
      {at ? ` · ${at.toLocaleTimeString()}` : ""}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${planTone(status)}`}>{status.toLowerCase()}</span>;
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ onJump }: { onJump: (t: Tab) => void }) {
  const [orgs, setOrgs] = useState<AdminOrgRow[] | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [reqs, setReqs] = useState<AdminRequestRow[] | null>(null);
  const [at, setAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    admin.orgs().then((r) => setOrgs(r.orgs)).catch(() => setOrgs([]));
    admin.users().then((r) => setUsers(r.users)).catch(() => setUsers([]));
    admin.requests().then((r) => setReqs(r.requests)).catch(() => setReqs([]));
    setAt(new Date());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const live = (orgs ?? []).filter((o) => !o.deletedAt);
  const active = live.filter((o) => o.planStatus === "ACTIVE").length;
  const expired = live.filter((o) => o.planStatus === "EXPIRED").length;
  const expiring = live.filter((o) => {
    const d = daysLeft(o.planExpiresAt);
    return o.planStatus === "ACTIVE" && d != null && d >= 0 && d <= 14;
  });
  const dormant = live.filter((o) => {
    const days = o.lastActivityAt
      ? Math.floor((Date.now() - new Date(o.lastActivityAt).getTime()) / 86400_000)
      : 999;
    return days >= 30;
  });
  const pending = (reqs ?? []).filter((r) => r.status === "PENDING");
  const storageMb = live.reduce((sum, o) => sum + o.storageUsedMb, 0);
  const kvep = live.filter((o) => o.isKvep).length;
  const suspended = (users ?? []).filter((u) => u.banned).length;

  return (
    <>
      <section className="kb-panel kb-glass">
        <div className="kb-panel-head">
          <div>
            <h2>The platform right now</h2>
            <p className="kb-verbose">
              Every figure below is read live from the API and refreshes on its own every
              fifteen seconds. Point at any label to see exactly what it counts — the same
              definitions are collected under Glossary.
            </p>
          </div>
          <LivePill at={at} />
        </div>

        {!orgs ? (
          <div className="kb-tiles">
            <div className="kb-skeleton" />
            <div className="kb-skeleton" />
            <div className="kb-skeleton" />
            <div className="kb-skeleton" />
          </div>
        ) : (
          <div className="kb-tiles">
            <Tile
              k="Organizations"
              v={live.length}
              note={`${(orgs.length - live.length) || 0} in a Recycle Bin`}
              defKey="orgNumber"
            />
            <Tile k="On a paid plan" v={active} tone="ok" note={`${kvep} employee perk`} defKey="planStatus" />
            <Tile
              k="Expired"
              v={expired}
              tone={expired > 0 ? "danger" : undefined}
              note="routed to Pricing on sign-in"
              defKey="planStatus"
            />
            <Tile
              k="Expiring ≤ 14 days"
              v={expiring.length}
              tone={expiring.length > 0 ? "warn" : undefined}
              note="worth a message before they lapse"
              defKey="planExpiresAt"
            />
            <Tile
              k="Requests waiting"
              v={pending.length}
              tone={pending.length > 0 ? "warn" : undefined}
              note={pending.length > 0 ? "someone is blocked on you" : "nothing waiting"}
              defKey="requestStatus"
            />
            <Tile k="Profiles" v={users?.length ?? "…"} note={`${suspended} suspended`} defKey="profileId" />
            <Tile
              k="Dormant ≥ 30 days"
              v={dormant.length}
              note="no activity at all"
              defKey="lastActivityAt"
            />
            <Tile k="Storage we hold" v={`${storageMb} MB`} note="inline files in our database" defKey="storageUsedMb" />
          </div>
        )}
      </section>

      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <section className="kb-panel kb-glass h-100">
            <div className="kb-panel-head">
              <div>
                <h2>Needs a decision</h2>
                <p className="kb-verbose">
                  Requests sit here until someone approves or denies them. A user waiting on
                  a code cannot create their organization at all, so this list is the one
                  thing in the console that is genuinely urgent.
                </p>
              </div>
            </div>
            {pending.length === 0 ? (
              <div className="kb-empty kb-sunken">
                <strong>Nothing waiting on you</strong>
                Every request has been decided.
              </div>
            ) : (
              <ul className="kb-activity">
                {pending.slice(0, 6).map((r) => (
                  <li key={r.id}>
                    <span>
                      <span className="chip">{PLATFORM_REQUEST_LABELS[r.kind]}</span> @
                      {r.requesterUsername}
                    </span>
                    <span className="kb-dim">{timeAgo(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="kb-actions" style={{ marginTop: "0.8rem" }}>
              <button type="button" className="btn btn-primary btn-small" onClick={() => onJump("requests")}>
                Open requests
              </button>
            </div>
          </section>
        </div>

        <div className="col-12 col-xl-6">
          <section className="kb-panel kb-glass h-100">
            <div className="kb-panel-head">
              <div>
                <h2>Worth a look</h2>
                <p className="kb-verbose">
                  Not urgent, but not nothing: plans about to lapse, and organizations
                  nobody has touched in a month. Both are conversations to start before they
                  become cancellations.
                </p>
              </div>
            </div>
            {expiring.length === 0 && dormant.length === 0 ? (
              <div className="kb-empty kb-sunken">
                <strong>All quiet</strong>
                No plan lapses in the next fortnight, and nothing has gone dormant.
              </div>
            ) : (
              <ul className="kb-activity">
                {expiring.slice(0, 4).map((o) => (
                  <li key={`x-${o.id}`}>
                    <span>
                      <strong>{o.name}</strong> <span className="kb-dim">#{o.orgNumber}</span>
                    </span>
                    <span className="kb-dim">{daysLeft(o.planExpiresAt)} days left</span>
                  </li>
                ))}
                {dormant.slice(0, 4).map((o) => (
                  <li key={`d-${o.id}`}>
                    <span>
                      <strong>{o.name}</strong> <span className="kb-dim">#{o.orgNumber}</span>
                    </span>
                    <span className="kb-dim">last active {timeAgo(o.lastActivityAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="kb-actions" style={{ marginTop: "0.8rem" }}>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => onJump("orgs")}>
                Open organizations
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// ── Organizations ───────────────────────────────────────────────────────────

type SortKey =
  | "orgNumber"
  | "name"
  | "planKey"
  | "planStatus"
  | "planExpiresAt"
  | "memberCount"
  | "documentCount"
  | "uploadCount"
  | "storageUsedMb"
  | "roleCount"
  | "treeDepth"
  | "lastActivityAt";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "orgNumber", label: "Number" },
  { key: "name", label: "Name" },
  { key: "planKey", label: "Plan" },
  { key: "planStatus", label: "Plan status" },
  { key: "planExpiresAt", label: "Expiry" },
  { key: "memberCount", label: "People" },
  { key: "documentCount", label: "Documents" },
  { key: "uploadCount", label: "Uploads" },
  { key: "storageUsedMb", label: "Storage used" },
  { key: "roleCount", label: "Roles" },
  { key: "treeDepth", label: "Tree depth" },
  { key: "lastActivityAt", label: "Last activity" },
];

type OrgFilter = "all" | "active" | "expired" | "kvep" | "deleted" | "dormant";

function OrgsTab({ flash }: { flash: (m: string) => void }) {
  const [orgs, setOrgs] = useState<AdminOrgRow[] | null>(null);
  const [detail, setDetail] = useState<AdminOrgDetail | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [composing, setComposing] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("orgNumber");
  const [desc, setDesc] = useState(false);
  const [filter, setFilter] = useState<OrgFilter>("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [at, setAt] = useState<Date | null>(null);

  const load = useCallback(
    () =>
      admin
        .orgs()
        .then((r) => {
          setOrgs(r.orgs);
          setAt(new Date());
        })
        .catch(() => setOrgs([])),
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const openDetail = async (orgNumber: number) => {
    try {
      setDetail(await admin.orgDetail(orgNumber));
    } catch (e) {
      flash(e instanceof AdminApiError ? e.message : "Could not open that organization");
    }
  };

  const rows = useMemo(() => {
    const dormantDays = (o: AdminOrgRow) =>
      o.lastActivityAt
        ? Math.floor((Date.now() - new Date(o.lastActivityAt).getTime()) / 86400_000)
        : 999;
    const out = (orgs ?? [])
      .filter((o) => {
        if (filter === "active") return o.planStatus === "ACTIVE" && !o.deletedAt;
        if (filter === "expired") return o.planStatus === "EXPIRED" && !o.deletedAt;
        if (filter === "kvep") return o.isKvep;
        if (filter === "deleted") return !!o.deletedAt;
        if (filter === "dormant") return !o.deletedAt && dormantDays(o) >= 30;
        return true;
      })
      .filter((o) => {
        if (!q.trim()) return true;
        const s = q.toLowerCase();
        return (
          o.name.toLowerCase().includes(s) ||
          String(o.orgNumber).includes(s) ||
          (o.planKey ?? "").toLowerCase().includes(s) ||
          o.planStatus.toLowerCase().includes(s) ||
          o.ownerUsernames.some((u) => u.toLowerCase().includes(s))
        );
      });
    out.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return desc ? -cmp : cmp;
    });
    return out;
  }, [orgs, q, sortKey, desc, filter]);

  const toggle = (orgNumber: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orgNumber)) next.delete(orgNumber);
      else next.add(orgNumber);
      return next;
    });

  const doBulkDelete = async () => {
    setConfirmBulk(false);
    try {
      const res = await admin.bulkDelete({ orgNumbers: [...selected] });
      flash(`Permanently deleted ${res.deleted} organization${res.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
      load();
    } catch (e) {
      flash(e instanceof AdminApiError ? e.message : "Delete failed");
    }
  };

  return (
    <section className="kb-panel kb-glass">
      <div className="kb-panel-head">
        <div>
          <h2>All organizations</h2>
          <p className="kb-verbose">
            Every organization on the platform. Open one to read and edit everything the
            console knows about it; tick several to message their owners or purge them
            together. Point at any label to see what it counts.
          </p>
        </div>
        <div className="kb-actions">
          <LivePill at={at} />
          <button type="button" className="btn btn-quiet btn-small" onClick={load}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Toolbar — Bootstrap's row/col so it reflows instead of overflowing. */}
      <div className="row g-2 align-items-center">
        <div className="col-12 col-lg-5">
          <label className="visually-hidden" htmlFor="kb-org-q">
            Search organizations
          </label>
          <input
            id="kb-org-q"
            className="kb-input"
            placeholder="Search name, number, owner or plan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="col-6 col-lg-3">
          <label className="visually-hidden" htmlFor="kb-org-filter">
            Filter
          </label>
          <select
            id="kb-org-filter"
            className="kb-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as OrgFilter)}
          >
            <option value="all">Show: everything</option>
            <option value="active">Show: on a paid plan</option>
            <option value="expired">Show: expired</option>
            <option value="dormant">Show: dormant ≥ 30 days</option>
            <option value="kvep">Show: employee perk (KVEP)</option>
            <option value="deleted">Show: in a Recycle Bin</option>
          </select>
        </div>
        <div className="col-6 col-lg-2">
          <label className="visually-hidden" htmlFor="kb-org-sort">
            Sort by
          </label>
          <select
            id="kb-org-sort"
            className="kb-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-lg-2 d-flex gap-2 flex-wrap justify-content-lg-end">
          <div className="kb-seg kb-sunken" role="group" aria-label="Sort direction">
            <button type="button" aria-pressed={!desc} onClick={() => setDesc(false)} title="Ascending">
              ↑
            </button>
            <button type="button" aria-pressed={desc} onClick={() => setDesc(true)} title="Descending">
              ↓
            </button>
          </div>
          <div className="kb-seg kb-sunken" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>
              Cards
            </button>
            <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
              Table
            </button>
          </div>
        </div>
      </div>

      <p className="kb-dim" style={{ margin: "0.7rem 0 0.4rem" }}>
        {orgs == null
          ? "Loading…"
          : `${rows.length} of ${orgs.length} organization${orgs.length === 1 ? "" : "s"} shown`}
      </p>

      {selected.size > 0 && (
        <div className="kb-selectbar kb-raised">
          <strong>{selected.size} selected</strong>
          <button type="button" className="btn btn-primary btn-small" onClick={() => setComposing(true)}>
            ✉ Message their owners
          </button>
          {confirmBulk ? (
            <>
              <span className="kb-dim">Purge all {selected.size}, permanently?</span>
              <button type="button" className="btn btn-danger btn-small" onClick={doBulkDelete}>
                Yes, purge
              </button>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirmBulk(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-danger btn-small" onClick={() => setConfirmBulk(true)}>
              Purge selected
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {composing && (
        <BroadcastForm
          orgNumbers={[...selected]}
          onClose={() => setComposing(false)}
          onDone={(m) => {
            flash(m);
            setComposing(false);
            setSelected(new Set());
          }}
        />
      )}

      {orgs == null && (
        <div className="kb-cards">
          <div className="kb-skeleton" style={{ height: "9rem" }} />
          <div className="kb-skeleton" style={{ height: "9rem" }} />
          <div className="kb-skeleton" style={{ height: "9rem" }} />
        </div>
      )}

      {orgs != null && rows.length === 0 && (
        <div className="kb-empty kb-sunken">
          <strong>Nothing matches</strong>
          {q ? "No organization matches that search." : "There are no organizations in this view."}
        </div>
      )}

      {orgs != null && rows.length > 0 && view === "cards" && (
        <div className="kb-cards">
          {rows.map((o) => (
            <article
              key={o.id}
              className="kb-card kb-raised"
              data-selected={selected.has(o.orgNumber)}
              data-deleted={!!o.deletedAt}
            >
              <label className="kb-card-pick kb-sunken">
                <input
                  type="checkbox"
                  checked={selected.has(o.orgNumber)}
                  onChange={() => toggle(o.orgNumber)}
                  aria-label={`Select ${o.name}`}
                />
              </label>
              <button type="button" className="kb-card-open" onClick={() => openDetail(o.orgNumber)}>
                <span className="kb-card-id">
                  <OrgBadge name={o.name} logo={o.logo} orgNumber={o.orgNumber} size={38} />
                  <span style={{ minWidth: 0 }}>
                    <h3 title={o.name}>{o.name}</h3>
                    <small>
                      #{o.orgNumber} · {o.ownerUsernames.length ? `@${o.ownerUsernames[0]}` : "no owner"}
                      {o.ownerUsernames.length > 1 ? ` +${o.ownerUsernames.length - 1}` : ""}
                    </small>
                  </span>
                </span>

                <span className="kb-tagrow">
                  <StatusBadge status={o.planStatus} />
                  {o.planKey && <span className="chip">{o.planKey}</span>}
                  {o.isKvep && <span className="chip chip-kvep">KVEP</span>}
                  {o.deletedAt && <span className="badge badge-danger">in Recycle Bin</span>}
                </span>

                <dl className="kb-card-facts kb-sunken">
                  <div>
                    <dt>People</dt>
                    <dd>{fmtLimit(o.memberCount, o.memberLimit)}</dd>
                  </div>
                  <div>
                    <dt>Docs</dt>
                    <dd>{fmtLimit(o.documentCount, o.documentLimit)}</dd>
                  </div>
                  <div>
                    <dt>Uploads</dt>
                    <dd>{fmtLimit(o.uploadCount, o.uploadLimit)}</dd>
                  </div>
                  <div>
                    <dt>Roles</dt>
                    <dd>
                      {o.roleCount}
                      <span className="kb-dim"> /d{o.treeDepth}</span>
                    </dd>
                  </div>
                </dl>

                <span className="kb-card-foot">
                  <span>active {timeAgo(o.lastActivityAt)}</span>
                  <span className="kb-card-cta">Open →</span>
                </span>
              </button>
            </article>
          ))}
        </div>
      )}

      {orgs != null && rows.length > 0 && view === "table" && (
        <div className="kb-tablewrap kb-sunken">
          <table className="kb-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Select</span>
                </th>
                <th scope="col">Organization</th>
                <th scope="col">Plan</th>
                <th scope="col">People</th>
                <th scope="col">Documents</th>
                <th scope="col">Storage</th>
                <th scope="col">Last activity</th>
                <th scope="col">
                  <span className="visually-hidden">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} data-muted={!!o.deletedAt}>
                  <td data-label="Select">
                    <input
                      type="checkbox"
                      checked={selected.has(o.orgNumber)}
                      onChange={() => toggle(o.orgNumber)}
                      aria-label={`Select ${o.name}`}
                    />
                  </td>
                  <td data-label="Organization">
                    <strong>{o.name}</strong>
                    <br />
                    <span className="kb-dim">#{o.orgNumber}</span>
                  </td>
                  <td data-label="Plan">
                    <StatusBadge status={o.planStatus} /> {o.planKey ?? "—"}
                  </td>
                  <td data-label="People">{fmtLimit(o.memberCount, o.memberLimit)}</td>
                  <td data-label="Documents">{fmtLimit(o.documentCount, o.documentLimit)}</td>
                  <td data-label="Storage">{o.storageUsedMb} MB</td>
                  <td data-label="Last activity">{timeAgo(o.lastActivityAt)}</td>
                  <td data-label="Open">
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      onClick={() => openDetail(o.orgNumber)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <OrgDrawer
          detail={detail}
          onClose={() => setDetail(null)}
          onSaved={(m) => {
            flash(m);
            openDetail(detail.org.orgNumber);
            load();
          }}
          onDeleted={(m) => {
            flash(m);
            setDetail(null);
            load();
          }}
        />
      )}
    </section>
  );
}

// ── The organization drawer ─────────────────────────────────────────────────

type DrawerTab = "summary" | "properties" | "storage" | "people" | "activity";

function OrgDrawer({
  detail,
  onClose,
  onSaved,
  onDeleted,
}: {
  detail: AdminOrgDetail;
  onClose: () => void;
  onSaved: (m: string) => void;
  onDeleted: (m: string) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("summary");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  const o = detail.org;
  const st = detail.storage;
  const dirty = Object.keys(edits).length > 0;

  // Escape closes the drawer — the same reflex as every other overlay on the platform.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valueOf = (key: string, fallback: string | number | null) =>
    edits[key] !== undefined ? edits[key] : fallback == null ? "" : String(fallback);

  const save = async () => {
    setError(null);
    setBusy(true);
    const num = (k: string) => {
      if (edits[k] === undefined) return undefined;
      return edits[k].trim() === "" ? null : Number(edits[k]);
    };
    try {
      await admin.setOrg({
        orgNumber: o.orgNumber,
        ...(edits.name !== undefined ? { name: edits.name } : {}),
        ...(edits.planKey !== undefined ? { planKey: edits.planKey || null } : {}),
        ...(edits.planStatus !== undefined
          ? { planStatus: edits.planStatus as "NONE" | "DEMO" | "ACTIVE" | "EXPIRED" }
          : {}),
        ...(edits.planExpiresAt !== undefined ? { planExpiresAt: edits.planExpiresAt || null } : {}),
        ...(num("memberLimit") !== undefined ? { memberLimit: num("memberLimit") } : {}),
        ...(num("documentLimit") !== undefined ? { documentLimit: num("documentLimit") } : {}),
        ...(num("uploadLimit") !== undefined ? { uploadLimit: num("uploadLimit") } : {}),
        ...(num("storageLimitMb") !== undefined ? { storageLimitMb: num("storageLimitMb") } : {}),
      });
      setEdits({});
      onSaved(`Saved ${o.name}`);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const DRAWER_TABS: { id: DrawerTab; label: string }[] = [
    { id: "summary", label: "At a glance" },
    { id: "properties", label: `Properties (${detail.properties.length})` },
    { id: "storage", label: "Storage" },
    { id: "people", label: `Owners (${detail.owners.length})` },
    { id: "activity", label: "Activity" },
  ];

  return (
    <Overlay>
      <div className="kb-scrim" onClick={onClose} aria-hidden />
      <aside className="kb-drawer" role="dialog" aria-modal="true" aria-label={`${o.name} — properties`}>
        <header className="kb-drawer-head">
          <OrgBadge name={o.name} logo={o.logo} orgNumber={o.orgNumber} size={44} />
          <div className="kb-drawer-head-text">
            <h3>{o.name}</h3>
            <div className="kb-tagrow">
              <span className="chip">#{o.orgNumber}</span>
              <StatusBadge status={o.planStatus} />
              {o.planKey && <span className="badge">{o.planKey}</span>}
              {o.planIsCustom && <span className="badge">custom terms</span>}
              {o.isKvep && <span className="chip chip-kvep">KVEP</span>}
              {o.deletedAt && <span className="badge badge-danger">in Recycle Bin</span>}
            </div>
          </div>
          <button type="button" className="kb-close kb-raised" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="kb-drawer-tabs" role="tablist">
          {DRAWER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="kb-drawer-body">
          {tab === "summary" && (
            <>
              <div>
                <h4 className="kb-section-title">Allowances</h4>
                <div className="kb-tiles">
                  <Tile
                    k="People"
                    v={fmtLimit(o.memberCount, o.memberLimit)}
                    meter={ratio(o.memberCount, o.memberLimit)}
                    defKey="memberCount"
                  />
                  <Tile
                    k="Custom documents"
                    v={fmtLimit(o.documentCount, o.documentLimit)}
                    meter={ratio(o.documentCount, o.documentLimit)}
                    defKey="documentCount"
                  />
                  <Tile
                    k="Uploads"
                    v={fmtLimit(o.uploadCount, o.uploadLimit)}
                    meter={ratio(o.uploadCount, o.uploadLimit)}
                    defKey="uploadCount"
                  />
                  <Tile
                    k="Storage used"
                    v={`${o.storageUsedMb} MB`}
                    note={o.storageLimitMb != null ? `of ${o.storageLimitMb} MB` : "no ceiling"}
                    meter={ratio(o.storageUsedMb, o.storageLimitMb)}
                    defKey="storageUsedMb"
                  />
                </div>
              </div>

              <div>
                <h4 className="kb-section-title">Shape &amp; history</h4>
                <dl className="kb-rows">
                  <div>
                    <Define as="dt" def={KBASE_GLOSSARY.roleCount}>
                      Roles
                    </Define>
                    <dd>
                      {o.roleCount} role{o.roleCount === 1 ? "" : "s"}, {o.treeDepth} level
                      {o.treeDepth === 1 ? "" : "s"} deep
                    </dd>
                  </div>
                  <div>
                    <Define as="dt" def={KBASE_GLOSSARY.planKey}>
                      Plan
                    </Define>
                    <dd>
                      {o.planKey ?? "none"}
                      {o.planIsCustom ? " (negotiated terms)" : ""}
                    </dd>
                  </div>
                  <div>
                    <Define as="dt" def={KBASE_GLOSSARY.planExpiresAt}>
                      Expires
                    </Define>
                    <dd>
                      {o.planExpiresAt ? (
                        <>
                          {o.planExpiresAt.slice(0, 10)}{" "}
                          <span className="kb-dim">
                            ({daysLeft(o.planExpiresAt)! >= 0
                              ? `${daysLeft(o.planExpiresAt)} days left`
                              : `${-daysLeft(o.planExpiresAt)!} days ago`}
                            )
                          </span>
                        </>
                      ) : (
                        "no expiry"
                      )}
                    </dd>
                  </div>
                  <div>
                    <Define as="dt" def={KBASE_GLOSSARY.createdAt}>
                      Created
                    </Define>
                    <dd>{o.createdAt.slice(0, 10)}</dd>
                  </div>
                  <div>
                    <Define as="dt" def={KBASE_GLOSSARY.lastActivityAt}>
                      Last activity
                    </Define>
                    <dd>{timeAgo(o.lastActivityAt)}</dd>
                  </div>
                  {o.deletedAt && (
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.deletedAt}>
                        Deleted
                      </Define>
                      <dd>{o.deletedAt.slice(0, 10)} — waiting out its 30-day retention</dd>
                    </div>
                  )}
                  <div>
                    <Define as="dt" def={KBASE_GLOSSARY.id}>
                      Organization ID
                    </Define>
                    <dd>
                      <code className="kb-mono">{o.id}</code>
                    </dd>
                  </div>
                </dl>
              </div>
            </>
          )}

          {tab === "properties" && (
            <div>
              <h4 className="kb-section-title">Everything, editable in place</h4>
              <p className="kb-verbose">
                A value set here always beats the plan. Clearing a limit hands the decision
                back to the plan — it does not mean zero. To actually forbid something, set
                it to <code>0</code>. Changed fields are outlined until you save.
              </p>
              <div className="kb-props">
                {detail.properties.map((pr: AdminOrgProperty) => {
                  const def = defineProperty(pr.key, pr.label, pr.hint);
                  const isDirty = edits[pr.key] !== undefined;
                  return (
                    <div key={pr.key} className="kb-prop kb-sunken" data-dirty={isDirty}>
                      <span className="kb-prop-head">
                        <Define def={def}>{pr.label}</Define>
                        {pr.type === "readonly" && <span className="kb-prop-hint">read-only</span>}
                      </span>
                      {pr.type === "readonly" ? (
                        <span className="kb-prop-ro">{pr.value ?? "—"}</span>
                      ) : pr.type === "select" ? (
                        <select
                          aria-label={pr.label}
                          value={valueOf(pr.key, pr.value)}
                          onChange={(e) => setEdits((v) => ({ ...v, [pr.key]: e.target.value }))}
                        >
                          <option value="">—</option>
                          {(pr.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label={pr.label}
                          type={pr.type === "number" ? "number" : pr.type === "date" ? "date" : "text"}
                          value={valueOf(pr.key, pr.value)}
                          placeholder={pr.type === "number" ? "blank = the plan's limit" : ""}
                          onChange={(e) => setEdits((v) => ({ ...v, [pr.key]: e.target.value }))}
                        />
                      )}
                      {pr.hint && <span className="kb-prop-hint">{pr.hint}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "storage" && (
            <div>
              <h4 className="kb-section-title">Where the documents live</h4>
              {o.isKvep ? (
                <p className="kb-dim">
                  Employee perk (KVEP) — documents are held on Knowledge Vault&rsquo;s own
                  storage and the plan&rsquo;s allowance applies. There is nothing to
                  configure, and nothing to go unreachable.
                </p>
              ) : !st ? (
                <div className="kb-warn">
                  <strong>No storage connected.</strong>
                  Uploads fall back to our database at the 10 MB inline cap. That works, but
                  it puts the customer&rsquo;s bytes on our bill instead of theirs.
                </div>
              ) : (
                <>
                  <dl className="kb-rows">
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.storageStatus}>
                        Status
                      </Define>
                      <dd>
                        {st.status === "ACTIVE" ? "✓ Connected" : "⚠ Unreachable"}
                        {st.lastCheckAt && (
                          <span className="kb-dim">
                            {" · checked "}
                            {st.lastCheckAt.slice(0, 16).replace("T", " ")}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.storageEndpoint}>
                        Address
                      </Define>
                      <dd>{st.endpoint}</dd>
                    </div>
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.storageBucket}>
                        Bucket
                      </Define>
                      <dd>
                        {st.bucket}
                        {st.prefix ? ` / ${st.prefix}` : ""}
                      </dd>
                    </div>
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.storageRegion}>
                        Region
                      </Define>
                      <dd>{st.region ?? "—"}</dd>
                    </div>
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.storageAccessKey}>
                        Access key
                      </Define>
                      <dd>
                        <code className="kb-mono">{st.accessKeyIdMasked}</code>
                      </dd>
                    </div>
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.storageEncryption}>
                        Encryption
                      </Define>
                      <dd>{st.encryption === "ENCRYPTED" ? "Encrypted (.kvblob)" : "Readable files"}</dd>
                    </div>
                    <div>
                      <Define as="dt" def={KBASE_GLOSSARY.storageObjects}>
                        Objects
                      </Define>
                      <dd>
                        {st.objectCount} object{st.objectCount === 1 ? "" : "s"} ·{" "}
                        {fmtBytes(st.bytesUsed)}
                      </dd>
                    </div>
                    {st.pendingMigration > 0 && (
                      <div>
                        <Define as="dt" def={KBASE_GLOSSARY.storagePending}>
                          Not migrated
                        </Define>
                        <dd>{st.pendingMigration} still in our database</dd>
                      </div>
                    )}
                  </dl>
                  {st.lastError && <p className="kb-error">{st.lastError}</p>}
                  <div className="kb-actions" style={{ marginTop: "0.7rem" }}>
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      disabled={checking}
                      onClick={async () => {
                        setChecking(true);
                        try {
                          const r = await admin.checkOrgStorage(o.orgNumber);
                          onSaved(
                            r.status === "ACTIVE"
                              ? "Storage is reachable."
                              : `Still unreachable — ${r.error ?? "no detail given"}`,
                          );
                        } catch (e) {
                          setError(e instanceof AdminApiError ? e.message : "Check failed");
                        } finally {
                          setChecking(false);
                        }
                      }}
                    >
                      {checking ? "Checking…" : "Test connection"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "people" && (
            <div>
              <h4 className="kb-section-title">Owners</h4>
              <p className="kb-verbose">
                Everyone placed on this organization&rsquo;s root role. An organization must
                keep at least one — a profile that owns one cannot be deleted until it is
                handed over or the organization goes.
              </p>
              {detail.owners.length === 0 && (
                <div className="kb-warn">
                  <strong>No owners.</strong>
                  Nobody can govern this organization. It needs an owner restored from its{" "}
                  <code>.main</code> file, or purging.
                </div>
              )}
              {detail.owners.map((ow) => (
                <div key={ow.profileId} className="kb-owner">
                  <strong>{ow.displayName}</strong>
                  <span className="kb-dim">@{ow.username}</span>
                  <span className="chip">{ow.coins} coins</span>
                  <code className="kb-mono">{ow.profileId}</code>
                </div>
              ))}
            </div>
          )}

          {tab === "activity" && (
            <div>
              <h4 className="kb-section-title">Recent activity</h4>
              {detail.recentActivity.length === 0 ? (
                <div className="kb-empty kb-sunken">
                  <strong>Nothing recorded</strong>
                  No audited action has been taken in this organization yet.
                </div>
              ) : (
                <ul className="kb-activity">
                  {detail.recentActivity.map((a, i) => (
                    <li key={i}>
                      <span>{a.action}</span>
                      <span className="kb-dim">{new Date(a.at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {messaging && (
            <BroadcastForm
              orgNumbers={[o.orgNumber]}
              onClose={() => setMessaging(false)}
              onDone={(m) => {
                onSaved(m);
                setMessaging(false);
              }}
            />
          )}
        </div>

        <footer className="kb-drawer-foot">
          {error && <p className="kb-error" style={{ flexBasis: "100%" }}>{error}</p>}
          <button type="button" className="btn btn-primary btn-small" disabled={!dirty || busy} onClick={save}>
            {busy ? "Saving…" : dirty ? `Save ${Object.keys(edits).length} change${Object.keys(edits).length === 1 ? "" : "s"}` : "Saved"}
          </button>
          {dirty && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setEdits({})}>
              Discard
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setMessaging((v) => !v)}>
            ✉ Message owners
          </button>
          {confirmDelete ? (
            <>
              <span className="kb-dim">Purge, permanently?</span>
              <button
                type="button"
                className="btn btn-danger btn-small"
                onClick={async () => {
                  try {
                    await admin.purgeOrg(o.orgNumber);
                    onDeleted(`Permanently deleted ${o.name}`);
                  } catch (e) {
                    setError(e instanceof AdminApiError ? e.message : "Delete failed");
                  }
                }}
              >
                Yes, purge
              </button>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-danger btn-small" onClick={() => setConfirmDelete(true)}>
              Purge
            </button>
          )}
        </footer>
      </aside>
    </Overlay>
  );
}

// ── Broadcast ───────────────────────────────────────────────────────────────

function BroadcastForm({
  orgNumbers,
  onClose,
  onDone,
}: {
  orgNumbers: number[];
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="kb-form kb-sunken"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        const d = new FormData(e.currentTarget);
        try {
          const res = await admin.messageOrgs({
            orgNumbers,
            subject: String(d.get("subject")),
            message: String(d.get("message")),
            priority: d.get("priority") === "HIGH" ? "HIGH" : "NORMAL",
          });
          onDone(
            `Delivered to ${res.delivered} owner${res.delivered === 1 ? "" : "s"} across ${res.organizations} organization${res.organizations === 1 ? "" : "s"}`,
          );
        } catch (err) {
          setError(err instanceof AdminApiError ? err.message : "Could not send");
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong>
        <Define def={KBASE_GLOSSARY.broadcast}>
          Message the owners of {orgNumbers.length} organization{orgNumbers.length === 1 ? "" : "s"}
        </Define>
      </strong>
      <p className="kb-verbose" style={{ margin: 0 }}>
        Lands in each owner&rsquo;s mailbox under &ldquo;Knowledge Base&rdquo;, expires after
        30 days like all Knowledge Base mail, and is audited with its subject and recipient
        count. These are working mailboxes — one message about a real change beats four about
        the same one.
      </p>
      <label className="kb-label">
        Subject
        <input name="subject" required maxLength={120} placeholder="New yearly plan — two months free" />
      </label>
      <label className="kb-label">
        Message
        <textarea name="message" required rows={4} maxLength={2000} />
      </label>
      <label className="kb-label">
        <Define def={KBASE_GLOSSARY.priority}>Priority</Define>
        <select name="priority" defaultValue="NORMAL">
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High — pins it to the top of their mailbox</option>
        </select>
      </label>
      {error && <p className="kb-error">{error}</p>}
      <div className="kb-actions">
        <button className="btn btn-primary btn-small" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Requests ────────────────────────────────────────────────────────────────

function RequestsTab({ flash }: { flash: (m: string) => void }) {
  const [reqs, setReqs] = useState<AdminRequestRow[] | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const load = useCallback(
    () =>
      admin
        .requests()
        .then((r) => {
          setReqs(r.requests);
          setAt(new Date());
        })
        .catch(() => setReqs([])),
    [],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const pending = reqs?.filter((r) => r.status === "PENDING") ?? [];
  const served = reqs?.filter((r) => r.status !== "PENDING") ?? [];

  return (
    <section className="kb-panel kb-glass">
      <div className="kb-panel-head">
        <div>
          <h2>Requests</h2>
          <p className="kb-verbose">
            Users asking to create an organization, take the employee perk, propose custom
            terms, or restore an expired one. <strong>Approving is one click</strong> — the
            server fills every term from the plan they picked and delivers the access code to
            their mailbox. Adjusting terms is for the exception, not the rule.
          </p>
        </div>
        <div className="kb-actions">
          <LivePill at={at} />
          <button type="button" className="btn btn-quiet btn-small" onClick={load}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {reqs == null && <div className="kb-skeleton" style={{ height: "8rem" }} />}

      {reqs != null && pending.length === 0 && (
        <div className="kb-empty kb-sunken">
          <strong>Nothing waiting on you</strong>
          Every request has been decided. New ones appear here on their own.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {pending.map((r) => (
          <article key={r.id} className="kb-request kb-raised">
            <div style={{ minWidth: 0 }}>
              <div className="kb-tagrow">
                <span className="chip">{PLATFORM_REQUEST_LABELS[r.kind]}</span>
                {r.planKey && <span className="badge">{r.planName ?? r.planKey}</span>}
                {r.targetOrgNumber != null && (
                  <span className="badge">org #{r.targetOrgNumber}</span>
                )}
                <span className="kb-dim">{timeAgo(r.createdAt)}</span>
              </div>
              <p style={{ margin: "0.5rem 0 0" }}>
                <strong>@{r.requesterUsername}</strong>{" "}
                <span className="kb-dim">({r.requesterDisplayName})</span>
              </p>
              <p className="kb-dim" style={{ margin: 0 }}>
                <Define def={KBASE_GLOSSARY.requesterCoins}>Balance</Define>: {r.requesterCoins}{" "}
                coins
                {(r.offeredCoins ?? r.planPriceCoins ?? 0) > (r.requesterCoins ?? 0) && (
                  <strong style={{ color: "var(--danger)" }}> — not enough for this plan</strong>
                )}
              </p>

              <dl className="kb-terms kb-sunken">
                <div>
                  <dt>Days</dt>
                  <dd>{r.requestedDays ?? r.planDurationDays ?? "∞"}</dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>{r.requestedMembers ?? r.planMemberLimit ?? "∞"}</dd>
                </div>
                <div>
                  <dt>Documents</dt>
                  <dd>{r.requestedDocuments ?? r.planDocumentLimit ?? "∞"}</dd>
                </div>
                <div>
                  <dt>Uploads</dt>
                  <dd>{r.requestedUploads ?? r.planUploadLimit ?? "∞"}</dd>
                </div>
                <div>
                  <dt>Costs</dt>
                  <dd>{r.offeredCoins ?? r.planPriceCoins ?? 0} 🪙</dd>
                </div>
              </dl>
              <p className="kb-verbose" style={{ marginTop: "0.4rem" }}>
                <Define def={KBASE_GLOSSARY.willGrant}>These are the terms approving applies</Define>
                , resolved from the plan they chose.
              </p>

              {r.message && <p className="kb-quote">&ldquo;{r.message}&rdquo;</p>}
            </div>
            <DecideForm
              r={r}
              onDone={(m) => {
                flash(m);
                load();
              }}
            />
          </article>
        ))}
      </div>

      {served.length > 0 && (
        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Recently served ({served.length})
          </summary>
          <div className="kb-tablewrap kb-sunken" style={{ marginTop: "0.6rem" }}>
            <table className="kb-table">
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Requester</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Granted</th>
                  <th scope="col">Decided</th>
                </tr>
              </thead>
              <tbody>
                {served.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Kind">
                      <span className="chip">{PLATFORM_REQUEST_LABELS[r.kind]}</span>
                    </td>
                    <td data-label="Requester">@{r.requesterUsername}</td>
                    <td data-label="Outcome">
                      <span
                        className={`badge ${
                          r.status === "APPROVED" || r.status === "USED"
                            ? "badge-ok"
                            : r.status === "DENIED"
                              ? "badge-danger"
                              : ""
                        }`}
                      >
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td data-label="Granted">
                      {r.grantedDays != null ? `${r.grantedDays} days` : "—"}
                      {r.adminMessage ? ` · ${r.adminMessage}` : ""}
                    </td>
                    <td data-label="Decided">{r.decidedAt?.slice(0, 10) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function DecideForm({ r, onDone }: { r: AdminRequestRow; onDone: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  if (otp) {
    return (
      <div className="kb-form kb-sunken">
        <strong>Approved</strong>
        <p className="kb-dim" style={{ margin: 0 }}>
          This code also went to @{r.requesterUsername}&rsquo;s mailbox.
        </p>
        <div className="kb-otp kb-raised">{otp}</div>
        <p className="kb-dim" style={{ margin: 0 }}>
          <Define def={KBASE_GLOSSARY.accessCode}>Valid 24 hours, single use.</Define>
        </p>
      </div>
    );
  }

  const decide = async (decision: "APPROVE" | "DENY", form?: HTMLFormElement) => {
    setError(null);
    setBusy(true);
    const d = form ? new FormData(form) : null;
    const numOrUndef = (k: string) => {
      const v = d?.get(k);
      return v != null && String(v).trim() !== "" ? Number(v) : undefined;
    };
    try {
      const res = await admin.decide(r.id, {
        decision,
        grantedDays: numOrUndef("days"),
        priceCoins: numOrUndef("price"),
        grantedMembers: numOrUndef("members"),
        grantedDocuments: numOrUndef("documents"),
        grantedUploads: numOrUndef("uploads"),
        adminMessage: d ? String(d.get("message") || "") || undefined : undefined,
      });
      if (decision === "DENY") onDone(`Denied @${r.requesterUsername}`);
      else if (res.appliedOrgNumber)
        onDone(`Upgraded org #${res.appliedOrgNumber} for @${r.requesterUsername}`);
      else {
        if (res.otp) setOtp(res.otp);
        onDone(`Approved @${r.requesterUsername}`);
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="kb-form kb-sunken"
      onSubmit={(e) => {
        e.preventDefault();
        decide("APPROVE", e.currentTarget);
      }}
    >
      {!advanced ? (
        <p className="kb-dim" style={{ margin: 0 }}>
          Approving applies the terms shown exactly as they stand.{" "}
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => setAdvanced(true)}
          >
            Adjust terms
          </button>
        </p>
      ) : (
        <>
          <p className="kb-dim" style={{ margin: 0 }}>
            Blank means &ldquo;use what the plan says&rdquo;. Fill in only what you want to
            change.
          </p>
          <div className="kb-form-grid">
            <label className="kb-label">
              Days
              <input
                name="days"
                type="number"
                min={1}
                placeholder={String(r.requestedDays ?? r.planDurationDays ?? "unlimited")}
              />
            </label>
            <label className="kb-label">
              Price (coins)
              <input
                name="price"
                type="number"
                min={0}
                placeholder={String(r.offeredCoins ?? r.planPriceCoins ?? 0)}
              />
            </label>
            <label className="kb-label">
              People limit
              <input
                name="members"
                type="number"
                min={0}
                placeholder={String(r.requestedMembers ?? r.planMemberLimit ?? "unlimited")}
              />
            </label>
            <label className="kb-label">
              Custom documents
              <input
                name="documents"
                type="number"
                min={0}
                placeholder={String(r.requestedDocuments ?? r.planDocumentLimit ?? "unlimited")}
              />
            </label>
            <label className="kb-label">
              Uploads
              <input
                name="uploads"
                type="number"
                min={0}
                placeholder={String(r.requestedUploads ?? r.planUploadLimit ?? "unlimited")}
              />
            </label>
          </div>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setAdvanced(false)}>
            Use the plan&rsquo;s terms instead
          </button>
        </>
      )}
      <label className="kb-label">
        <Define def={KBASE_GLOSSARY.adminMessage}>Note to the requester</Define>
        <input name="message" placeholder="Optional — travels with the decision" />
      </label>
      {error && <p className="kb-error">{error}</p>}
      <div className="kb-actions">
        <button className="btn btn-primary btn-small" disabled={busy}>
          {r.kind === "UPGRADE_PLAN" ? "Approve + apply upgrade" : "Approve + issue code"}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-small"
          disabled={busy}
          onClick={(e) => decide("DENY", e.currentTarget.form ?? undefined)}
        >
          Deny
        </button>
      </div>
    </form>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────

function UsersTab({ flash }: { flash: (m: string) => void }) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    admin
      .users(q.trim() || undefined)
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof AdminApiError ? e.message : "Could not load users"));
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 220); // debounce the search box
    return () => clearTimeout(t);
  }, [load]);

  const selected = users?.find((u) => u.profileId === open) ?? null;

  return (
    <section className="kb-panel kb-glass">
      <div className="kb-panel-head">
        <div>
          <h2>Users</h2>
          <p className="kb-verbose">
            Everyone with a profile, across every organization. Open a row to see where they
            belong, move their coins, suspend them, or — when they own nothing — delete them.
          </p>
        </div>
      </div>

      <div className="row g-2 align-items-center">
        <div className="col-12 col-md-8">
          <label className="visually-hidden" htmlFor="kb-user-q">
            Search users
          </label>
          <input
            id="kb-user-q"
            className="kb-input"
            placeholder="Search username or display name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="col-12 col-md-4 d-flex justify-content-md-end">
          <button type="button" className="btn btn-quiet btn-small" onClick={load}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && <p className="kb-error" style={{ marginTop: "0.6rem" }}>{error}</p>}
      {!users && <div className="kb-skeleton" style={{ height: "8rem", marginTop: "0.8rem" }} />}

      {users && users.length === 0 && (
        <div className="kb-empty kb-sunken" style={{ marginTop: "0.8rem" }}>
          <strong>No matches</strong>
          {q ? "Nobody matches that search." : "No profiles have been registered yet."}
        </div>
      )}

      {users && users.length > 0 && (
        <div className="kb-tablewrap kb-sunken" style={{ marginTop: "0.8rem" }}>
          <table className="kb-table">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Organizations</th>
                <th scope="col">Coins</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.profileId} data-muted={u.banned}>
                  <td data-label="User">
                    <strong>{u.displayName}</strong>
                    <br />
                    <span className="kb-dim">@{u.username}</span>
                  </td>
                  <td data-label="Organizations">
                    {u.orgs.length === 0 ? (
                      <span className="kb-dim">none</span>
                    ) : (
                      <span>
                        {u.orgs.length} · {u.ownsAny ? "owns one or more" : "member only"}
                      </span>
                    )}
                  </td>
                  <td data-label="Coins">{u.coins}</td>
                  <td data-label="Status">
                    {u.banned ? (
                      <span className="badge badge-danger">suspended</span>
                    ) : (
                      <span className="badge badge-ok">active</span>
                    )}
                  </td>
                  <td data-label="Open">
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      onClick={() => {
                        setOpen(u.profileId);
                        setError(null);
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <UserDrawer
          user={selected}
          onClose={() => setOpen(null)}
          onChanged={(m) => {
            flash(m);
            load();
          }}
          onDeleted={(m) => {
            flash(m);
            setOpen(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function UserDrawer({
  user,
  onClose,
  onChanged,
  onDeleted,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onChanged: (m: string) => void;
  onDeleted: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coinDelta, setCoinDelta] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged(done);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay>
      <div className="kb-scrim" onClick={onClose} aria-hidden />
      <aside
        className="kb-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${user.displayName} — profile`}
        style={{ gridTemplateRows: "auto minmax(0, 1fr) auto" }}
      >
        <header className="kb-drawer-head">
          <OrgBadge name={user.displayName} logo={user.avatar} size={44} />
          <div className="kb-drawer-head-text">
            <h3>{user.displayName}</h3>
            <div className="kb-tagrow">
              <span className="chip">@{user.username}</span>
              {user.banned ? (
                <span className="badge badge-danger">suspended</span>
              ) : (
                <span className="badge badge-ok">active</span>
              )}
              {user.ownsAny && <span className="badge">owner</span>}
            </div>
          </div>
          <button type="button" className="kb-close kb-raised" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="kb-drawer-body">
          <div>
            <h4 className="kb-section-title">Profile</h4>
            <dl className="kb-rows">
              <div>
                <Define as="dt" def={KBASE_GLOSSARY.profileId}>
                  Profile ID
                </Define>
                <dd>
                  <code className="kb-mono">{user.profileId}</code>
                </dd>
              </div>
              <div>
                <Define as="dt" def={KBASE_GLOSSARY.username}>
                  Username
                </Define>
                <dd>@{user.username}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{user.createdAt.slice(0, 10)}</dd>
              </div>
              <div>
                <Define as="dt" def={KBASE_GLOSSARY.coins}>
                  Coins
                </Define>
                <dd>{user.coins}</dd>
              </div>
              <div>
                <dt>Last activity</dt>
                <dd>{timeAgo(user.lastActivityAt)}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h4 className="kb-section-title">Organizations ({user.orgs.length})</h4>
            {user.orgs.length === 0 && (
              <p className="kb-dim">Not a member of any organization.</p>
            )}
            {user.orgs.map((o) => (
              <div key={o.orgNumber} className="kb-owner">
                <strong>{o.name}</strong>
                <span className="kb-dim">#{o.orgNumber}</span>
                {o.isOwner ? <span className="chip chip-kvep">owner</span> : <span className="badge">member</span>}
              </div>
            ))}
          </div>

          <div>
            <h4 className="kb-section-title">Coins</h4>
            <p className="kb-verbose">
              A positive number grants coins; a negative number takes them back. The balance
              never goes below zero, and either way it lands in their wallet history and
              their mailbox.
            </p>
            <div className="kb-actions">
              <input
                type="number"
                className="kb-input"
                style={{ maxWidth: "10rem" }}
                placeholder="e.g. 50 or -20"
                aria-label="Coins to grant or revoke"
                value={coinDelta}
                onChange={(e) => setCoinDelta(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-quiet btn-small"
                disabled={busy || !coinDelta.trim() || Number(coinDelta) === 0}
                onClick={() =>
                  act(
                    () => admin.userCoins(user.profileId, Number(coinDelta)),
                    Number(coinDelta) > 0
                      ? `Granted ${coinDelta} coins to @${user.username}`
                      : `Revoked ${-Number(coinDelta)} coins from @${user.username}`,
                  ).then(() => setCoinDelta(""))
                }
              >
                {Number(coinDelta) < 0 ? "Revoke" : "Grant"}
              </button>
            </div>
          </div>

          <div>
            <h4 className="kb-section-title">Access</h4>
            <p className="kb-verbose">
              Suspending signs them out everywhere and refuses their next sign-in. It is
              reversible, and it keeps their completion records and audit trail intact.
            </p>
            <div className="kb-actions">
              <button
                type="button"
                className={`btn btn-small ${user.banned ? "btn-quiet" : "btn-danger"}`}
                disabled={busy}
                onClick={() =>
                  act(
                    () => admin.userBan(user.profileId, !user.banned),
                    user.banned
                      ? `@${user.username} can sign in again`
                      : `@${user.username} is suspended`,
                  )
                }
              >
                {user.banned ? "Lift suspension" : "Suspend this profile"}
              </button>
            </div>
          </div>

          <div>
            <h4 className="kb-section-title">Delete</h4>
            {user.ownsAny ? (
              <div className="kb-warn">
                <strong>This profile still owns an organization.</strong>
                Deleting it would leave that organization with nobody able to govern it.
                Deal with{" "}
                {user.orgs.filter((o) => o.isOwner).length === 1
                  ? "it"
                  : "them"}{" "}
                from the Organizations tab first:
                <ul style={{ margin: "0.4rem 0 0 1.1rem" }}>
                  {user.orgs
                    .filter((o) => o.isOwner)
                    .map((o) => (
                      <li key={o.orgNumber}>
                        {o.name} <span className="kb-dim">#{o.orgNumber}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <p className="kb-dim">
                Removes the profile, its memberships and its wallet history. Completion
                records and audit entries stay, because they record what happened in an
                organization rather than who is welcome in it.
              </p>
            )}
          </div>

          {error && <p className="kb-error">{error}</p>}
        </div>

        <footer className="kb-drawer-foot">
          {!user.ownsAny &&
            (confirmDelete ? (
              <>
                <span className="kb-dim">Delete @{user.username} permanently?</span>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await admin.userDelete(user.profileId);
                      onDeleted(`Deleted @${user.username}`);
                    }, `Deleted @${user.username}`)
                  }
                >
                  Yes, delete
                </button>
                <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-danger btn-small" onClick={() => setConfirmDelete(true)}>
                Delete this profile
              </button>
            ))}
          <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
            Close
          </button>
        </footer>
      </aside>
    </Overlay>
  );
}

// ── Coins ───────────────────────────────────────────────────────────────────

/**
 * Suggestions for the console's person fields. The console signs in with its own
 * credentials against the admin API, so it cannot use the member directory the rest of the
 * app searches — but it can search every account, which is exactly what an administrator
 * granting coins needs.
 */
async function adminPeopleSource(q: string): Promise<Suggestion[]> {
  const { users } = await admin.users(q);
  return users.slice(0, 8).map((u) => ({
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    alreadyMember: false,
  }));
}

function CoinsTab({ flash }: { flash: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [defaultCoins, setDefaultCoins] = useState<number | null>(null);
  // form.reset() cannot clear a controlled field, so the username box is remounted
  // instead once a grant has gone through.
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    admin
      .getSettings()
      .then((s) => setDefaultCoins(s.defaultCoins))
      .catch(() => undefined);
  }, []);

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-6">
        <section className="kb-panel kb-glass h-100">
          <div className="kb-panel-head">
            <div>
              <h2>
                <Define def={KBASE_GLOSSARY.defaultCoins}>Default coins for new profiles</Define>
              </h2>
              <p className="kb-verbose">
                How many Knowledge Coins every newly-registered profile starts with. Changing
                it affects future registrations only — nobody&rsquo;s existing balance moves.
              </p>
            </div>
          </div>
          <form
            className="kb-form kb-sunken"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              try {
                const res = await admin.setDefaultCoins(Number(d.get("defaultCoins")));
                setDefaultCoins(res.defaultCoins);
                flash(`New profiles now start with ${res.defaultCoins} coins`);
              } catch (err) {
                flash(err instanceof AdminApiError ? err.message : "Failed");
              }
            }}
          >
            <label className="kb-label">
              Starting balance
              <input
                name="defaultCoins"
                type="number"
                min={0}
                defaultValue={defaultCoins ?? 150}
                key={defaultCoins ?? "x"}
              />
            </label>
            <div className="kb-actions">
              <button className="btn btn-primary btn-small">Save default</button>
              <span className="kb-dim">
                Currently {defaultCoins ?? "…"} coins.
              </span>
            </div>
          </form>
        </section>
      </div>

      <div className="col-12 col-xl-6">
        <section className="kb-panel kb-glass h-100">
          <div className="kb-panel-head">
            <div>
              <h2>
                <Define def={KBASE_GLOSSARY.coins}>Gift or adjust a balance</Define>
              </h2>
              <p className="kb-verbose">
                Top up someone who has paid outside the platform, or claw back a mistake. A
                positive amount adds, a negative amount deducts, and the change lands in
                their wallet history and their mailbox either way.
              </p>
            </div>
          </div>
          <form
            className="kb-form kb-sunken"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const form = e.currentTarget;
              const d = new FormData(form);
              try {
                const res = await admin.giftCoins({
                  username: String(d.get("username")).trim(),
                  delta: Number(d.get("delta")),
                  note: String(d.get("note") || "") || undefined,
                });
                flash(`New balance: ${res.balance} coins`);
                form.reset();
                setFormKey((k) => k + 1);
              } catch (err) {
                setError(err instanceof AdminApiError ? err.message : "Failed");
              }
            }}
          >
            <div className="kb-form-grid">
              {/* The console knows every account on the platform, so asking an admin to
                  type a username from memory — and finding out it was wrong only after
                  the grant failed — was never necessary. */}
              <UsernameField
                key={formKey}
                label="Username"
                labelClassName="kb-label"
                required
                source={adminPeopleSource}
                emptyNote="No account matches that name."
              />
              <label className="kb-label">
                Amount (+ / −)
                <input name="delta" type="number" required defaultValue={150} />
              </label>
            </div>
            <label className="kb-label">
              Note (optional)
              <input name="note" placeholder="Why — they will see this" />
            </label>
            {error && <p className="kb-error">{error}</p>}
            <div className="kb-actions">
              <button className="btn btn-primary btn-small">Apply</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

// ── Administrators ──────────────────────────────────────────────────────────

function AdminsTab({ flash }: { flash: (m: string) => void }) {
  const [admins, setAdmins] = useState<Awaited<ReturnType<typeof admin.admins>>["admins"] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () => admin.admins().then((r) => setAdmins(r.admins)).catch(() => setAdmins([])),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-7">
        <section className="kb-panel kb-glass h-100">
          <div className="kb-panel-head">
            <div>
              <h2>Administrators</h2>
              <p className="kb-verbose">
                Everyone who can open this portal. Deactivating is the safe way to remove
                someone — their audit entries stay attributable, and it can be undone the day
                they come back.
              </p>
            </div>
          </div>

          {!admins && <div className="kb-skeleton" style={{ height: "6rem" }} />}

          {admins && (
            <div className="kb-tablewrap kb-sunken">
              <table className="kb-table">
                <thead>
                  <tr>
                    <th scope="col">Administrator</th>
                    <th scope="col">Last signed in</th>
                    <th scope="col">State</th>
                    <th scope="col">
                      <span className="visually-hidden">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.id} data-muted={!a.active}>
                      <td data-label="Administrator">
                        <strong>{a.displayName}</strong>
                        <br />
                        <span className="kb-dim">@{a.username}</span>
                      </td>
                      <td data-label="Last signed in">
                        {a.lastLoginAt ? a.lastLoginAt.slice(0, 10) : "never"}
                      </td>
                      <td data-label="State">
                        {a.active ? (
                          <span className="badge badge-ok">active</span>
                        ) : (
                          <span className="badge badge-danger">inactive</span>
                        )}
                      </td>
                      <td data-label="Action">
                        <button
                          type="button"
                          className="btn btn-quiet btn-small"
                          onClick={async () => {
                            try {
                              await admin.toggleAdmin(a.id);
                              load();
                            } catch (err) {
                              flash(err instanceof AdminApiError ? err.message : "Failed");
                            }
                          }}
                        >
                          {a.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="col-12 col-xl-5">
        <section className="kb-panel kb-glass h-100">
          <div className="kb-panel-head">
            <div>
              <h2>Add an administrator</h2>
              <p className="kb-verbose">
                They sign in with the temporary password once, and the portal refuses to show
                anything until they replace it.
              </p>
            </div>
          </div>
          <form
            className="kb-form kb-sunken"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              const form = e.currentTarget;
              const d = new FormData(form);
              try {
                await admin.addAdmin({
                  username: String(d.get("username")).trim(),
                  password: String(d.get("password")),
                  displayName: String(d.get("displayName")).trim(),
                });
                flash("Administrator added — they must change the password on first sign-in");
                form.reset();
                load();
              } catch (err) {
                setError(err instanceof AdminApiError ? err.message : "Failed");
              }
            }}
          >
            <label className="kb-label">
              Username
              <input name="username" required minLength={3} />
            </label>
            <label className="kb-label">
              Display name
              <input name="displayName" required />
            </label>
            <label className="kb-label">
              <Define def={KBASE_GLOSSARY.mustChangePassword}>Temporary password</Define>
              <input name="password" type="password" required minLength={10} />
            </label>
            {error && <p className="kb-error">{error}</p>}
            <div className="kb-actions">
              <button className="btn btn-primary btn-small">Add administrator</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

// ── Glossary ────────────────────────────────────────────────────────────────

function GlossaryTab() {
  const [q, setQ] = useState("");
  const entries = Object.entries(KBASE_GLOSSARY)
    .filter(([, d]) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        d.term.toLowerCase().includes(s) ||
        d.short.toLowerCase().includes(s) ||
        (d.detail ?? "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => a[1].term.localeCompare(b[1].term));

  return (
    <section className="kb-panel kb-glass">
      <div className="kb-panel-head">
        <div>
          <h2>What every property means</h2>
          <p className="kb-verbose">
            The same definitions the console shows when you point at a label, collected in
            one place. Nothing in this portal is a number whose meaning you are expected to
            already know.
          </p>
        </div>
      </div>

      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="visually-hidden" htmlFor="kb-gloss-q">
            Search the glossary
          </label>
          <input
            id="kb-gloss-q"
            className="kb-input"
            placeholder="Search a term or a definition…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <p className="kb-dim" style={{ margin: "0.7rem 0" }}>
        {entries.length} term{entries.length === 1 ? "" : "s"}
      </p>

      <div className="kb-glossary">
        {entries.map(([key, d]) => (
          <article key={key} className="kb-gloss kb-sunken">
            <h4>{d.term}</h4>
            <p>{d.short}</p>
            {d.detail && <p>{d.detail}</p>}
            {d.example && <code className="kb-mono">{d.example}</code>}
          </article>
        ))}
        {entries.length === 0 && (
          <div className="kb-empty kb-sunken">
            <strong>No match</strong>
            Nothing in the glossary mentions that.
          </div>
        )}
      </div>
    </section>
  );
}
