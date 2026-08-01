"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminOrgRow,
  AdminPlanRow,
  AdminRequestRow,
  AdminSession,
  AdminSummary,
} from "@vault/shared";
import { daysUntil, PLAN_REMINDER_DAYS } from "@vault/shared";
import { admin, AdminApiError, clearAdminSession, hasAdminSession } from "@/lib/admin-client";

type Tab = "orgs" | "requests" | "coins" | "admins";

/** The plan keys every "set plan" control offers — loaded once, shared by both forms. */
function usePlanKeys(): AdminPlanRow[] {
  const [plans, setPlans] = useState<AdminPlanRow[]>([]);
  useEffect(() => {
    admin.plans().then((r) => setPlans(r.plans.filter((p) => p.active))).catch(() => setPlans([]));
  }, []);
  return plans;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<AdminSession["admin"] | null>(null);
  const [tab, setTab] = useState<Tab>("orgs");
  const [toast, setToast] = useState<string | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);

  useEffect(() => {
    if (!hasAdminSession()) {
      router.replace("/kbase/login");
      return;
    }
    admin.me().then((r) => setMe(r.admin)).catch(() => router.replace("/kbase/login"));
  }, [router]);

  // Attention counters — polled so a new request or an approaching expiry surfaces on
  // the tab bar even while the admin is looking at another tab.
  useEffect(() => {
    if (!me || me.mustChangePassword) return;
    const load = () => admin.summary().then(setSummary).catch(() => undefined);
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [me]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  if (!me) return <main className="kv-auth-wrap" style={{ minHeight: "100vh" }}><p className="auth-sub">Loading…</p></main>;
  if (me.mustChangePassword) return <ChangePassword onDone={() => setMe({ ...me, mustChangePassword: false })} />;

  return (
    <main className="kbase-shell">
      <header className="kbase-header glass">
        <div>
          <span className="brand-mark" aria-hidden>✦</span>
          <strong> Knowledge Base Portal</strong>
          <span className="auth-sub"> · signed in as @{me.username}</span>
        </div>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => {
            clearAdminSession();
            router.replace("/kbase/login");
          }}
        >
          Sign out
        </button>
      </header>

      <nav className="kbase-tabs">
        {(["orgs", "requests", "coins", "admins"] as Tab[]).map((t) => {
          const count =
            t === "requests"
              ? summary?.pendingRequests ?? 0
              : t === "orgs"
                ? (summary?.expiringSoon ?? 0) + (summary?.expiredOrgs ?? 0)
                : 0;
          return (
            <button key={t} className={`btn btn-small ${tab === t ? "btn-primary" : "btn-quiet"}`} onClick={() => setTab(t)}>
              {t === "orgs" ? "Organizations" : t === "requests" ? "Requests" : t === "coins" ? "Coins" : "Admins"}
              {count > 0 && (
                <span className="badge badge-danger" style={{ marginLeft: "0.4rem" }}>{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {summary && (summary.pendingRequests > 0 || summary.expiringSoon > 0 || summary.expiredOrgs > 0) && (
        <p className="auth-sub" style={{ margin: "0 0 0.6rem" }}>
          {summary.pendingRequests > 0 && (
            <><strong>{summary.pendingRequests}</strong> request{summary.pendingRequests === 1 ? "" : "s"} waiting for a decision. </>
          )}
          {summary.expiringSoon > 0 && (
            <><strong>{summary.expiringSoon}</strong> organization{summary.expiringSoon === 1 ? "" : "s"} expiring within {Math.max(...PLAN_REMINDER_DAYS)} days. </>
          )}
          {summary.expiredOrgs > 0 && (
            <><strong>{summary.expiredOrgs}</strong> already expired.</>
          )}
        </p>
      )}

      {toast && <div className="kbase-toast glass">{toast}</div>}

      <section className="kbase-body">
        {tab === "orgs" && <OrgsTab flash={flash} />}
        {tab === "requests" && <RequestsTab flash={flash} />}
        {tab === "coins" && <CoinsTab flash={flash} />}
        {tab === "admins" && <AdminsTab flash={flash} />}
      </section>
    </main>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="kv-auth-wrap" style={{ minHeight: "100vh" }}>
      <form
        className="card kv-auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const d = new FormData(e.currentTarget);
          try {
            await admin.changePassword(String(d.get("cur")), String(d.get("new")), String(d.get("confirm")));
            onDone();
          } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Failed");
          }
        }}
      >
        <h1 className="h4 mb-1">Set a new password</h1>
        <p className="auth-sub mb-4">You must change the bootstrap password before continuing.</p>
        <input name="cur" type="password" className="form-control mb-2" placeholder="Current password" required />
        <input name="new" type="password" className="form-control mb-2" placeholder="New password (min 10)" required minLength={10} />
        <input name="confirm" type="password" className="form-control mb-3" placeholder="Retype new password" required />
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary w-100">Update password</button>
      </form>
    </main>
  );
}

type SortKey = "orgNumber" | "name" | "planKey" | "planStatus" | "planExpiresAt" | "memberCount" | "documentCount" | "uploadCount" | "roleCount" | "treeDepth" | "lastActivityAt";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function OrgsTab({ flash }: { flash: (m: string) => void }) {
  const [orgs, setOrgs] = useState<AdminOrgRow[] | null>(null);
  const [upgrading, setUpgrading] = useState<AdminOrgRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("orgNumber");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(
    () => admin.orgs().then((r) => { setOrgs(r.orgs); setUpdatedAt(new Date()); }).catch(() => setOrgs([])),
    [],
  );
  // Initial load + live auto-refresh every 8s so coins/depth/status changes show up.
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };

  const rows = (orgs ?? [])
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
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : "");
  const th = (k: SortKey, label: string) => (
    <th onClick={() => sortBy(k)} style={{ cursor: "pointer" }} title="Click to sort">{label}{arrow(k)}</th>
  );

  // Inline confirm (no native confirm() — it's blocked in some embedded browsers).
  const doPurge = async (o: AdminOrgRow) => {
    setConfirmDelete(null);
    try {
      await admin.purgeOrg(o.orgNumber);
      flash(`Permanently deleted ${o.name}`);
      load();
    } catch (e) {
      flash(e instanceof AdminApiError ? e.message : "Delete failed");
    }
  };

  return (
    <div className="kbase-panel glass">
      <div className="kbase-panel-head">
        <div>
          <h2>All organizations</h2>
          <p className="auth-sub">
            Live view — auto-refreshes every 8s{updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ""}.
          </p>
        </div>
        <div className="kbase-tools">
          <input className="kbase-search" placeholder="Search name, #, owner, plan…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-quiet btn-small" onClick={load}>↻ Refresh</button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="kbase-table">
          <thead>
            <tr>
              {th("orgNumber", "#")}{th("name", "Name")}<th>Owners</th>{th("planKey", "Plan")}
              {th("planStatus", "Status")}{th("planExpiresAt", "Expires")}{th("memberCount", "Members")}
              {th("documentCount", "Documents")}{th("uploadCount", "Uploads")}
              {th("roleCount", "Roles")}{th("treeDepth", "Depth")}{th("lastActivityAt", "Last activity")}<th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} data-deleted={!!o.deletedAt}>
                <td>{o.orgNumber}</td>
                <td>{o.name}{o.deletedAt && <span className="badge badge-danger"> deleted</span>}</td>
                <td>{o.ownerUsernames.map((u) => `@${u}`).join(", ") || "—"}</td>
                <td>{o.planKey ?? "—"}</td>
                <td><span className={`badge ${o.planStatus === "ACTIVE" ? "badge-ok" : o.planStatus === "EXPIRED" ? "badge-danger" : ""}`}>{o.planStatus.toLowerCase()}</span></td>
                <td><ExpiryCell o={o} /></td>
                <td>{o.memberCount}{o.memberLimit != null ? ` / ${o.memberLimit}` : ""}</td>
                <td>{o.documentCount}{o.documentLimit != null ? ` / ${o.documentLimit}` : ""}</td>
                <td>{o.uploadCount}{o.uploadLimit != null ? ` / ${o.uploadLimit}` : ""}</td>
                <td>{o.roleCount}</td>
                <td>{o.treeDepth}</td>
                <td title={o.lastActivityAt ?? ""}>{timeAgo(o.lastActivityAt)}</td>
                <td className="kbase-row-actions">
                  {confirmDelete === o.orgNumber ? (
                    <>
                      <span className="auth-sub" style={{ fontSize: "0.75rem" }}>Delete forever?</span>
                      <button className="btn btn-danger btn-small" onClick={() => doPurge(o)}>Yes, delete</button>
                      <button className="btn btn-quiet btn-small" onClick={() => setConfirmDelete(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-quiet btn-small" onClick={() => setUpgrading(o)}>Set plan</button>
                      <button className="btn btn-danger btn-small" onClick={() => setConfirmDelete(o.orgNumber)} title="Delete permanently and immediately">Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {orgs && rows.length === 0 && <tr><td colSpan={13} className="auth-sub">{q ? "No matches." : "No organizations yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {upgrading && (
        <UpgradeForm org={upgrading} onClose={() => setUpgrading(null)} onDone={(m) => { flash(m); setUpgrading(null); load(); }} />
      )}
    </div>
  );
}

/** Expiry cell: the date, plus how close it is, so the table itself flags what to chase. */
function ExpiryCell({ o }: { o: AdminOrgRow }) {
  if (!o.planExpiresAt) return <>—</>;
  const left = daysUntil(o.planExpiresAt);
  const warn = left <= Math.max(...PLAN_REMINDER_DAYS);
  return (
    <span className={left <= 0 ? "badge badge-danger" : warn ? "badge" : undefined}>
      {o.planExpiresAt.slice(0, 10)}
      {left <= 0 ? " · expired" : warn ? ` · ${left}d left` : ""}
    </span>
  );
}

function UpgradeForm({ org, onClose, onDone }: { org: AdminOrgRow; onClose: () => void; onDone: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const plans = usePlanKeys();
  return (
    <form
      className="kbase-inline glass"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const d = new FormData(e.currentTarget);
        const days = d.get("days") ? Number(d.get("days")) : null;
        const memberLimit = d.get("memberLimit") ? Number(d.get("memberLimit")) : null;
        const documentLimit = d.get("documentLimit") ? Number(d.get("documentLimit")) : null;
        const uploadLimit = d.get("uploadLimit") ? Number(d.get("uploadLimit")) : null;
        try {
          const res = await admin.upgradePlan({ orgNumber: org.orgNumber, planKey: String(d.get("planKey")), durationDays: days, memberLimit, documentLimit, uploadLimit, message: String(d.get("message") || "") || undefined });
          onDone(`${org.name} → ${res.planKey}${res.expiresAt ? ` (until ${res.expiresAt.slice(0, 10)})` : ""}`);
        } catch (err) {
          setError(err instanceof AdminApiError ? err.message : "Failed");
        }
      }}
    >
      <strong>Set plan for {org.name} (#{org.orgNumber})</strong>
      <p className="auth-sub" style={{ margin: 0 }}>
        Currently {org.planKey ?? "no plan"} · {org.planStatus.toLowerCase()}
        {org.planExpiresAt ? ` · expires ${org.planExpiresAt.slice(0, 10)}` : ""}
      </p>
      <label className="field"><span>Plan key</span>
        <select name="planKey" defaultValue={org.planKey ?? plans[0]?.key ?? ""}>
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key} — {p.name}
              {p.durationDays ? ` (${p.durationDays}d)` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field"><span>Duration (days — blank = unlimited/plan default)</span><input name="days" type="number" min={1} /></label>
      <label className="field"><span>Member limit (blank = use the plan&apos;s limit)</span><input name="memberLimit" type="number" min={1} defaultValue={org.memberLimit ?? undefined} /></label>
      <label className="field"><span>Custom-document limit (Studio; blank = plan&apos;s limit)</span><input name="documentLimit" type="number" min={1} defaultValue={org.documentLimit ?? undefined} /></label>
      <label className="field"><span>Upload limit (files &amp; links; blank = plan&apos;s limit)</span><input name="uploadLimit" type="number" min={1} defaultValue={org.uploadLimit ?? undefined} /></label>
      <label className="field"><span>Message to owners (optional)</span><input name="message" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="tree-actions">
        <button className="btn btn-primary btn-small">Apply</button>
        <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

function RequestsTab({ flash }: { flash: (m: string) => void }) {
  const [reqs, setReqs] = useState<AdminRequestRow[] | null>(null);
  const load = useCallback(() => admin.requests().then((r) => setReqs(r.requests)).catch(() => setReqs([])), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // live: new requests appear without a manual refresh
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="kbase-panel glass">
      <div className="kbase-panel-head">
        <div>
          <h2>Requests</h2>
          <p className="auth-sub">Users asking to create an organization, propose a custom plan, restore an expired org, or renew/upgrade an existing one. Live — refreshes every 8s.</p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={load}>↻ Refresh</button>
      </div>
      {reqs?.length === 0 && <p className="auth-sub">No requests yet.</p>}
      <ul className="owner-list">
        {reqs?.map((r) => (
          <li key={r.id} className="kbase-request">
            <div>
              <strong>@{r.requesterUsername}</strong> <span className="auth-sub">({r.requesterDisplayName}) · {r.requesterCoins} coins</span>
              <div><span className="chip">{r.kind}</span> <span className={`badge ${r.status === "APPROVED" ? "badge-ok" : r.status === "DENIED" ? "badge-danger" : ""}`}>{r.status.toLowerCase()}</span>
                {r.planKey && <span className="badge"> {r.planKey}</span>}
                {r.requestedDays != null && <span className="auth-sub"> · wants {r.requestedDays}d</span>}
                {r.offeredCoins != null && <span className="auth-sub"> · offers {r.offeredCoins} coins</span>}
                {r.targetOrgNumber != null && (
                  <span className="auth-sub">
                    {" "}· {r.targetOrgName ?? "org"} #{r.targetOrgNumber}
                    {r.targetOrgPlanKey && ` · now on ${r.targetOrgPlanKey}`}
                    {r.targetOrgPlanExpiresAt && ` until ${r.targetOrgPlanExpiresAt.slice(0, 10)}`}
                  </span>
                )}
              </div>
              {r.message && <p className="auth-sub">“{r.message}”</p>}
              {r.adminMessage && <p className="auth-sub">Reply: {r.adminMessage}</p>}
            </div>
            {r.status === "PENDING" && <DecideForm r={r} onDone={(m) => { flash(m); load(); }} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecideForm({ r, onDone }: { r: AdminRequestRow; onDone: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const plans = usePlanKeys();
  // A renewal targets an org that already exists — approving APPLIES the plan there and
  // then, so this form sets the terms directly instead of minting a code to redeem.
  const isRenewal = r.kind === "PLAN_RENEWAL";

  if (otp) {
    return (
      <div className="kbase-inline glass">
        <strong>Approved — share this code with @{r.requesterUsername}</strong>
        <div className="kbase-otp">{otp}</div>
        <p className="auth-sub">Valid 24 hours. It was also delivered to their notifications.</p>
      </div>
    );
  }
  return (
    <form
      className="kbase-inline glass"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const d = new FormData(e.currentTarget);
        const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "deny" ? "DENY" : "APPROVE";
        const num = (k: string) => (d.get(k) ? Number(d.get(k)) : undefined);
        try {
          const res = await admin.decide(r.id, {
            decision,
            grantedDays: num("days"),
            priceCoins: num("price"),
            adminMessage: String(d.get("message") || "") || undefined,
            ...(isRenewal
              ? {
                  applyPlanKey: String(d.get("applyPlanKey") || "") || undefined,
                  memberLimit: d.get("memberLimit") ? Number(d.get("memberLimit")) : null,
                  documentLimit: d.get("documentLimit") ? Number(d.get("documentLimit")) : null,
                  uploadLimit: d.get("uploadLimit") ? Number(d.get("uploadLimit")) : null,
                }
              : {}),
            ...(num("grantCoins") ? { grantCoins: num("grantCoins") } : {}),
          });
          if (res.otp) { setOtp(res.otp); onDone(`Approved @${r.requesterUsername}`); }
          else if (decision === "APPROVE" && isRenewal) {
            onDone(`${r.targetOrgName ?? `#${r.targetOrgNumber}`} → ${res.planKey}${res.expiresAt ? ` (until ${res.expiresAt.slice(0, 10)})` : ""}`);
          } else onDone(`Denied @${r.requesterUsername}`);
        } catch (err) {
          setError(err instanceof AdminApiError ? err.message : "Failed");
        }
      }}
    >
      {isRenewal && (
        <>
          <strong>Renew {r.targetOrgName ?? `org #${r.targetOrgNumber}`}</strong>
          <p className="auth-sub" style={{ margin: 0 }}>
            Approving applies this plan immediately — no access code is issued.
          </p>
          <label className="field"><span>Plan to apply</span>
            <select name="applyPlanKey" defaultValue={r.planKey ?? r.targetOrgPlanKey ?? plans[0]?.key ?? ""}>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.key} — {p.name}{p.durationDays ? ` (${p.durationDays}d)` : ""}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="field"><span>Granted days{isRenewal ? " (blank = the plan's own duration)" : ""}</span><input name="days" type="number" min={1} defaultValue={r.requestedDays ?? undefined} /></label>
      <label className="field"><span>Price (coins)</span><input name="price" type="number" min={0} defaultValue={r.offeredCoins ?? undefined} /></label>
      {isRenewal && (
        <>
          <label className="field"><span>Member limit (blank = the plan&apos;s limit)</span><input name="memberLimit" type="number" min={1} /></label>
          <label className="field"><span>Custom-document limit (blank = plan&apos;s)</span><input name="documentLimit" type="number" min={1} /></label>
          <label className="field"><span>Upload limit (blank = plan&apos;s)</span><input name="uploadLimit" type="number" min={1} /></label>
        </>
      )}
      <label className="field">
        <span>Gift coins with this decision (optional)</span>
        <input name="grantCoins" type="number" placeholder="e.g. 200" />
      </label>
      <label className="field"><span>Message</span><input name="message" placeholder="Custom note to the user" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="tree-actions">
        <button className="btn btn-primary btn-small" value="approve">
          {isRenewal ? "Approve + apply plan" : "Approve + issue OTP"}
        </button>
        <button className="btn btn-danger btn-small" value="deny">Deny</button>
      </div>
    </form>
  );
}

function CoinsTab({ flash }: { flash: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [defaultCoins, setDefaultCoins] = useState<number | null>(null);
  useEffect(() => { admin.getSettings().then((s) => setDefaultCoins(s.defaultCoins)).catch(() => undefined); }, []);
  return (
    <div className="kbase-panel glass">
      <h2>Knowledge Coins</h2>

      <div className="kbase-inline" style={{ marginTop: 0 }}>
        <strong>Default coins for new users</strong>
        <p className="auth-sub" style={{ margin: 0 }}>How many coins every newly-registered profile starts with. Change it any time (e.g. from 150 to 50).</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            try {
              const res = await admin.setDefaultCoins(Number(d.get("defaultCoins")));
              setDefaultCoins(res.defaultCoins);
              flash(`New users now start with ${res.defaultCoins} coins`);
            } catch (err) {
              flash(err instanceof AdminApiError ? err.message : "Failed");
            }
          }}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input name="defaultCoins" type="number" min={0} defaultValue={defaultCoins ?? 150} key={defaultCoins ?? "x"} style={{ maxWidth: 140 }} />
          <button className="btn btn-primary btn-small">Save default</button>
        </form>
      </div>

      <h3 className="learning-h" style={{ marginTop: "1.2rem" }}>Gift / adjust a user</h3>
      <p className="auth-sub">Gift or adjust a user's coin balance (top-up from your end). Positive adds, negative deducts.</p>
      <form
        className="kbase-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const d = new FormData(e.currentTarget);
          try {
            const res = await admin.giftCoins({ username: String(d.get("username")).trim(), delta: Number(d.get("delta")), note: String(d.get("note") || "") || undefined });
            flash(`New balance: ${res.balance} coins`);
            (e.target as HTMLFormElement).reset();
          } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Failed");
          }
        }}
      >
        <label className="field"><span>Username</span><input name="username" required placeholder="their-username" /></label>
        <label className="field"><span>Amount (+/-)</span><input name="delta" type="number" required defaultValue={150} /></label>
        <label className="field"><span>Note (optional)</span><input name="note" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-small">Apply</button>
      </form>
    </div>
  );
}

function AdminsTab({ flash }: { flash: (m: string) => void }) {
  const [admins, setAdmins] = useState<Awaited<ReturnType<typeof admin.admins>>["admins"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => admin.admins().then((r) => setAdmins(r.admins)).catch(() => setAdmins([])), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="kbase-panel glass">
      <h2>Administrators</h2>
      <p className="auth-sub">Anyone on the project can be added as a super-admin with full portal access.</p>
      <ul className="owner-list">
        {admins?.map((a) => (
          <li key={a.id} className="account-row">
            <span><strong>@{a.username}</strong> <span className="auth-sub">{a.displayName}{a.lastLoginAt ? ` · last in ${a.lastLoginAt.slice(0, 10)}` : ""}</span> {!a.active && <span className="badge badge-danger">inactive</span>}</span>
            <button className="btn btn-quiet btn-small" onClick={async () => { try { await admin.toggleAdmin(a.id); load(); } catch (err) { flash(err instanceof AdminApiError ? err.message : "Failed"); } }}>
              {a.active ? "Deactivate" : "Reactivate"}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="kbase-inline"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const d = new FormData(e.currentTarget);
          try {
            await admin.addAdmin({ username: String(d.get("username")).trim(), password: String(d.get("password")), displayName: String(d.get("displayName")).trim() });
            flash("Admin added (must change password on first login)");
            (e.target as HTMLFormElement).reset();
            load();
          } catch (err) {
            setError(err instanceof AdminApiError ? err.message : "Failed");
          }
        }}
      >
        <strong>Add an administrator</strong>
        <label className="field"><span>Username</span><input name="username" required minLength={3} /></label>
        <label className="field"><span>Display name</span><input name="displayName" required /></label>
        <label className="field"><span>Temporary password</span><input name="password" type="password" required minLength={10} /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-small">Add admin</button>
      </form>
    </div>
  );
}
