"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createOrgSchema } from "@vault/shared";
import type { PlatformRequestView, PricingPlanView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { pricing } from "@/lib/pricing-client";
import { AppShell } from "@/components/AppShell";
import { useDialogs } from "@/components/dialogs";
import { IconGrid, IconHelp, IconUser } from "@/components/icons";
import { StorageSetupFields, emptyStorageConfig } from "@/components/StorageSetupFields";
import type { StorageConfigInput } from "@vault/shared";

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/pricing", label: "Pricing", icon: <span aria-hidden>🪙</span> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

export default function NewOrgPage() {
  const router = useRouter();
  const dialogs = useDialogs();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where this organization's documents will live (docs/structure.md §9.3). Tested
  // before the organization is created, so a failed test costs nothing.
  const [storage, setStorage] = useState<StorageConfigInput>(emptyStorageConfig);

  // Plan chooser (shown beside the form)
  const [plans, setPlans] = useState<PricingPlanView[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [mine, setMine] = useState<PlatformRequestView[]>([]);
  const [customFor, setCustomFor] = useState<string | null>(null);

  const loadPlans = useCallback(() => {
    pricing.view().then((v) => setPlans(v.plans)).catch(() => undefined);
    pricing.wallet().then((w) => setCoins(w.coins)).catch(() => undefined);
    pricing.myRequests().then((r) => setMine(r.requests)).catch(() => undefined);
  }, []);
  useEffect(() => loadPlans(), [loadPlans]);

  const requestFixed = async (plan: PricingPlanView) => {
    if (
      !(await dialogs.confirm({
        title: `Request the ${plan.name} plan?`,
        message: `The Knowledge Base team reviews it and sends your one-time access code to your notifications.${plan.priceCoins ? ` This plan costs ${plan.priceCoins} coins on creation.` : ""}`,
        confirmLabel: "Send request",
      }))
    )
      return;
    await pricing.request({ kind: "CREATE_ORG", planKey: plan.key });
    dialogs.toast("Request sent — your code will arrive in your notifications.", "success");
    loadPlans();
  };

  const submitCustom = async (plan: PricingPlanView, days: number, offered: number) => {
    await pricing.request({ kind: "CUSTOM_PLAN", planKey: plan.key, requestedDays: days, offeredCoins: offered });
    setCustomFor(null);
    dialogs.toast("Proposal sent — the admin will reply in your notifications.", "success");
    loadPlans();
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    if (data.get("supremePassword") !== data.get("supremePassword2")) {
      setError("Supreme passwords do not match");
      return;
    }
    const parsed = createOrgSchema.safeParse({
      name: data.get("name"),
      ownerRoleName: data.get("ownerRoleName"),
      supremePassword: data.get("supremePassword"),
      acknowledgedUnrecoverable: data.get("ack") === "on" ? true : false,
      accessCode: String(data.get("accessCode") ?? "").trim(),
      storage,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const org = await orgs.create(parsed.data);
      router.push(`/orgs/${org.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  return (
    <AppShell
      nav={NAV}
      title="Create an organization"
      subtitle="This creates the organization's Supreme — its root object — and its first role, with you as the first owner."
    >
      <div className="create-org-grid">
        {/* ── Left: the create form ─────────────────────────────────────── */}
        <form className="auth-card glass" onSubmit={submit} style={{ margin: 0 }}>
          <div className="warn-box" style={{ marginTop: 0 }}>
            <strong>You need an access code to create an organization.</strong>
            <p>
              Pick a plan on the right → the Knowledge Base team approves it → your one-time
              code arrives in your <Link href="/account">notifications</Link>. Paste it below.
            </p>
          </div>
          <label className="field">
            <span>Access code</span>
            <input name="accessCode" required placeholder="8-character code from your notifications" autoCapitalize="characters" />
            <small>The super-admin sends this after approving your plan request.</small>
          </label>
          <label className="field">
            <span>Organization name</span>
            <input name="name" required minLength={2} />
          </label>
          <label className="field">
            <span>First role name</span>
            <input name="ownerRoleName" placeholder="Owner / CEO / Principal…" required />
            <small>The role at the top of your structure — you become its first occupant</small>
          </label>
          <label className="field">
            <span>Supreme password</span>
            <input name="supremePassword" type="password" minLength={12} required />
            <small>At least 12 characters</small>
          </label>
          <label className="field">
            <span>Repeat Supreme password</span>
            <input name="supremePassword2" type="password" required />
          </label>

          <div className="warn-box">
            <strong>This password cannot be recovered. By anyone. Ever.</strong>
            <p>
              The platform stores no copy — it protects owner-level changes and encrypts your
              organization&apos;s <code>.main</code> revival file. If it is lost, changing the
              owner structure and reviving a deleted organization become permanently
              impossible.
            </p>
            <label className="ack-row">
              <input type="checkbox" name="ack" />
              <span>I understand the Supreme password is unrecoverable</span>
            </label>
          </div>

          <hr className="soft-rule" />
          <h3 className="section-heading">Where your documents will live</h3>
          <p className="muted">
            Knowledge Vault keeps your structure, people and records. Your documents
            themselves go onto storage you own and control — so the space is yours, the
            cost is yours, and you can walk away with everything at any time.
          </p>
          <StorageSetupFields
            value={storage}
            onChange={setStorage}
            webOrigin={typeof window === "undefined" ? "" : window.location.origin}
          />

          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Creating…" : "Create organization"}
          </button>
        </form>

        {/* ── Right: choose a plan ──────────────────────────────────────── */}
        <aside className="plan-chooser glass">
          <div className="plan-chooser-head">
            <h2>Choose a plan</h2>
            <span className="coins-badge">
              🪙 <strong>{coins ?? "…"}</strong> coins
            </span>
          </div>
          <p className="auth-sub">
            Request a plan here; the code arrives in your notifications. Full details on the{" "}
            <Link href="/pricing">Pricing page</Link>.
          </p>

          {plans.map((p) => {
            const req = mine.find((m) => m.planKey === p.key && (m.status === "PENDING" || m.status === "APPROVED"));
            return (
              <div key={p.key} className="plan-mini">
                <div className="plan-mini-head">
                  <strong>{p.name}</strong>
                  <span className="plan-mini-price">{p.priceCoins === 0 ? "Free" : `${p.priceCoins} 🪙`}</span>
                </div>
                <span className="auth-sub">{p.durationDays ? `${p.durationDays} days` : p.isCustom ? "Custom duration" : "Unlimited"} · 👥 {p.memberLimit != null ? `up to ${p.memberLimit}` : p.isCustom ? "custom limit" : "unlimited"}</span>
                {p.tagline && <p className="auth-sub" style={{ fontSize: "0.8rem" }}>{p.tagline}</p>}

                {req ? (
                  <span className={`badge ${req.status === "APPROVED" ? "badge-ok" : ""}`}>
                    {req.status === "APPROVED" ? "approved — code in your 🔔" : "requested — awaiting approval"}
                  </span>
                ) : p.isCustom && customFor === p.key ? (
                  <form
                    className="plan-mini-custom"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      submitCustom(p, Number(d.get("days")), Number(d.get("coins")));
                    }}
                  >
                    <input name="days" type="number" min={1} placeholder="Days" required />
                    <input name="coins" type="number" min={0} placeholder="Coins you offer" required />
                    <div className="tree-actions">
                      <button className="btn btn-primary btn-small">Send</button>
                      <button type="button" className="btn btn-quiet btn-small" onClick={() => setCustomFor(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="btn btn-quiet btn-small"
                    onClick={() => (p.isCustom ? setCustomFor(p.key) : requestFixed(p))}
                  >
                    {p.isCustom ? "Propose terms" : "Request this plan"}
                  </button>
                )}
              </div>
            );
          })}
        </aside>
      </div>
    </AppShell>
  );
}
