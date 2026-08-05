import Link from "next/link";
import { FeatureCatalogue } from "@/components/FeatureCatalogue";
import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "Features — Knowledge Vault",
  description:
    "Everything Knowledge Vault does: structure and people, the Studio and the library, learning and compliance, the mailbox, and custody.",
};

// The full catalogue, grouped by the part of the product it belongs to. The front page
// shows a taste of this; here is the whole thing.
export default function FeaturesPage() {
  return (
    <main className="landing">
      <SiteNav right={<Link href="/login" className="nav-link">Sign in</Link>} />

      <section className="section" style={{ paddingTop: "6rem" }}>
        <div className="section-head">
          <span className="eyebrow">Features</span>
          <h2>
            Everything the platform <span className="gradient-text">actually does</span>
          </h2>
          <p>
            Grouped by the part of the product it belongs to, so you can go straight to the
            bit you came for. Anything marked &ldquo;needs an account&rdquo; lives inside
            your organization — creating a profile takes a moment and costs nothing.
          </p>
        </div>

        <FeatureCatalogue />
      </section>

      <footer className="footer">
        <span>Knowledge Vault — your structure, your knowledge, your custody.</span>
        <span className="footer-links">
          <Link href="/storage">Storage</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help &amp; guide book</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Register</Link>
        </span>
      </footer>
    </main>
  );
}
