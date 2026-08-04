"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PLATFORM_REQUEST_LABELS,
  type AdminOrgDetail,
  type AdminOrgRow,
  type AdminRequestRow,
  type AdminSession,
} from "@vault/shared";
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

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

const fmtLimit = (used: number, limit: number | null) =>
  limit == null ? `${used} / ∞` : `${used} / ${limit}`;

/**
 * The organizations console. Every org is a card: select several to message or delete
 * them together, or open one to get its full property table — where every count, date and
 * plan field is editable by hand.
 */
function OrgsTab({ flash }: { flash: (m: string) => void }) {
  const [orgs, setOrgs] = useState<AdminOrgRow[] | null>(null);
  const [detail, setDetail] = useState<AdminOrgDetail | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [composing, setComposing] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("orgNumber");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(
    () =>
      admin
        .orgs()
        .then((r) => {
          setOrgs(r.orgs);
          setUpdatedAt(new Date());
        })
        .catch(() => setOrgs([])),
    [],
  );
  // Initial load + live auto-refresh so counts and plan states stay current.
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const openDetail = async (orgNumber: number) => {
    try {
      setDetail(await admin.orgDetail(orgNumber));
    } catch (e) {
      flash(e instanceof AdminApiError ? e.message : "Could not open that organization");
    }
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
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });

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
    <div className="kbase-panel glass">
      <div className="kbase-panel-head">
        <div>
          <h2>All organizations</h2>
          <p className="auth-sub">
            Click a card to open its property table. Tick several to message or delete them
            together. Live — refreshes every 8s
            {updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ""}.
          </p>
        </div>
        <div className="kbase-tools">
          <input
            className="kbase-search"
            placeholder="Search name, #, owner, plan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="kbase-search"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort by"
          >
            <option value="orgNumber">Sort: number</option>
            <option value="name">Sort: name</option>
            <option value="planKey">Sort: plan</option>
            <option value="planStatus">Sort: status</option>
            <option value="planExpiresAt">Sort: expiry</option>
            <option value="memberCount">Sort: people</option>
            <option value="documentCount">Sort: documents</option>
            <option value="storageUsedMb">Sort: storage</option>
            <option value="lastActivityAt">Sort: last activity</option>
          </select>
          <button className="btn btn-quiet btn-small" onClick={load}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Selection toolbar — appears only when something is ticked. */}
      {selected.size > 0 && (
        <div className="kbase-selectbar">
          <strong>{selected.size} selected</strong>
          <button className="btn btn-primary btn-small" onClick={() => setComposing(true)}>
            ✉ Send message
          </button>
          {confirmBulk ? (
            <>
              <span className="auth-sub">Delete all {selected.size} forever?</span>
              <button className="btn btn-danger btn-small" onClick={doBulkDelete}>
                Yes, delete
              </button>
              <button className="btn btn-quiet btn-small" onClick={() => setConfirmBulk(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-danger btn-small" onClick={() => setConfirmBulk(true)}>
              Delete selected
            </button>
          )}
          <button className="btn btn-quiet btn-small" onClick={() => setSelected(new Set())}>
            Clear selection
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

      <div className="org-card-grid">
        {rows.map((o) => (
          <article
            key={o.id}
            className="admin-org-card glass"
            data-selected={selected.has(o.orgNumber)}
            data-deleted={!!o.deletedAt}
          >
            <label className="admin-org-pick">
              <input
                type="checkbox"
                checked={selected.has(o.orgNumber)}
                onChange={() => toggle(o.orgNumber)}
                aria-label={`Select ${o.name}`}
              />
            </label>
            <button className="admin-org-open" onClick={() => openDetail(o.orgNumber)}>
              <header>
                <h3>{o.name}</h3>
                <span className="chip">#{o.orgNumber}</span>
                {o.deletedAt && <span className="badge badge-danger">deleted</span>}
              </header>
              <p className="auth-sub">
                {o.ownerUsernames.map((u) => `@${u}`).join(", ") || "no owners"}
              </p>
              <div className="admin-org-tags">
                <span className="chip">{o.planKey ?? "no plan"}</span>
                <span
                  className={`badge ${
                    o.planStatus === "ACTIVE"
                      ? "badge-ok"
                      : o.planStatus === "EXPIRED"
                        ? "badge-danger"
                        : ""
                  }`}
                >
                  {o.planStatus.toLowerCase()}
                </span>
                {o.planExpiresAt && (
                  <span className="auth-sub">until {o.planExpiresAt.slice(0, 10)}</span>
                )}
              </div>
              <dl className="admin-org-stats">
                <div>
                  <dt>People</dt>
                  <dd>{fmtLimit(o.memberCount, o.memberLimit)}</dd>
                </div>
                <div>
                  <dt>Documents</dt>
                  <dd>{fmtLimit(o.documentCount, o.documentLimit)}</dd>
                </div>
                <div>
                  <dt>Uploads</dt>
                  <dd>{fmtLimit(o.uploadCount, o.uploadLimit)}</dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd>
                    {o.storageUsedMb} MB{o.storageLimitMb != null ? ` / ${o.storageLimitMb}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Roles</dt>
                  <dd>
                    {o.roleCount} · depth {o.treeDepth}
                  </dd>
                </div>
                <div>
                  <dt>Active</dt>
                  <dd>{timeAgo(o.lastActivityAt)}</dd>
                </div>
              </dl>
              <span className="admin-org-cta">Open properties →</span>
            </button>
          </article>
        ))}
        {orgs && rows.length === 0 && (
          <p className="auth-sub">{q ? "No matches." : "No organizations yet."}</p>
        )}
      </div>

      {detail && (
        <OrgDetailPanel
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
    </div>
  );
}

/** The expanded card: a property/value table where everything is editable in place. */
function OrgDetailPanel({
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
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const valueOf = (key: string, fallback: string | number | null) =>
    edits[key] !== undefined ? edits[key] : fallback == null ? "" : String(fallback);

  const save = async () => {
    setError(null);
    const num = (k: string) => {
      if (edits[k] === undefined) return undefined;
      return edits[k].trim() === "" ? null : Number(edits[k]);
    };
    try {
      await admin.setOrg({
        orgNumber: detail.org.orgNumber,
        ...(edits.name !== undefined ? { name: edits.name } : {}),
        ...(edits.planKey !== undefined ? { planKey: edits.planKey || null } : {}),
        ...(edits.planStatus !== undefined
          ? { planStatus: edits.planStatus as "NONE" | "DEMO" | "ACTIVE" | "EXPIRED" }
          : {}),
        ...(edits.planExpiresAt !== undefined
          ? { planExpiresAt: edits.planExpiresAt || null }
          : {}),
        ...(num("memberLimit") !== undefined ? { memberLimit: num("memberLimit") } : {}),
        ...(num("documentLimit") !== undefined ? { documentLimit: num("documentLimit") } : {}),
        ...(num("uploadLimit") !== undefined ? { uploadLimit: num("uploadLimit") } : {}),
        ...(num("storageLimitMb") !== undefined ? { storageLimitMb: num("storageLimitMb") } : {}),
      });
      setEdits({});
      onSaved(`Saved ${detail.org.name}`);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Save failed");
    }
  };

  return (
    <div className="kbase-detail glass">
      <header className="kbase-detail-head">
        <div>
          <h3>
            {detail.org.name} <span className="chip">#{detail.org.orgNumber}</span>
          </h3>
          <p className="auth-sub">
            Owners: {detail.owners.map((o) => `@${o.username}`).join(", ") || "none"} · created{" "}
            {detail.org.createdAt.slice(0, 10)}
          </p>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="table-scroll">
        <table className="kbase-table kbase-props">
          <thead>
            <tr>
              <th>Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {detail.properties.map((p) => (
              <tr key={p.key}>
                <th scope="row">
                  {p.label}
                  {p.hint && <span className="auth-sub kbase-prop-hint">{p.hint}</span>}
                </th>
                <td>
                  {p.type === "readonly" ? (
                    <span>{p.value ?? "—"}</span>
                  ) : p.type === "select" ? (
                    <select
                      value={valueOf(p.key, p.value)}
                      onChange={(e) => setEdits((v) => ({ ...v, [p.key]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {(p.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={p.type === "number" ? "number" : p.type === "date" ? "date" : "text"}
                      value={valueOf(p.key, p.value)}
                      placeholder={p.type === "number" ? "blank = plan default" : ""}
                      onChange={(e) => setEdits((v) => ({ ...v, [p.key]: e.target.value }))}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="kbase-detail-actions">
        <button className="btn btn-primary btn-small" disabled={Object.keys(edits).length === 0} onClick={save}>
          Save changes
        </button>
        <button className="btn btn-quiet btn-small" onClick={() => setMessaging((v) => !v)}>
          ✉ Message the owners
        </button>
        {confirmDelete ? (
          <>
            <span className="auth-sub">Delete forever?</span>
            <button
              className="btn btn-danger btn-small"
              onClick={async () => {
                try {
                  await admin.purgeOrg(detail.org.orgNumber);
                  onDeleted(`Permanently deleted ${detail.org.name}`);
                } catch (e) {
                  setError(e instanceof AdminApiError ? e.message : "Delete failed");
                }
              }}
            >
              Yes, delete
            </button>
            <button className="btn btn-quiet btn-small" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn-danger btn-small" onClick={() => setConfirmDelete(true)}>
            Delete organization
          </button>
        )}
      </div>

      {messaging && (
        <BroadcastForm
          orgNumbers={[detail.org.orgNumber]}
          onClose={() => setMessaging(false)}
          onDone={(m) => {
            onSaved(m);
            setMessaging(false);
          }}
        />
      )}

      {detail.recentActivity.length > 0 && (
        <div className="kbase-detail-activity">
          <strong>Recent activity</strong>
          <ul className="owner-list">
            {detail.recentActivity.map((a, i) => (
              <li key={i} className="auth-sub">
                {a.action} · {new Date(a.at).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Compose a message to the owners of one or many organizations. */
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
  return (
    <form
      className="kbase-inline glass"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
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
        }
      }}
    >
      <strong>
        Message the owners of {orgNumbers.length} organization{orgNumbers.length === 1 ? "" : "s"}
      </strong>
      <p className="auth-sub" style={{ margin: 0 }}>
        Lands in each owner&apos;s mailbox under &ldquo;Knowledge Base&rdquo;. Use it for
        announcements, offers and notices.
      </p>
      <label className="field">
        <span>Subject</span>
        <input name="subject" required maxLength={120} placeholder="New yearly plan — two months free" />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea name="message" required rows={4} maxLength={2000} />
      </label>
      <label className="field">
        <span>Priority</span>
        <select name="priority" defaultValue="NORMAL">
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High — pins it to the top of their mailbox</option>
        </select>
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="tree-actions">
        <button className="btn btn-primary btn-small">Send</button>
        <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
          Cancel
        </button>
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

  const pending = reqs?.filter((r) => r.status === "PENDING") ?? [];
  const served = reqs?.filter((r) => r.status !== "PENDING") ?? [];

  return (
    <div className="kbase-panel glass">
      <div className="kbase-panel-head">
        <div>
          <h2>Requests</h2>
          <p className="auth-sub">
            Users asking to create an organization, upgrade a plan, propose custom terms, or
            restore an expired org. <strong>Approving is one click</strong> — the plan&apos;s own
            terms are applied, and the code goes straight to the requester&apos;s mailbox.
            Live — refreshes every 8s.
          </p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={load}>↻ Refresh</button>
      </div>
      {pending.length === 0 && <p className="auth-sub">Nothing waiting on you. 🎉</p>}
      <ul className="owner-list">
        {pending.map((r) => (
          <li key={r.id} className="kbase-request">
            <div>
              <strong>@{r.requesterUsername}</strong>{" "}
              <span className="auth-sub">({r.requesterDisplayName}) · {r.requesterCoins} coins</span>
              <div>
                <span className="chip">{PLATFORM_REQUEST_LABELS[r.kind]}</span>{" "}
                {r.planKey && <span className="badge">{r.planName ?? r.planKey}</span>}
                {r.targetOrgNumber != null && <span className="auth-sub"> · org #{r.targetOrgNumber}</span>}
              </div>
              {/* What approving will actually do — no data entry needed to see it. */}
              <p className="kbase-terms auth-sub">
                Will grant:{" "}
                {r.requestedDays ?? r.planDurationDays ?? "unlimited"} days ·{" "}
                {r.requestedMembers ?? r.planMemberLimit ?? "unlimited"} people ·{" "}
                {r.requestedDocuments ?? r.planDocumentLimit ?? "unlimited"} custom documents ·{" "}
                {r.requestedUploads ?? r.planUploadLimit ?? "unlimited"} uploads · costs{" "}
                {r.offeredCoins ?? r.planPriceCoins ?? 0} coins
              </p>
              {r.message && <p className="auth-sub">&ldquo;{r.message}&rdquo;</p>}
            </div>
            <DecideForm r={r} onDone={(m) => { flash(m); load(); }} />
          </li>
        ))}
      </ul>

      {served.length > 0 && (
        <details className="kbase-served">
          <summary>Recently served ({served.length})</summary>
          <ul className="owner-list">
            {served.map((r) => (
              <li key={r.id} className="account-row">
                <span>
                  <span className="chip">{PLATFORM_REQUEST_LABELS[r.kind]}</span> @{r.requesterUsername}{" "}
                  <span className={`badge ${r.status === "APPROVED" || r.status === "USED" ? "badge-ok" : r.status === "DENIED" ? "badge-danger" : ""}`}>
                    {r.status.toLowerCase()}
                  </span>
                  {r.grantedDays != null && <span className="auth-sub"> · {r.grantedDays} days</span>}
                  {r.adminMessage && <span className="auth-sub"> · {r.adminMessage}</span>}
                </span>
                <span className="auth-sub">{r.decidedAt?.slice(0, 10) ?? ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Approve or deny. Approve needs nothing at all — the server fills every term from the
 * plan the user chose. "Adjust terms" is there for the exception, not the rule.
 */
function DecideForm({ r, onDone }: { r: AdminRequestRow; onDone: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  if (otp) {
    return (
      <div className="kbase-inline glass">
        <strong>Approved — this code also went to @{r.requesterUsername}&apos;s mailbox</strong>
        <div className="kbase-otp">{otp}</div>
        <p className="auth-sub">Valid 24 hours.</p>
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
      else if (res.appliedOrgNumber) onDone(`Upgraded org #${res.appliedOrgNumber} for @${r.requesterUsername}`);
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
      className="kbase-inline glass"
      onSubmit={(e) => {
        e.preventDefault();
        decide("APPROVE", e.currentTarget);
      }}
    >
      {!advanced ? (
        <p className="auth-sub" style={{ margin: 0 }}>
          Approving applies the terms above as they stand.{" "}
          <button type="button" className="link-btn" onClick={() => setAdvanced(true)}>
            Adjust terms
          </button>
        </p>
      ) : (
        <>
          <p className="auth-sub" style={{ margin: 0 }}>
            Blank means &ldquo;use what the plan says&rdquo;. Only fill in what you want to change.
          </p>
          <label className="field"><span>Days</span><input name="days" type="number" min={1} placeholder={String(r.requestedDays ?? r.planDurationDays ?? "unlimited")} /></label>
          <label className="field"><span>Price (coins)</span><input name="price" type="number" min={0} placeholder={String(r.offeredCoins ?? r.planPriceCoins ?? 0)} /></label>
          <label className="field"><span>People limit</span><input name="members" type="number" min={0} placeholder={String(r.requestedMembers ?? r.planMemberLimit ?? "unlimited")} /></label>
          <label className="field"><span>Custom documents</span><input name="documents" type="number" min={0} placeholder={String(r.requestedDocuments ?? r.planDocumentLimit ?? "unlimited")} /></label>
          <label className="field"><span>Uploads</span><input name="uploads" type="number" min={0} placeholder={String(r.requestedUploads ?? r.planUploadLimit ?? "unlimited")} /></label>
        </>
      )}
      <label className="field"><span>Message (optional)</span><input name="message" placeholder="A note to the requester" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="tree-actions">
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
