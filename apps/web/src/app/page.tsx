import Link from "next/link";
import { ApiStatus } from "@/components/ApiStatus";
import { Constellation } from "@/components/Constellation";
import { SiteNav } from "@/components/SiteNav";

const FEATURES = [
  {
    icon: "✦",
    title: "Constellation graph",
    text: "Your whole structure as a living star map — pan, zoom, and click any role-star to see people, courses, and act on it directly.",
  },
  {
    icon: "🛡",
    title: "Separated admin console",
    text: "Members see a calm learning view; owners get a dedicated console for roles, people, courses, owners, and backups.",
  },
  {
    icon: "📚",
    title: "Role-based learning",
    text: "Courses attach to roles and flow down the tree — mandatory or opt-in, with deadlines, retakes, and prerequisites.",
  },
  {
    icon: "🔑",
    title: "Your custody, always",
    text: "The Supreme password and the .main file stay with you. The platform holds nothing crucial — you hold everything.",
  },
  {
    icon: "🎨",
    title: "Multi-theme design",
    text: "Day and night themes with four accent palettes — glass surfaces, soft depth, and motion that respects reduced-motion.",
  },
  {
    icon: "📱",
    title: "Every screen size",
    text: "A sidebar workspace on desktop becomes a floating tab bar on mobile — the same power in your pocket.",
  },
];

const STEPS = [
  {
    title: "Create your profile",
    text: "One global username works across every organization you join or found.",
  },
  {
    title: "Found an organization",
    text: "Set the unrecoverable Supreme password — the root of your custody model.",
  },
  {
    title: "Grow the constellation",
    text: "Add roles and sub-roles, place people as owners or members, delegate branches.",
  },
  {
    title: "Publish learning",
    text: "Attach documents, books, links, audio and video to roles — mandatory or opt-in.",
  },
];

export default function Home() {
  return (
    <main>
      <SiteNav right={<Link href="/login" className="nav-link">Sign in</Link>} />

      <section className="hero">
        <Constellation />
        <div className="hero-content">
          <span className="eyebrow">Training · Compliance · Custody</span>
          <h1>
            Your organization&apos;s knowledge,
            <br />
            <span className="gradient-text">in your custody.</span>
          </h1>
          <p>
            Mandatory and role-based training, structured like your organization — a
            constellation of roles, courses, and people. The platform holds nothing
            crucial; you hold everything.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-primary" href="/register">
              Get started free
            </Link>
            <Link className="btn btn-quiet" href="/help">
              How it works
            </Link>
          </div>
          <ApiStatus />
        </div>
        <span className="hero-scroll" aria-hidden>
          ↓
        </span>
      </section>

      <section className="section" id="features">
        <div className="section-head">
          <span className="eyebrow">Why Knowledge Vault</span>
          <h2>
            Built like a <span className="gradient-text">night sky</span>, run like a
            tight ship
          </h2>
          <p>
            Everything an organization needs to teach, track and stay compliant — with a
            custody model that keeps existence itself in your hands.
          </p>
        </div>
        <div className="feature-grid stagger">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card glass">
              <span className="feature-icon" aria-hidden>
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2>Four steps to a living structure</h2>
        </div>
        <div className="step-list stagger">
          {STEPS.map((s, i) => (
            <div key={s.title} className="step glass">
              <span className="step-num gradient-text">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="cta-band glass">
          <h2>
            Ready to map your <span className="gradient-text">constellation</span>?
          </h2>
          <p>
            Create a profile, found your organization, and watch your structure light up.
          </p>
          <div className="hero-cta" style={{ marginTop: 0 }}>
            <Link className="btn btn-primary" href="/register">
              Create your profile
            </Link>
            <Link className="btn btn-quiet" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>Knowledge Vault — your structure, your knowledge, your custody.</span>
        <span className="footer-links">
          <Link href="/help">Help</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Register</Link>
        </span>
      </footer>
    </main>
  );
}
