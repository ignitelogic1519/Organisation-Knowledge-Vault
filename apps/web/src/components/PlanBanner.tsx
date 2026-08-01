"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PricingPlanView } from "@vault/shared";
import { daysUntil, PLAN_REMINDER_DAYS, planReminderStage } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { pricing } from "@/lib/pricing-client";
import { useOrg } from "@/components/org-context";
import { useDialogs } from "@/components/dialogs";

// The plan reminder that sits on the organization's main board. It appears once the plan
// enters the first reminder window (20 days out, mirroring the nightly notification) and
// stays until the plan is renewed. An owner can ask the Knowledge Base team for a renewal,
// an upgrade, or a custom arrangement without leaving the page.
//
// An expiring plan can be dismissed for the session; an EXPIRED one cannot — at that point
// the organization is restricted and hiding the notice would only hide the reason.

const FIRST_RUNG = Math.max(...PLAN_REMINDER_DAYS);

export function PlanBanner() {
  const { org, isSupremeOwner, isAdmin } = useOrg();
  const dialogs = useDialogs();
  const [asking, setAsking] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [plans, setPlans] = useState<PricingPlanView[]>([]);

  const expired = org.planStatus === "EXPIRED";
  const left = org.planExpiresAt ? daysUntil(org.planExpiresAt) : null;
  const stage = left != null && left > 0 ? planReminderStage(left) : null;
  const relevant = expired || stage != null;

  // Session-scoped dismissal, keyed to the rung — tightening to the 7- or 1-day notice
  // brings the banner back even if the 20-day one was dismissed.
  const dismissKey = `kv.planBanner.${org.id}.${expired ? "expired" : stage}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(sessionStorage.getItem(dismissKey) === "1");
  }, [dismissKey]);

  useEffect(() => {
    if (!asking) return;
    pricing.view().then((v) => setPlans(v.plans)).catch(() => setPlans([]));
  }, [asking]);

  // Members can't act on this, and the plan isn't their concern — owners only.
  if (!isAdmin || !relevant || (dismissed && !expired)) return null;

  const headline = expired
    ? `${org.name}'s plan has expired`
    : `${org.name}'s plan expires in ${left} day${left === 1 ? "" : "s"}`;

  return (
    <div className="plan-banner glass" data-danger={expired || undefined}>
      <div className="plan-banner-text">
        <strong>{headline}</strong>
        <p className="auth-sub">
          {expired ? (
            <>
              Full access is restricted until the plan is renewed. Renew it, move to a larger
              plan, or ask the Knowledge Base team for a custom arrangement.
            </>
          ) : (
            <>
              {org.planKey ? `The ${org.planKey} plan ends` : "This plan ends"} on{" "}
              {org.planExpiresAt?.slice(0, 10)}. Renew or upgrade it before then to avoid any
              interruption.
            </>
          )}
        </p>
      </div>

      <div className="plan-banner-actions">
        {isSupremeOwner ? (
          <button className="btn btn-primary btn-small" onClick={() => setAsking((v) => !v)}>
            {asking ? "Close" : "Renew or upgrade"}
          </button>
        ) : (
          <span className="auth-sub">
            Ask an organization owner
            {org.owners.length > 0 ? `: ${org.owners.map((o) => `@${o.username}`).join(", ")}` : ""}
          </span>
        )}
        <Link className="btn btn-quiet btn-small" href="/pricing">
          See plans
        </Link>
        {!expired && (
          <button
            className="btn btn-quiet btn-small"
            onClick={() => {
              sessionStorage.setItem(dismissKey, "1");
              setDismissed(true);
            }}
          >
            Dismiss
          </button>
        )}
      </div>

      {asking && isSupremeOwner && (
        <form
          className="plan-banner-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const planKey = String(d.get("planKey") || "") || undefined;
            const days = d.get("days") ? Number(d.get("days")) : undefined;
            const coins = d.get("coins") ? Number(d.get("coins")) : undefined;
            try {
              await pricing.request({
                kind: "PLAN_RENEWAL",
                targetOrgNumber: org.orgNumber,
                planKey,
                requestedDays: days,
                offeredCoins: coins,
                message: String(d.get("message") || "") || undefined,
              });
              setAsking(false);
              dialogs.toast(
                "Request sent to the Knowledge Base team — you'll be notified when they decide.",
                "success",
              );
            } catch (err) {
              dialogs.toast(
                err instanceof ApiError ? err.message : "Could not send the request",
                "danger",
              );
            }
          }}
        >
          <label className="field">
            <span>Plan you want</span>
            <select name="planKey" defaultValue={org.planKey ?? ""}>
              <option value="">No preference — advise me</option>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                  {p.durationDays ? ` · ${p.durationDays} days` : ""}
                  {p.priceCoins ? ` · ${p.priceCoins} coins` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Days needed (optional)</span>
            <input name="days" type="number" min={1} placeholder="e.g. 365" />
          </label>
          <label className="field">
            <span>Coins you can offer (optional)</span>
            <input name="coins" type="number" min={0} />
          </label>
          <label className="field">
            <span>Message to the Knowledge Base team</span>
            <input name="message" placeholder="Anything they should know about your needs" />
          </label>
          <button className="btn btn-primary btn-small">Send request</button>
        </form>
      )}
    </div>
  );
}

export { FIRST_RUNG as PLAN_BANNER_WINDOW_DAYS };
