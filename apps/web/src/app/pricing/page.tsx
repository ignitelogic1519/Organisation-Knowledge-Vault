"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  comparePlans,
  durationLabel,
  limitLabel,
  PLATFORM_REQUEST_LABELS,
  storageLabel,
  type PlatformRequestView,
  type PricingPlanView,
  type PricingView,
  type UpgradableOrgView,
} from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { pricing } from "@/lib/pricing-client";
import { SiteNav } from "@/components/SiteNav";
import { SessionNavLinks } from "@/components/SessionNavLinks";
import { useDialogs } from "@/components/dialogs";

// Pricing. Two jobs on one page:
//  1. The ladder — what each plan costs and what it includes.
//  2. The upgrade view — for a signed-in owner, what their organization runs TODAY set
//     side by side with what it would get by moving up, the way a streaming service shows
//     you your current tier against the one above it.

function PlanCard({
  plan,
  coins,
  onRequest,
  onCustom,
  current,
}: {
  plan: PricingPlanView;
  coins: number | null;
  onRequest: (p: PricingPlanView) => void;
  onCustom: (p: PricingPlanView) => void;
  current: boolean;
}) {
  const affordable = coins == null || plan.priceCoins === 0 || coins >= plan.priceCoins;
  return (
    <div className="pricing-card glass" data-current={current}>
      {current && <span className="pricing-badge pricing-badge-current">Your plan</span>}
      {!current && plan.badge && <span className="pricing-badge">{plan.badge}</span>}
      {plan.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pricing-img" src={plan.imageUrl} alt="" />
      )}
      <h3>{plan.name}</h3>
      {plan.tagline && <p className="auth-sub">{plan.tagline}</p>}
      <div className="pricing-price">
        {plan.isCustom ? (
          <span className="gradient-text">By agreement</span>
        ) : (
          <>
            <span className="gradient-text">{plan.priceCoins}</span>{" "}
            <span className="auth-sub">coins</span>
          </>
        )}
      </div>

      <dl className="pricing-facts">
        <div>
          <dt>Runs for</dt>
          <dd>{durationLabel(plan.durationDays, plan.isCustom)}</dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>{plan.isCustom ? "You choose" : limitLabel(plan.memberLimit)}</dd>
        </div>
        <div>
          <dt>Custom documents</dt>
          <dd>{plan.isCustom ? "You choose" : limitLabel(plan.documentLimit)}</dd>
        </div>
        <div>
          <dt>Uploaded documents</dt>
          <dd>{plan.isCustom ? "You choose" : limitLabel(plan.uploadLimit)}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{storageLabel(plan.storageLimitMb)}</dd>
        </div>
        <div>
          <dt>Server-side drafts</dt>
          <dd>{plan.allowDrafts ? "Included" : "Not on this plan"}</dd>
        </div>
      </dl>

      {plan.criteria && <p className="pricing-criteria">{plan.criteria}</p>}
      <ul className="pricing-highlights">
        {plan.highlights.map((h, i) => (
          <li key={i}>✓ {h}</li>
        ))}
      </ul>

      <button
        className="btn btn-primary w-100"
        onClick={() => (plan.isCustom ? onCustom(plan) : onRequest(plan))}
      >
        {plan.isCustom ? "Request a custom plan" : current ? "Renew this plan" : "Request this plan"}
      </button>
      {!affordable && !plan.isCustom && (
        <p className="pricing-afford auth-sub">
          You hold {coins} coins — this plan needs {plan.priceCoins}.
        </p>
      )}
    </div>
  );
}

