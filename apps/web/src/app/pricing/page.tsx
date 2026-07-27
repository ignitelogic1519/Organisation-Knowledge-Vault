"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PlatformRequestView, PricingPlanView, PricingView } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { pricing } from "@/lib/pricing-client";
import { SiteNav } from "@/components/SiteNav";
import { useDialogs } from "@/components/dialogs";

export default function PricingPage() {
  const dialogs = useDialogs();
  const [view, setView] = useState<PricingView | null>(null);
  const [tab, setTab] = useState<string>("");
  const [coins, setCoins] = useState<number | null>(null);
  const [mine, setMine] = useState<PlatformRequestView[]>([]);
  const authed = typeof window !== "undefined" && hasSession();

  const loadMine = useCallback(() => {
    if (!authed) return;
    pricing.wallet().then((w) => setCoins(w.coins)).catch(() => undefined);
    pricing.myRequests().then((r) => setMine(r.requests)).catch(() => undefined);
  }, [authed]);

  useEffect(() => {
    pricing.view().then((v) => {
      setView(v);
      setTab(v.tabs[0] ?? "");
    });
    loadMine();
  }, [loadMine]);

  const [customFor, setCustomFor] = useState<string | null>(null);

  const requestFixed = async (plan: PricingPlanView) => {
    if (!authed) {
      await dialogs.alert({ title: "Sign in first", message: "Create a profile or sign in to request a plan." });
      return;
    }
    if (!(await dialogs.confirm({ title: `Request the ${plan.name} plan?`, message: `The super-admin will review and send you an access code in your notifications.${plan.priceCoins ? ` This plan costs ${plan.priceCoins} coins on creation.` : ""}`, confirmLabel: "Send request" }))) return;
    await pricing.request({ kind: "CREATE_ORG", planKey: plan.key });
    dialogs.toast("Request sent — watch your notifications for the access code.", "success");
    loadMine();
  };

  const submitCustom = async (plan: PricingPlanView, days: number, coins: number) => {
    await pricing.request({ kind: "CUSTOM_PLAN", planKey: plan.key, requestedDays: days, offeredCoins: coins });
    setCustomFor(null);
    dialogs.toast("Proposal sent — the admin will reply in your notifications.", "success");
    loadMine();
  };

  const shown = view?.plans.filter((p) => p.category === tab) ?? [];

  return (
    <main className="landing">
      <SiteNav
        right={
          <span className="pricing-wallet">
            {authed && coins !== null && <span className="coins-chip">🪙 {coins} coins</span>}
            {authed && <Link href="/payment" className="btn btn-primary btn-small">Buy coins</Link>}
            <Link href={authed ? "/orgs" : "/login"} className="nav-link">{authed ? "My organizations" : "Sign in"}</Link>
          </span>
        }
      />
      <section className="section" style={{ paddingTop: "6rem" }}>
        <div className="section-head">
          <span className="eyebrow">Pricing</span>
          <h2>Choose a plan to <span className="gradient-text">found your organization</span></h2>
          <p>Every organization runs on a plan. Pick one, and the Knowledge Base team sends you a one-time access code to create it.</p>
        </div>

        {view && view.tabs.length > 1 && (
          <div className="kbase-tabs" style={{ justifyContent: "center" }}>
            {view.tabs.map((t) => (
              <button key={t} className={`btn btn-small ${tab === t ? "btn-primary" : "btn-quiet"}`} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
        )}

        <div className="pricing-grid">
          {shown.map((p) => (
            <div key={p.key} className="pricing-card glass">
              {p.badge && <span className="pricing-badge">{p.badge}</span>}
              {p.imageUrl && <img className="pricing-img" src={p.imageUrl} alt="" />}
              <h3>{p.name}</h3>
              {p.tagline && <p className="auth-sub">{p.tagline}</p>}
              <div className="pricing-price">
                {p.priceCoins === 0 ? <span className="gradient-text">Free</span> : <><span className="gradient-text">{p.priceCoins}</span> <span className="auth-sub">coins</span></>}
              </div>
              <p className="auth-sub">{p.durationDays ? `${p.durationDays} days` : p.isCustom ? "Custom duration" : "Unlimited"}</p>
              {p.criteria && <p className="pricing-criteria">{p.criteria}</p>}
              <ul className="pricing-highlights">
                {p.highlights.map((h, i) => <li key={i}>✓ {h}</li>)}
              </ul>
              {p.isCustom && customFor === p.key ? (
                <form
                  className="pricing-custom"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!authed) { dialogs.alert({ title: "Sign in first", message: "Sign in to propose terms." }); return; }
                    const d = new FormData(e.currentTarget);
                    submitCustom(p, Number(d.get("days")), Number(d.get("coins")));
                  }}
                >
                  <label className="field"><span>Days you want</span><input name="days" type="number" min={1} required /></label>
                  <label className="field"><span>Coins you offer</span><input name="coins" type="number" min={0} required /></label>
                  <div className="tree-actions">
                    <button className="btn btn-primary btn-small">Send proposal</button>
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => setCustomFor(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button className="btn btn-primary w-100" onClick={() => (p.isCustom ? setCustomFor(p.key) : requestFixed(p))}>
                  {p.isCustom ? "Propose terms" : "Request this plan"}
                </button>
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
                    <span className="chip">{r.kind}</span> {r.planKey ?? "custom"}{" "}
                    <span className={`badge ${r.status === "APPROVED" ? "badge-ok" : r.status === "DENIED" ? "badge-danger" : ""}`}>{r.status.toLowerCase()}</span>
                    {r.adminMessage && <span className="auth-sub"> · {r.adminMessage}</span>}
                    {r.status === "APPROVED" && <span className="auth-sub"> · code is in your notifications 🔔</span>}
                  </span>
                  {r.status === "PENDING" && (
                    <button className="btn btn-quiet btn-small" onClick={async () => { await pricing.withdraw(r.id); loadMine(); }}>Withdraw</button>
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
