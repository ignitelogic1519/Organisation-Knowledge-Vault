import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SessionNavLinks } from "@/components/SessionNavLinks";
import { Reveal } from "@/components/Reveal";
import {
  COMPARISON_ROWS,
  STATUS_LABEL,
  STORAGE_BACKENDS,
  type StorageBackend,
} from "@/lib/storage-backends";

export const metadata = {
  title: "Where your documents live — Knowledge Vault",
  description:
    "The storage behind Knowledge Vault: NAS on your own hardware, the KVEP employee perk, and the backends coming after them. We keep the catalogue; you keep the contents.",
};

/**
 * The storage page.
 *
 * Everything here renders from `lib/storage-backends.ts`. A new way of storing documents —
 * a cloud bucket, a connector for a NAS with no public address — is one entry in that
 * register, and it appears on this page, in the comparison table and in the roadmap
 * section without anyone editing this file.
 */

function Backend({ b }: { b: StorageBackend }) {
  return (
    <article className="storage-backend glass" id={b.key}>
      <header className="storage-backend-head">
        <span className="storage-backend-icon" aria-hidden>
          {b.icon}
        </span>
        <div style={{ minWidth: 0 }}>
          <h3>{b.name}</h3>
          <p>{b.tagline}</p>
        </div>
        <span className="badge storage-status" data-status={b.status}>
          {STATUS_LABEL[b.status]}
        </span>
      </header>

      <p className="storage-whofor">
        <strong>Who it is for.</strong> {b.whoFor}
      </p>

      <h4 className="storage-sub">The process, step by step</h4>
      <ol className="storage-steps">
        {b.steps.map((s) => (
          <li key={s.title}>
            <strong>{s.title}</strong>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>

      <div className="storage-two">
        <div>
          <h4 className="storage-sub">What it gives you</h4>
          <ul className="storage-list" data-tone="good">
            {b.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="storage-sub">What it costs you</h4>
          <ul className="storage-list" data-tone="warn">
            {b.tradeoffs.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <dl className="storage-facts">
        {COMPARISON_ROWS.map((row) => (
          <div key={row.key}>
            <dt>{row.label}</dt>
            <dd>{b.facts[row.key]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default function StoragePage() {
  const live = STORAGE_BACKENDS.filter((b) => b.status === "live");
  const coming = STORAGE_BACKENDS.filter((b) => b.status !== "live");

  return (
    <main className="landing">
      <SiteNav right={<SessionNavLinks />} />

      <section className="section" style={{ paddingTop: "6rem" }}>
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Storage</span>
          <h2>
            We keep the catalogue. <span className="gradient-text">You keep the contents.</span>
          </h2>
          <p>
            Your documents do not have to live with us. An organization brings its own
            storage, configures it, pays for it, and can walk away with everything in it —
            while we hold only the things that answer <em>who may see what</em> and{" "}
            <em>what has been done</em>. This page is how each of those arrangements
            actually works.
          </p>
        </Reveal>

        {/* The dividing line, stated once, before any backend is described. */}
        <Reveal variant="up" delay={60}>
          <div className="storage-split glass">
            <div>
              <h3>Goes to your storage</h3>
              <ul>
                <li>Uploaded files — PDF, image, audio, video</li>
                <li>Studio-authored documents</li>
                <li>Exams and their answer keys</li>
                <li>Studio drafts</li>
              </ul>
            </div>
            <span className="storage-split-rule" aria-hidden />
            <div>
              <h3>Stays with us</h3>
              <ul>
                <li>Roles, placements and capabilities</li>
                <li>Course metadata — code, title, classification, deadlines</li>
                <li>Completion records and exam results</li>
                <li>Requests, mailbox, plans, coins, audit logs</li>
              </ul>
            </div>
          </div>
        </Reveal>
        <p className="storage-note">
          The rule behind that split: anything small enough to stay queryable when your
          storage is unreachable, and load-bearing enough that a permission decision depends
          on it, stays with us. Everything else is yours.
        </p>
      </section>

      <section className="section" id="available">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Available now</span>
          <h2>
            Two ways to store, <span className="gradient-text">today</span>
          </h2>
          <p>
            One for organizations, one for our own staff. Both are shipping; both are
            described here in full, including what they cost you.
          </p>
        </Reveal>
        <div className="storage-stack">
          {live.map((b, i) => (
            <Reveal key={b.key} variant="up" delay={i * 70}>
              <Backend b={b} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section" id="comparison">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">Side by side</span>
          <h2>
            The four questions that <span className="gradient-text">decide everything</span>
          </h2>
          <p>
            Every storage backend, present or future, is classified by the same four answers.
            They are what determine the cost, the effort and whether a backend is possible at
            all.
          </p>
        </Reveal>
        <Reveal variant="up" delay={60}>
          <div className="storage-tablewrap glass">
            <table className="storage-table">
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  {STORAGE_BACKENDS.map((b) => (
                    <th key={b.key} scope="col">
                      {b.icon} {b.name.split(" — ")[0]}
                      <span className="storage-th-status" data-status={b.status}>
                        {b.status === "live" ? "now" : b.status === "planned" ? "planned" : "exploring"}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      {row.label}
                      <span className="storage-hint">{row.hint}</span>
                    </th>
                    {STORAGE_BACKENDS.map((b) => (
                      <td key={b.key} data-label={`${b.icon} ${b.name.split(" — ")[0]}`}>
                        {b.facts[row.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      <section className="section" id="coming">
        <Reveal className="section-head" variant="up">
          <span className="eyebrow">What comes next</span>
          <h2>
            Room for <span className="gradient-text">every backend after these</span>
          </h2>
          <p>
            The storage adapter speaks one protocol on purpose: everything in the S3 family
            is configuration rather than new code. The list below is where the next ones go,
            in the order their difficulty puts them — and it is a register the product reads
            from, not a page someone has to remember to update.
          </p>
        </Reveal>
        <div className="storage-stack">
          {coming.map((b, i) => (
            <Reveal key={b.key} variant="up" delay={i * 70}>
              <Backend b={b} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section">
        <Reveal variant="scale">
          <div className="cta-band glass">
            <div className="cta-orbit" aria-hidden />
            <h2>
              Ready to keep your own <span className="gradient-text">documents</span>?
            </h2>
            <p>
              Founding an organization walks you through connecting storage and tests it
              before anything is created — a failed test costs you nothing and does not
              consume your access code.
            </p>
            <div className="hero-cta" style={{ marginTop: 0 }}>
              <Link className="btn btn-primary btn-lg" href="/orgs/new">
                Create an organization
              </Link>
              <Link className="btn btn-quiet btn-lg" href="/help">
                Read the setup guide
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="footer">
        <span>Knowledge Vault — your structure, your knowledge, your custody.</span>
        <span className="footer-links">
          <Link href="/features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/help">Help &amp; guide book</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Register</Link>
        </span>
      </footer>
    </main>
  );
}
