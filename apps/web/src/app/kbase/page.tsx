"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminOrgRow, AdminRequestRow, AdminSession } from "@vault/shared";
import { admin, AdminApiError, clearAdminSession, hasAdminSession } from "@/lib/admin-client";

type Tab = "orgs" | "requests" | "coins" | "admins";

export default function AdminDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<AdminSession["admin"] | null>(null);
  const [tab, setTab] = useState<Tab>("orgs");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAdminSession()) {
      router.replace("/kbase/login");
      return;
    }
    admin.me().then((r) => setMe(r.admin)).catch(() => router.replace("/kbase/login"));
  }, [router]);

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
        {(["orgs", "requests", "coins", "admins"] as Tab[]).map((t) => (
          <button key={t} className={`btn btn-small ${tab === t ? "btn-primary" : "btn-quiet"}`} onClick={() => setTab(t)}>
            {t === "orgs" ? "Organizations" : t === "requests" ? "Requests" : t === "coins" ? "Coins" : "Admins"}
          </button>
        ))}
      </nav>

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

function OrgsTab({ flash }: { flash: (m: string) => void }) {
  const [orgs, setOrgs] = useState<AdminOrgRow[] | null>(null);
  const [upgrading, setUpgrading] = useState<AdminOrgRow | null>(null);
  const load = useCallback(() => admin.orgs().then((r) => setOrgs(r.orgs)).catch(() => setOrgs([])), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="kbase-panel glass">
      <h2>All organizations</h2>
      <p className="auth-sub">Every organization on the platform, with its plan, expiry and structure depth.</p>
      <div className="table-scroll">
        <table className="kbase-table">
          <thead>
            <tr><th>#</th><th>Name</th><th>Owners</th><th>Plan</th><th>Status</th><th>Expires</th><th>Members</th><th>Roles</th><th>Depth</th><th></th></tr>
          </thead>
          <tbody>
            {orgs?.map((o) => (
              <tr key={o.id} data-deleted={!!o.deletedAt}>
                <td>{o.orgNumber}</td>
                <td>{o.name}{o.deletedAt && <span className="badge badge-danger"> deleted</span>}</td>
                <td>{o.ownerUsernames.map((u) => `@${u}`).join(", ")}</td>
                <td>{o.planKey ?? "—"}</td>
                <td><span className={`badge ${o.planStatus === "ACTIVE" ? "badge-ok" : o.planStatus === "EXPIRED" ? "badge-danger" : ""}`}>{o.planStatus.toLowerCase()}</span></td>
                <td>{o.planExpiresAt ? o.planExpiresAt.slice(0, 10) : "—"}</td>
                <td>{o.memberCount}</td>
                <td>{o.roleCount}</td>
                <td>{o.treeDepth}</td>
                <td><button className="btn btn-quiet btn-small" onClick={() => setUpgrading(o)}>Set plan</button></td>
              </tr>
            ))}
            {orgs?.length === 0 && <tr><td colSpan={10} className="auth-sub">No organizations yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {upgrading && (
        <UpgradeForm org={upgrading} onClose={() => setUpgrading(null)} onDone={(m) => { flash(m); setUpgrading(null); load(); }} />
      )}
    </div>
  );
}

function UpgradeForm({ org, onClose, onDone }: { org: AdminOrgRow; onClose: () => void; onDone: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="kbase-inline glass"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const d = new FormData(e.currentTarget);
        const days = d.get("days") ? Number(d.get("days")) : null;
        try {
          const res = await admin.upgradePlan({ orgNumber: org.orgNumber, planKey: String(d.get("planKey")), durationDays: days, message: String(d.get("message") || "") || undefined });
          onDone(`${org.name} → ${res.planKey}${res.expiresAt ? ` (until ${res.expiresAt.slice(0, 10)})` : ""}`);
        } catch (err) {
          setError(err instanceof AdminApiError ? err.message : "Failed");
        }
      }}
    >
      <strong>Set plan for {org.name} (#{org.orgNumber})</strong>
      <label className="field"><span>Plan key</span>
        <select name="planKey" defaultValue="organisation">
          <option value="demo">demo</option>
          <option value="monthly">monthly</option>
          <option value="organisation">organisation</option>
        </select>
      </label>
      <label className="field"><span>Duration (days — blank = unlimited/plan default)</span><input name="days" type="number" min={1} /></label>
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
  useEffect(() => { load(); }, [load]);

  return (
    <div className="kbase-panel glass">
      <h2>Requests</h2>
      <p className="auth-sub">Users asking to create an organization, propose a custom plan, or restore an expired org.</p>
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
                {r.targetOrgNumber != null && <span className="auth-sub"> · org #{r.targetOrgNumber}</span>}
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
        try {
          const res = await admin.decide(r.id, {
            decision,
            grantedDays: d.get("days") ? Number(d.get("days")) : undefined,
            priceCoins: d.get("price") ? Number(d.get("price")) : undefined,
            adminMessage: String(d.get("message") || "") || undefined,
          });
          if (res.otp) { setOtp(res.otp); onDone(`Approved @${r.requesterUsername}`); }
          else onDone(`Denied @${r.requesterUsername}`);
        } catch (err) {
          setError(err instanceof AdminApiError ? err.message : "Failed");
        }
      }}
    >
      <label className="field"><span>Granted days</span><input name="days" type="number" min={1} defaultValue={r.requestedDays ?? undefined} /></label>
      <label className="field"><span>Price (coins)</span><input name="price" type="number" min={0} defaultValue={r.offeredCoins ?? undefined} /></label>
      <label className="field"><span>Message</span><input name="message" placeholder="Custom note to the user" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="tree-actions">
        <button className="btn btn-primary btn-small" value="approve">Approve + issue OTP</button>
        <button className="btn btn-danger btn-small" value="deny">Deny</button>
      </div>
    </form>
  );
}

function CoinsTab({ flash }: { flash: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="kbase-panel glass">
      <h2>Knowledge Coins</h2>
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