/** The comparison table: what you run today, against the plan you're considering. */
function UpgradePanel({
  orgs,
  plans,
  onUpgrade,
}: {
  orgs: UpgradableOrgView[];
  plans: PricingPlanView[];
  onUpgrade: (org: UpgradableOrgView, plan: PricingPlanView) => void;
}) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
  const currentPlan = useMemo(
    () => plans.find((p) => p.key === org?.planKey) ?? null,
    [plans, org],
  );
  const above = useMemo(
    () => plans.filter((p) => p.tier > (currentPlan?.tier ?? 0)).sort((a, b) => a.tier - b.tier),
    [plans, currentPlan],
  );
  const [targetKey, setTargetKey] = useState<string>("");
  const target = above.find((p) => p.key === targetKey) ?? above[0] ?? null;
  const rows = target ? comparePlans(currentPlan, target) : [];

  if (!org) return null;

  return (
    <section className="upgrade-panel glass">
      <header className="upgrade-head">
        <div>
          <span className="eyebrow">Your organizations</span>
          <h3>What you run today — and what&apos;s above it</h3>
        </div>
        {orgs.length > 1 && (
          <label className="field upgrade-picker">
            <span>Organization</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} (#{o.orgNumber})
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <div className="upgrade-current">
        <span className="upgrade-current-plan">
          {currentPlan?.name ?? org.planKey ?? "No plan"}
        </span>
        <span className={`badge ${org.planStatus === "ACTIVE" ? "badge-ok" : org.planStatus === "EXPIRED" ? "badge-danger" : ""}`}>
          {org.planStatus.toLowerCase()}
        </span>
        {org.planExpiresAt && (
          <span className="auth-sub">until {org.planExpiresAt.slice(0, 10)}</span>
        )}
        <span className="auth-sub">
          · {org.members} people · {org.documents} custom documents · {org.uploads} uploads
        </span>
      </div>

      {above.length === 0 ? (
        <p className="auth-sub">
          This organization is already on the top plan. Nothing above it to move to.
        </p>
      ) : (
        <>
          <div className="upgrade-tabs">
            {above.map((p) => (
              <button
                key={p.key}
                className={`btn btn-small ${target?.key === p.key ? "btn-primary" : "btn-quiet"}`}
                onClick={() => setTargetKey(p.key)}
              >
                {p.name}
              </button>
            ))}
          </div>

          {target && (
            <>
              <div className="table-scroll">
                <table className="upgrade-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>{currentPlan?.name ?? "Today"}</th>
                      <th className="upgrade-col-next">{target.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row">{r.label}</th>
                        <td>{r.current}</td>
                        <td className="upgrade-col-next" data-better={r.better}>
                          {r.better && <span aria-hidden>✓ </span>}
                          {r.next}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {org.canUpgrade ? (
                <button className="btn btn-primary" onClick={() => onUpgrade(org, target)}>
                  Upgrade {org.name} to {target.name}
                </button>
              ) : (
                <p className="auth-sub">
                  Only an owner of {org.name} can ask for an upgrade — send this page to
                  yours.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function PricingPage() {
  const dialogs = useDialogs();
  const [view, setView] = useState<PricingView | null>(null);
  const [tab, setTab] = useState<string>("");
  const [coins, setCoins] = useState<number | null>(null);
  const [mine, setMine] = useState<PlatformRequestView[]>([]);
  const [customFor, setCustomFor] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => setAuthed(hasSession()), []);

  const loadMine = useCallback(() => {
    if (!hasSession()) return;
    pricing.wallet().then((w) => setCoins(w.coins)).catch(() => undefined);
    pricing.myRequests().then((r) => setMine(r.requests)).catch(() => undefined);
  }, []);

  const loadAll = useCallback(() => {
    pricing.view().then((v) => {
      setView(v);
      setTab((t) => t || v.tabs[0] || "");
    });
    loadMine();
  }, [loadMine]);

  useEffect(loadAll, [loadAll]);

  const requireSignIn = async () => {
    await dialogs.alert({
      title: "Sign in first",
      message: "Create a profile or sign in — plan requests are answered into your mailbox.",
    });
  };

  const requestFixed = async (plan: PricingPlanView) => {
    if (!hasSession()) return requireSignIn();
    const ok = await dialogs.confirm({
      title: `Request the ${plan.name} plan?`,
      message: `The Knowledge Base team reviews it and sends your access code to your mailbox.${
        plan.priceCoins ? ` This plan costs ${plan.priceCoins} coins when you create the organization.` : ""
      }`,
      confirmLabel: "Send request",
    });
    if (!ok) return;
    try {
      await pricing.request({ kind: "CREATE_ORG", planKey: plan.key });
      dialogs.toast("Request sent — watch your mailbox for the access code.", "success");
      loadMine();
    } catch (e) {
      dialogs.toast(e instanceof Error ? e.message : "Could not send the request", "danger");
    }
  };

  const requestUpgrade = async (org: UpgradableOrgView, plan: PricingPlanView) => {
    const ok = await dialogs.confirm({
      title: `Upgrade ${org.name} to ${plan.name}?`,
      message: `The Knowledge Base team applies the upgrade and confirms it in your mailbox.${
        plan.priceCoins ? ` ${plan.name} costs ${plan.priceCoins} coins.` : ""
      }`,
      confirmLabel: "Request upgrade",
    });
    if (!ok) return;
    try {
      await pricing.request({
        kind: "UPGRADE_PLAN",
        planKey: plan.key,
        targetOrgNumber: org.orgNumber,
      });
      dialogs.toast("Upgrade requested — you'll hear back in your mailbox.", "success");
      loadMine();
    } catch (e) {
      dialogs.toast(e instanceof Error ? e.message : "Could not send the request", "danger");
    }
  };

  const shown = view?.plans.filter((p) => p.category === tab) ?? [];
  const myPlanKeys = new Set((view?.myOrgs ?? []).map((o) => o.planKey));
  const upgradableOrgs = view?.myOrgs ?? [];

  return (
    <main className="landing">
      <SiteNav
        right={
          <span className="pricing-wallet">
            {authed && coins !== null && <span className="coins-chip">🪙 {coins} coins</span>}
            {authed && (
              <Link href="/payment" className="btn btn-primary btn-small">
                Buy coins
              </Link>
            )}
            <SessionNavLinks />
          </span>
        }
      />

      <section className="section" style={{ paddingTop: "6rem" }}>
        <div className="section-head">
          <span className="eyebrow">Pricing</span>
          <h2>
            Plans that grow with your <span className="gradient-text">organization</span>
          </h2>
          <p>
            Every organization runs on a plan, paid in Knowledge Coins. Only the Free plan is
            metered — every paid plan carries unlimited documents and uploads. Pick one, and
            the Knowledge Base team sends a one-time access code to your mailbox.
          </p>
        </div>

        {authed && upgradableOrgs.length > 0 && view && (
          <UpgradePanel orgs={upgradableOrgs} plans={view.plans} onUpgrade={requestUpgrade} />
        )}

        {view && view.tabs.length > 1 && (
          <div className="pill-tabs" style={{ justifyContent: "center" }}>
            {view.tabs.map((t) => (
              <button
                key={t}
                className={`btn btn-small ${tab === t ? "btn-primary" : "btn-quiet"}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="pricing-grid">
          {shown.map((p) => (
            <div key={p.key} className="pricing-cell">
              <PlanCard
                plan={p}
                coins={coins}
                current={myPlanKeys.has(p.key)}
                onRequest={requestFixed}
                onCustom={(plan) => {
                  if (!hasSession()) {
                    void requireSignIn();
                    return;
                  }
                  setCustomFor(customFor === plan.key ? null : plan.key);
                }}
              />
              {customFor === p.key && (
                <form
                  className="pricing-custom glass"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    try {
                      await pricing.request({
                        kind: "CUSTOM_PLAN",
                        planKey: p.key,
                        requestedDays: Number(d.get("days")),
                        offeredCoins: Number(d.get("coins")),
                        requestedMembers: Number(d.get("members")) || undefined,
                        requestedDocuments: Number(d.get("documents")) || undefined,
                        requestedUploads: Number(d.get("uploads")) || undefined,
                        message: String(d.get("message") || "") || undefined,
                      });
                      setCustomFor(null);
                      dialogs.toast(
                        "Proposal sent — the Knowledge Base team will reply in your mailbox.",
                        "success",
                      );
                      loadMine();
                    } catch (err) {
                      dialogs.toast(
                        err instanceof Error ? err.message : "Could not send the proposal",
                        "danger",
                      );
                    }
                  }}
                >
                  <strong>Tell us the shape you need</strong>
                  <p className="auth-sub">
                    These numbers are what the team approves — you won&apos;t be asked to
                    fill anything in twice.
                  </p>
                  <label className="field">
                    <span>Days you need</span>
                    <input name="days" type="number" min={1} max={3650} required />
                  </label>
                  <label className="field">
                    <span>Number of people</span>
                    <input name="members" type="number" min={1} required />
                  </label>
                  <label className="field">
                    <span>Custom documents (built in the Studio)</span>
                    <input name="documents" type="number" min={1} required />
                  </label>
                  <label className="field">
                    <span>Uploaded documents</span>
                    <input name="uploads" type="number" min={1} required />
                  </label>
                  <label className="field">
                    <span>Coins you offer</span>
                    <input name="coins" type="number" min={0} required />
                  </label>
                  <label className="field">
                    <span>Anything else (optional)</span>
                    <textarea name="message" rows={2} maxLength={600} />
                  </label>
                  <div className="tree-actions">
                    <button className="btn btn-primary btn-small">Send proposal</button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      onClick={() => setCustomFor(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>

        {authed && mine.length > 0 && (
          <div className="section" style={{ maxWidth: 760, margin: "2rem auto 0" }}>
            <h3>Your requests</h3>
            <ul className="owner-list">
              {mine.map((r) => (
                <li key={r.id} className="account-row">
                  <span>
                    <span className="chip">{PLATFORM_REQUEST_LABELS[r.kind]}</span>{" "}
                    {r.planKey ?? "custom"}{" "}
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
                    {r.grantedDays != null && (
                      <span className="auth-sub"> · {r.grantedDays} days granted</span>
                    )}
                    {r.adminMessage && <span className="auth-sub"> · {r.adminMessage}</span>}
                    {r.status === "APPROVED" && (
                      <span className="auth-sub"> · your code is in your mailbox 🔔</span>
                    )}
                  </span>
                  {r.status === "PENDING" ? (
                    <button
                      className="btn btn-quiet btn-small"
                      onClick={async () => {
                        await pricing.withdraw(r.id).catch(() => undefined);
                        loadMine();
                      }}
                    >
                      Withdraw
                    </button>
                  ) : (
                    <button
                      className="btn btn-quiet btn-small"
                      title="Remove this from the list — the outcome stays in your mailbox"
                      onClick={async () => {
                        try {
                          await pricing.dismiss(r.id);
                          loadMine();
                        } catch (e) {
                          dialogs.toast(
                            e instanceof Error ? e.message : "Could not clear it",
                            "info",
                          );
                        }
                      }}
                    >
                      Clear
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
