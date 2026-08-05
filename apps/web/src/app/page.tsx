import Link from "next/link";
import { ApiStatus } from "@/components/ApiStatus";
import { Constellation } from "@/components/Constellation";
import { FeatureCatalogue } from "@/components/FeatureCatalogue";
import { LandingShowcase } from "@/components/LandingShowcase";
import { PricingPreview } from "@/components/PricingPreview";
import { Reveal } from "@/components/Reveal";
import { SiteNav } from "@/components/SiteNav";
import { SessionNavLinks } from "@/components/SessionNavLinks";
import { STATUS_LABEL, STORAGE_BACKENDS } from "@/lib/storage-backends";

const STEPS = [
  {
    n: "01",
    title: "Create your profile",
    text: "One global username works across every organization you join or found — no email required.",
  },
  {
    n: "02",
    title: "Found an organization",
    text: "Set the unrecoverable Supreme password — the root of a custody model where you hold everything.",
  },
  {
    n: "03",
    title: "Grow the constellation",
    text: "Add roles and sub-roles, place people as owners or members, grant capabilities precisely.",
  },
  {
    n: "04",
    title: "Publish & track learning",
    text: "Author or upload documents, shelve them in the library, and watch compliance in real time.",
  },
];

const STATS = [
  { n: "4", l: "labeled request flows" },
  { n: "100%", l: "your data custody" },
  { n: "0", l: "second-tab redirects" },
  { n: "∞", l: "roles & sub-roles" },
];

const PILLARS = [
  {
    icon: "🔐",
    title: "Custody by design",
    text: "The Supreme password and .main revival file never leave your hands. The platform holds nothing it could hold hostage.",
  },
  {
    icon: "🛡",
    title: "Least-privilege governance",
    text: "Owners hold only the rights granted to them — and can never hand out a capability they don't have themselves.",
  },
  {
    icon: "⚡",
    title: "Real-time everywhere",
    text: "Structure, requests, courses and notifications update live across every open session over server-sent events.",
  },
  {
    icon: "🧭",
    title: "Standardized documents",
    text: "Every document gets an authenticated cover, a classification, and a header/footer — consistent, professional, auditable.",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <SiteNav
        right={
          <>
            {/* Decided in the browser: this page is server-rendered and the session is
                not, so hard-coding "Sign in" showed it to signed-in visitors too. */}
            <SessionNavLinks />
          </>
        }
      />

      <section className="hero">
        <Constellation />
        <div className="hero-glow" aria-hidden />
        <div className="hero-content">
          <span className="hero-pill glass">Training · Compliance · Custody</span>
          <h1>
            Your organization&apos;s knowledge,
            <br />
            <span className="gradient-text">in your custody.</span>
          </h1>
          <p>
            Role-based training and a real knowledge library, structured like your
            organization — a living constellation of roles, documents and people. Modern,
            auditable, and entirely yours.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary btn-lg" href="/register">
              Get started free
            </Link>
            <Link className="btn btn-quiet btn-lg" href="#features">
              See every feature
            </Link>
          </div>
          <ApiStatus />
        </div>
        <span className="hero-scroll" aria-hidden>
          ↓
        </span>
      </section>

      <section className="section" id="showcase">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">The product</span>
          <h2>
            One platform, from <span className="gradient-text">structure to shelf</span>
          </h2>
          <p>
            Explore the surfaces your team lives in every day — mapped, shelved, authored
            and measured.
          </p>
        </Reveal>
        <Reveal variant="scale" delay={80}>
          <LandingShowcase />
        </Reveal>
      </section>

      <section className="section">
        <div className="stat-band glass">
          {STATS.map((s, i) => (
            <Reveal key={s.l} className="stat-band-item" variant="up" delay={i * 70}>
              <span className="stat-band-n gradient-text">{s.n}</span>
              <span className="stat-band-l">{s.l}</span>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section" id="features">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Features</span>
          <h2>
            What you get, <span className="gradient-text">area by area</span>
          </h2>
          <p>
            Pick the part of the product you care about. Everything here is built and
            working — nothing on this page is a promise.
          </p>
        </Reveal>
        <Reveal variant="up" delay={60}>
          <FeatureCatalogue />
        </Reveal>
      </section>

      <section className="section" id="pricing">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Pricing</span>
          <h2>
            Plans in <span className="gradient-text">Knowledge Coins</span>
          </h2>
          <p>
            Only the free plan is metered. Every paid plan carries unlimited documents and
            uploads, for as many people as you need.
          </p>
        </Reveal>
        <Reveal variant="up" delay={60}>
          <PricingPreview />
        </Reveal>
      </section>

      {/* Where the documents actually live. Rendered from the storage register, so a
          new backend shows up on the front page the day it is added to the list. */}
      <section className="section" id="storage">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Storage</span>
          <h2>
            We keep the catalogue. <span className="gradient-text">You keep the contents.</span>
          </h2>
          <p>
            Your documents live on storage you provide and control — a NAS in your own
            building today, more backends as their adapters ship. We hold only what answers
            who may see what, and what has been done.
          </p>
        </Reveal>
        <div className="home-storage-grid">
          {STORAGE_BACKENDS.map((b, i) => (
            <Reveal
              key={b.key}
              className="home-storage-card glass"
              variant="up"
              delay={i * 60}
            >
              <span className="home-storage-icon" aria-hidden>
                {b.icon}
              </span>
              <span className="badge storage-status" data-status={b.status}>
                {STATUS_LABEL[b.status]}
              </span>
              <h3>{b.name}</h3>
              <p>{b.tagline}</p>
              <Link className="home-storage-link" href={`/storage#${b.key}`}>
                How it works →
              </Link>
            </Reveal>
          ))}
        </div>
        <div className="hero-cta" style={{ justifyContent: "center" }}>
          <Link className="btn btn-quiet" href="/storage">
            Read the whole storage story
          </Link>
        </div>
      </section>

      <section className="section">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Why teams choose it</span>
          <h2>Built on four uncompromising pillars</h2>
        </Reveal>
        <div className="pillar-grid">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} className="pillar-card glass" variant="up" delay={i * 80}>
              <span className="pillar-icon" aria-hidden>
                {p.icon}
              </span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">How it works</span>
          <h2>Four steps to a living structure</h2>
        </Reveal>
        <div className="how-rail">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} className="how-step glass" variant={i % 2 ? "right" : "left"} delay={i * 60}>
              <span className="how-num gradient-text">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section">
        <Reveal variant="scale">
          <div className="cta-band glass">
            <div className="cta-orbit" aria-hidden />
            <h2>
              Ready to map your <span className="gradient-text">constellation</span>?
            </h2>
            <p>Create a profile, found your organization, and watch your structure light up.</p>
            <div className="hero-cta" style={{ marginTop: 0 }}>
              <Link className="btn btn-primary btn-lg" href="/register">
                Create your profile
              </Link>
              <Link className="btn btn-quiet btn-lg" href="/login">
                Sign in
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="footer">
        <span>Knowledge Vault — your structure, your knowledge, your custody.</span>
        <span className="footer-links">
          <Link href="/features">Features</Link>
          <Link href="/storage">Storage</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help &amp; guide book</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Register</Link>
          <Link href="/kbase/login" className="footer-employee">Knowledge base employee login</Link>
        </span>
      </footer>
    </main>
  );
}
