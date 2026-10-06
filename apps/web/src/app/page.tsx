import Link from "next/link";
import { ApiStatus } from "@/components/ApiStatus";
import { Constellation } from "@/components/Constellation";
import { FeatureCatalogue } from "@/components/FeatureCatalogue";
import { HeroCta } from "@/components/HeroCta";
import {
  IconBolt,
  IconDoc,
  IconGrid,
  IconHierarchy,
  IconKey,
  IconServer,
  IconShield,
  IconUsers,
} from "@/components/icons";
import { LandingShowcase } from "@/components/LandingShowcase";
import { PricingPreview } from "@/components/PricingPreview";
import { Reveal } from "@/components/Reveal";
import { SiteNav } from "@/components/SiteNav";
import { StorageIcon } from "@/components/StorageIcon";
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

/* What the product does for you, in four plain lines — not counters that need a footnote.
   (A "100% data custody" claim was dropped: the documents are yours, on your storage, but we
   do hold the catalogue of who may see what — so "100%" would not be true.) */
const BENEFITS = [
  {
    icon: <IconUsers size={22} />,
    title: "Role-based workflows",
    text: "Training, reviews and requests follow your structure.",
  },
  {
    icon: <IconServer size={22} />,
    title: "Your storage, your control",
    text: "Documents live on storage you provide. We keep only the catalogue.",
  },
  {
    icon: <IconGrid size={22} />,
    title: "One connected workspace",
    text: "Structure, library, exams and mail in one place.",
  },
  {
    icon: <IconHierarchy size={22} />,
    title: "Unlimited role depth",
    text: "Roles and sub-roles as deep as your organization goes.",
  },
];

const PILLARS = [
  {
    icon: <IconKey size={22} />,
    title: "Custody by design",
    text: "The Supreme password and the .main recovery file never leave your hands. The platform holds nothing it could hold hostage.",
  },
  {
    icon: <IconShield size={22} />,
    title: "Least-privilege governance",
    text: "Owners hold only the rights granted to them — and can never hand out a capability they don't have themselves.",
  },
  {
    icon: <IconBolt size={22} />,
    title: "Real-time everywhere",
    text: "Changes to structure, requests, courses and messages appear at once for everyone who has the page open.",
  },
  {
    icon: <IconDoc size={22} />,
    title: "Standardized documents",
    text: "Every document gets an authenticated cover, a classification, and a header and footer — consistent, professional, auditable.",
  },
];

/** What a customer can choose today, and — kept apart and smaller — what is coming. */
const STORAGE_NOW = STORAGE_BACKENDS.filter((b) => b.status === "live" && !b.internal);
const STORAGE_LATER = STORAGE_BACKENDS.filter((b) => b.status !== "live");

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
            Organize your team&apos;s knowledge, deliver role-based training, and keep an
            auditable record — all under your control.
          </p>
          {/* Both account doors — register and sign in — decided in the browser. */}
          <HeroCta />
        </div>
        <span className="hero-scroll" aria-hidden>
          ↓
        </span>
      </section>

      <section className="section section-first" id="showcase">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">The product</span>
          <h2>
            One platform for{" "}
            <span className="gradient-text heading-phrase">your people and knowledge</span>
          </h2>
          <p>
            The surfaces your team lives in every day — mapped, shelved, authored and
            measured.
          </p>
        </Reveal>
        <Reveal variant="scale" delay={80}>
          <LandingShowcase />
        </Reveal>

        {/* Right under the product, as part of the same story — not a section of its own. */}
        <ul className="benefit-band glass">
          {BENEFITS.map((b, i) => (
            <Reveal as="li" key={b.title} className="benefit" variant="up" delay={i * 70}>
              <span className="icon-tile" aria-hidden>
                {b.icon}
              </span>
              <span className="benefit-copy">
                <strong className="benefit-title">{b.title}</strong>
                <span className="benefit-text">{b.text}</span>
              </span>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* The essential story is told above and here; the flip cards below are for digging in. */}
      <section className="section">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Why teams choose it</span>
          <h2>Four principles. Built into everything.</h2>
        </Reveal>
        <div className="pillar-grid">
          {PILLARS.map((p, i) => (
            <Reveal key={p.title} className="pillar-card glass" variant="up" delay={i * 80}>
              <span className="icon-tile" aria-hidden>
                {p.icon}
              </span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section" id="features">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Explore in depth</span>
          <h2>
            Every feature, <span className="gradient-text">area by area</span>
          </h2>
          <p>
            Pick an area and turn any card over for the detail. Everything here is built
            and working — nothing on this page is a promise.
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
            building or your Google Drive today, more as their adapters ship. We hold only
            what answers who may see what, and what has been done.
          </p>
        </Reveal>
        <div className="home-storage-grid">
          {STORAGE_NOW.map((b, i) => (
            <Reveal
              key={b.key}
              className="home-storage-card glass"
              variant="up"
              delay={i * 60}
            >
              <span className="home-storage-top">
                <span className="icon-tile" aria-hidden>
                  <StorageIcon backend={b.key} />
                </span>
                <span className="badge storage-status" data-status={b.status}>
                  {STATUS_LABEL[b.status]}
                </span>
              </span>
              <h3>{b.name}</h3>
              <p>{b.tagline}</p>
              <Link className="home-storage-link" href={`/storage#${b.key}`}>
                How it works →
              </Link>
            </Reveal>
          ))}
        </div>
        {STORAGE_LATER.length > 0 && (
          <div className="home-storage-later">
            <h3 className="home-storage-later-title">On the roadmap</h3>
            <ul>
              {STORAGE_LATER.map((b) => (
                <li key={b.key}>
                  <span className="home-storage-later-icon" aria-hidden>
                    <StorageIcon backend={b.key} />
                  </span>
                  <span className="home-storage-later-copy">
                    <Link href={`/storage#${b.key}`}>{b.name}</Link>
                    <span>{b.tagline}</span>
                  </span>
                  <span className="badge storage-status" data-status={b.status}>
                    {STATUS_LABEL[b.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="hero-cta" style={{ justifyContent: "center" }}>
          <Link className="btn btn-quiet" href="/storage">
            Read the whole storage story
          </Link>
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
            <p>Create your profile, found your organization, and watch your structure light up.</p>
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
        <span className="footer-lead">
          <span>Knowledge Vault — your structure, your knowledge, your custody.</span>
          <ApiStatus />
        </span>
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
