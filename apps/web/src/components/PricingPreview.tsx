"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  durationLabel,
  limitLabel,
  storageLabel,
  type PricingPlanView,
} from "@vault/shared";
import { pricing } from "@/lib/pricing-client";

// A compact read of the live pricing table for the front page. It reads the same
// endpoint the Pricing page does, so the numbers here can never drift from the real ones —
// when an admin edits a plan, this changes with it.

export function PricingPreview() {
  const [plans, setPlans] = useState<PricingPlanView[] | null>(null);

  useEffect(() => {
    pricing
      .view()
      .then((v) => setPlans(v.plans.filter((p) => p.category === (v.tabs[0] ?? "Plans"))))
      .catch(() => setPlans([]));
  }, []);

  if (plans === null) {
    return (
      <div className="pricing-preview">
        <div className="skeleton" style={{ height: "9rem" }} />
        <div className="skeleton" style={{ height: "9rem" }} />
        <div className="skeleton" style={{ height: "9rem" }} />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <p className="auth-sub" style={{ textAlign: "center" }}>
        Pricing is loading from the platform — open the{" "}
        <Link href="/pricing">Pricing page</Link> for the full table.
      </p>
    );
  }

  return (
    <>
      <div className="pricing-preview">
        {plans.map((p) => (
          <article key={p.key} className="pricing-preview-card glass">
            {p.badge && <span className="pricing-badge">{p.badge}</span>}
            <h3>{p.name}</h3>
            <div className="pricing-price">
              {p.isCustom ? (
                <span className="gradient-text">By agreement</span>
              ) : (
                <>
                  <span className="gradient-text">{p.priceCoins}</span>{" "}
                  <span className="auth-sub">coins</span>
                </>
              )}
            </div>
            <p className="auth-sub">{durationLabel(p.durationDays, p.isCustom)}</p>
            <ul className="pricing-preview-facts">
              <li>👥 {p.isCustom ? "People you choose" : `${limitLabel(p.memberLimit)} people`}</li>
              <li>
                ✍ {p.documentLimit == null ? "Unlimited" : p.documentLimit} custom documents
              </li>
              <li>📎 {p.uploadLimit == null ? "Unlimited" : p.uploadLimit} uploads</li>
              <li>💾 {storageLabel(p.storageLimitMb)} storage</li>
            </ul>
          </article>
        ))}
      </div>
      <div className="feature-foot">
        <Link className="btn btn-primary" href="/pricing">
          Compare every plan
        </Link>
      </div>
    </>
  );
}
