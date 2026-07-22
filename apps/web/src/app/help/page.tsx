import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "Help — Knowledge Vault",
};

// Help — a plain-language guide to every component of the platform, public so both
// prospective and signed-in users can read it (linked from the app sidebar too).

const TOPICS = [
  {
    icon: "👤",
    title: "Profile & signing in",
    body: (
      <>
        <p>
          You create <strong>one global profile</strong> with a username and password. That
          username is your identity everywhere — admins add you to organizations by typing
          it exactly. There is no email involved.
        </p>
        <ul>
          <li>
            <strong>Register</strong> once, then join or found any number of organizations.
          </li>
          <li>
            Manage or delete your profile from the <strong>Account</strong> page.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🏛",
    title: "Organizations & the Supreme",
    body: (
      <>
        <p>
          An organization is a tree of roles. Its invisible root is the{" "}
          <strong>Supreme</strong> — protected by the <strong>Supreme password</strong> you
          set at creation.
        </p>
        <ul>
          <li>
            The Supreme password is <strong>unrecoverable by anyone</strong> — it never
            leaves your custody.
          </li>
          <li>
            It gates owner management, organization deletion, and encrypts the{" "}
            <code>.main</code> file.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🌳",
    title: "Roles, owners & members",
    body: (
      <>
        <p>
          Roles form a tree (CEO → HR → Assistant HR…). People are placed on roles as{" "}
          <strong>owners</strong> (they govern that branch) or <strong>members</strong>{" "}
          (they learn).
        </p>
        <ul>
          <li>Owners can add people, and publish courses on their branch.</li>
          <li>
            Owners hold only the rights granted to them: <strong>creating sub-groups</strong>{" "}
            and <strong>appointing co-owners</strong> are separate flags — and nobody can
            grant a right they don&apos;t hold themselves.
          </li>
          <li>
            Branches are <strong>public by default</strong>: every member sees them in
            the constellation and can send a <strong>Join request</strong> to their
            owners. A checkbox in Group configuration makes a branch{" "}
            <strong>hidden</strong> from people on the same layer and below.
          </li>
          <li>
            Hidden inherits downward — a hidden branch hides its whole subtree until the
            chain above is unhidden (its owners can file a{" "}
            <strong>Visibility request</strong>). Owners <em>above</em> a hidden branch
            always keep seeing it, for hierarchy-wise transparency.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "✦",
    title: "The Constellation tab",
    body: (
      <>
        <p>
          The <strong>Constellation</strong> shows your organization as a star map laid
          out like a real tree: the first role at the top, every branch growing downward.
        </p>
        <ul>
          <li>
            <strong>Drag</strong> to pan, <strong>scroll or pinch</strong> to zoom, and
            watch the sky parallax in depth.
          </li>
          <li>
            <strong>Click a star</strong> you govern to open its action panel — choose
            between <strong>Group configuration</strong>, <strong>People</strong>,{" "}
            <strong>Courses</strong> and <strong>Backup</strong>.
          </li>
          <li>
            Clicking a position you have no access to simply tells you so — public
            branches offer a join request instead.
          </li>
          <li>Stars where you are placed glow with your accent color.</li>
        </ul>
      </>
    ),
  },
  {
    icon: "📚",
    title: "Courses & My Learning",
    body: (
      <>
        <p>
          Courses (documents, books, links, audio, video) are published onto roles and can{" "}
          <strong>inherit down</strong> the branch. Your <strong>Overview</strong> tab
          collects everything that reaches your position.
        </p>
        <ul>
          <li>
            <strong>Mandatory</strong> courses can carry deadlines; overdue ones are
            flagged and escalate.
          </li>
          <li>
            <strong>Retakes</strong> re-assign a course every N days; updates can reset
            completions.
          </li>
          <li>
            <strong>Prerequisites</strong> lock a course until earlier ones are completed.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "📖",
    title: "Library & Requests",
    body: (
      <>
        <p>
          The <strong>Library</strong> tab lists every course published to the
          organization; the <strong>Requests</strong> tab is the ask-and-approve center.
        </p>
        <ul>
          <li>
            Open a library entry for its description, completions, and the branches using
            it — then <strong>request it</strong> for your branch.
          </li>
          <li>
            Requests carry clear categories: <strong>Course request</strong>,{" "}
            <strong>Join request</strong>, <strong>Deletion request</strong>.
          </li>
          <li>
            Approving a course request means <strong>configuring it first</strong> —
            mandatory, inheritance, deadline and recurrence for that branch.
          </li>
          <li>
            Deleting a branch always needs the level above: its own owners file a
            Deletion request; approval executes it.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "💾",
    title: ".main & .bkp files",
    body: (
      <>
        <p>Custody means you hold the backups, not the platform.</p>
        <ul>
          <li>
            <code>.main</code> — the organization&apos;s <strong>existence backup</strong>,
            encrypted with the Supreme password. After deletion and the 30-day retention it
            is the <em>only</em> way to revive the organization.
          </li>
          <li>
            <code>.bkp</code> — an encrypted backup of a single branch, exportable by that
            branch&apos;s owners and restorable in place.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🎨",
    title: "Themes & appearance",
    body: (
      <>
        <p>
          The palette button opens appearance settings: a <strong>day/night switch</strong>{" "}
          and four <strong>accent palettes</strong> (Aurora, Ocean, Sunset, Forest).
        </p>
        <ul>
          <li>Your choice persists on this device; the default follows your system.</li>
          <li>
            All motion respects your <em>reduced motion</em> preference.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🔔",
    title: "Notifications",
    body: (
      <>
        <p>The bell shows what needs attention:</p>
        <ul>
          <li>a mandatory course became overdue,</li>
          <li>a completion expired and the course was re-assigned,</li>
          <li>someone you added has an overdue course,</li>
          <li>a course was updated and your completion was reset.</li>
        </ul>
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <main>
      <SiteNav right={<Link href="/orgs" className="nav-link">Open app</Link>} />
      <section className="page-wrap">
        <div className="section-head" style={{ marginBottom: "2.2rem" }}>
          <span className="eyebrow">Help</span>
          <h2>
            Understand every <span className="gradient-text">component</span>
          </h2>
          <p>
            A quick tour of the platform&apos;s ideas — from your profile to the custody
            files that keep your organization yours.
          </p>
        </div>
        <div className="help-grid stagger">
          {TOPICS.map((t) => (
            <div key={t.title} className="help-card glass">
              <h3>
                <span className="feature-icon" aria-hidden>
                  {t.icon}
                </span>
                {t.title}
              </h3>
              {t.body}
            </div>
          ))}
        </div>
        <div className="cta-band glass" style={{ marginTop: "2.5rem" }}>
          <h2>Still curious?</h2>
          <p>The best way to learn the constellation is to found one.</p>
          <div className="hero-cta" style={{ marginTop: 0 }}>
            <Link className="btn btn-primary" href="/register">
              Create your profile
            </Link>
            <Link className="btn btn-quiet" href="/orgs">
              Go to your organizations
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
