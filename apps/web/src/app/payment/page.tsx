"use client";

import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

// Buying Knowledge Coins with real money — the payment gateway is not wired yet.
export default function PaymentComingSoon() {
  return (
    <main className="landing">
      <SiteNav right={<Link href="/pricing" className="nav-link">Pricing</Link>} />
      <section className="section" style={{ paddingTop: "8rem", textAlign: "center" }}>
        <div className="cta-band glass" style={{ maxWidth: 640, margin: "0 auto" }}>
          <span className="hero-pill glass">🪙 Knowledge Coins</span>
          <h2>Buying coins is <span className="gradient-text">coming soon</span></h2>
          <p>
            Soon you&apos;ll be able to top up your Knowledge Coins with real money and use them to
            buy plans. For now, coins are granted by the Knowledge Base team — reach out if you need more.
          </p>
          <Link className="btn btn-primary btn-lg" href="/pricing">Back to pricing</Link>
        </div>
      </section>
    </main>
  );
}
