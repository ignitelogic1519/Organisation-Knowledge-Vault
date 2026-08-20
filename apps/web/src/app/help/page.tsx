import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata = {
  title: "Help & guide book — Knowledge Vault",
  description:
    "A plain-language guide to every part of Knowledge Vault, plus the complete Main Guide Book to download.",
};

/** The published guide book, served from the app's own public folder. */
const GUIDE_PDF = "/guide/Knowledge-Vault-Main-Guide-Book.pdf";
const GUIDE_MD = "/guide/Knowledge-Vault-Main-Guide-Book.md";
const GUIDE_CHAPTERS = 24;

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
            Manage or delete your profile, and read your Knowledge Coin balance, from the{" "}
            <strong>Account</strong> page.
          </li>
          <li>
            A session ends after <strong>an hour away from the keyboard</strong>, with a
            warning in the last minute — see <em>Staying signed in</em> below.
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
    icon: "🗂",
    title: "Your organizations",
    body: (
      <>
        <p>
          The page you land on after signing in holds every organization you belong to, each
          as a <strong>card</strong>: its badge, its number, how long its plan has left, and
          the positions you hold inside it.
        </p>
        <ul>
          <li>
            The <strong>plan chip</strong> counts in the largest unit that still means
            something — <em>14 months left</em>, <em>12 days left</em>, <em>20h left</em> —
            with a dot that darkens as the end approaches. Hover it for the exact date.
          </li>
          <li>
            Past five organizations the page grows a <strong>filter bar</strong> (All /
            Owner / Member) and a <strong>search</strong> that covers the name, the number
            and <em>your own role names</em>.
          </li>
          <li>
            Give an organization a <strong>logo</strong> from its root branch&apos;s Group
            configuration — it then appears on the card, beside the name on every page, and
            on the documents you publish.
          </li>
          <li>
            <strong>Recovery</strong>, bottom-left, holds both ways back from a deletion:
            the 30-day list, and a <code>.main</code> revival for anything already purged.
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
          <li>
            Role names are <strong>laid out like place-names on a map</strong> — placed in
            the first free space, ranked by how much you need them, and left off entirely
            rather than printed on top of a neighbour. Zoom in and a missing name comes
            back.
          </li>
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
          Courses (documents, books, links, audio, video and exams) are published onto roles
          and can <strong>inherit down</strong> the branch. Your{" "}
          <strong>My Learning</strong> tab collects everything that reaches your position.
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
          <li>
            Everything opens in the <strong>reader</strong>, inside the app: the standard
            cover page first, then scope, then the document. Zoom with{" "}
            <strong>Ctrl/⌘ + scroll</strong>, a pinch, or the reading-size pill — text
            re-wraps rather than forcing you to scroll sideways, and PDFs re-render sharp.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "✍",
    title: "The Document Studio",
    body: (
      <>
        <p>
          Instead of uploading a file, you can <strong>compose the document here</strong> —
          headings, rich text, tables, checklists, callouts, images, audio, video, embeds,
          columns and page breaks — and watch it render in your organization&apos;s standard
          frame as you write.
        </p>
        <ul>
          <li>
            The Studio asks one question first: a <strong>document</strong>, or an{" "}
            <strong>exam</strong>. Both carry the same classification, description, shelf and
            placement settings.
          </li>
          <li>
            Your browser keeps a copy <strong>as you type</strong>, on every plan. Parking a
            draft on the server — to pick it up on another device — is a paid capability.
          </li>
          <li>
            A chip beside the publish button reads <strong>Ready to publish</strong>, or
            names exactly what is missing. Hover anything compulsory and a hint says why it
            is compulsory.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🔁",
    title: "Editions & the review channel",
    body: (
      <>
        <p>
          Nothing published is quietly overwritten. Revising something produces a{" "}
          <strong>new edition</strong> — v1.0 becomes v2.0 — with a dated note saying what
          changed and who changed it.
        </p>
        <ul>
          <li>
            The order is fixed, because readers are on the current edition:{" "}
            <strong>take it out of deployment</strong>, revise it (or replace the file),
            then <strong>publish the next edition</strong>. Placements are kept untouched.
          </li>
          <li>
            Switch on <em>updates reset completion</em> and publishing a new edition asks
            everyone to read it again. Leave it off and completions stand.
          </li>
          <li>
            Editing what the organization <em>says</em> about a document — its shelf,
            description, deadline, prerequisites — is <strong>not</strong> an edition. No
            version bump, no re-read.
          </li>
          <li>
            A new document can <strong>coexist</strong> with the one it replaces or{" "}
            <strong>supersede</strong> it, inheriting every branch the old one reached on
            the same terms. The retired code still resolves, and forwards.
          </li>
          <li>
            A member with the <strong>create content</strong> right proposes rather than
            publishes. The reviewer previews it full screen and either approves it, declines
            it, or <strong>sends it back with a note</strong> — with a conversation attached
            to the review.
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
            Requests carry clear categories: <strong>Course</strong>, <strong>Join</strong>,{" "}
            <strong>Deletion</strong>, <strong>Visibility</strong>, and{" "}
            <strong>Document review</strong> — each with its own label in your mailbox.
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
    icon: "📊",
    title: "Compliance — and honest deadlines",
    body: (
      <>
        <p>
          For any branch you govern, <strong>Compliance</strong> shows per-course completion
          across the whole subtree, and says <strong>why</strong> each person is not
          compliant in plain words rather than a bare &ldquo;not completed&rdquo;.
        </p>
        <ul>
          <li>
            <strong>Look up a person</strong> answers the other question managers ask:
            every course that reaches them, each with a status and a reason, in one card.
          </li>
          <li>
            A deadline is <strong>how long someone has after the course reaches them</strong>
            . The clock starts at the later of the day it was placed and the day they joined
            the branch — so a new starter is never instantly late for a course that has been
            there for a year.
          </li>
          <li>
            A recurring course that lapses opens a <strong>new cycle</strong>, dated from the
            lapse; a republished edition that resets completions dates the new obligation to
            the republish. Genuinely late people are still late.
          </li>
          <li>
            Tick the people who are behind and <strong>send a reminder</strong>, deep-linked
            to the exact course.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🧪",
    title: "Exams, attempts & resets",
    body: (
      <>
        <p>
          An exam is built in the same Studio as a document, and is marked on the server —
          the answer key never reaches the browser.
        </p>
        <ul>
          <li>
            In My Learning an exam reads <strong>&ldquo;Complete the exam&rdquo;</strong>;
            passing it completes the course, exactly as finishing a document does.
          </li>
          <li>
            The author can cap the <strong>number of attempts</strong>. Spend them all
            without passing and the exam locks.
          </li>
          <li>
            The branch&apos;s <strong>Compliance</strong> view then says so in plain words —
            &ldquo;has used every attempt&rdquo; rather than a bare &ldquo;not
            completed&rdquo; — beside the attempts used and the best score.
          </li>
          <li>
            A <strong>manager or higher can reset</strong> the allowance in one click. The
            sittings stay on record; only the count goes back to zero, and the candidate is
            told they can try again.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "📥",
    title: "The Mailbox",
    body: (
      <>
        <p>
          Everything the platform has to tell you arrives in one <strong>mailbox</strong>,
          reachable from the bell on every page. It works like a mail client: folders down
          the side, a message list in the middle, and a reading pane.
        </p>
        <ul>
          <li>
            <strong>Folders by category</strong> — Knowledge Base, Requests, Publishing,
            Learning, Plans &amp; Coins, People, System — plus a{" "}
            <strong>label per organization</strong>, so you can read one organization at a
            time.
          </li>
          <li>
            <strong>Sub-labels</strong> tell request kinds apart at a glance: document
            publishing, a course for your path, a join request, a branch deletion, a
            visibility request.
          </li>
          <li>
            Messages from the <strong>Knowledge Base team</strong> — access codes, plan
            decisions, coin adjustments — arrive flagged <strong>high priority</strong> and
            pinned to the top.
          </li>
          <li>
            <strong>Everything expires.</strong> Each message shows how long it has left,
            and deletes itself when it gets there. Knowledge Base mail lives 30 days;
            routine notices go sooner.
          </li>
          <li>
            Select several messages to mark or delete them together, search the lot, and
            turn the arrival <strong>chime</strong> on or off.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "⏳",
    title: "Staying signed in",
    body: (
      <>
        <p>
          A session ends after <strong>one hour of inactivity</strong>, and the next visit
          asks for your password — with the reason on the screen rather than a bare prompt.
        </p>
        <ul>
          <li>
            What counts as activity is <strong>the person, not the program</strong>: a
            click, a key, a scroll, a touch, a page opened. Background polling and token
            refreshes do not keep a session alive.
          </li>
          <li>
            The last minute is announced by a <strong>&ldquo;Still there?&rdquo;</strong>{" "}
            card with <strong>Stay signed in</strong> beside it — never a modal, because a
            dialog would block the very movement that keeps you signed in.
          </li>
          <li>
            Every tab agrees: one window timing out signs the rest out with the same
            explanation. Closing the laptop counts as being away.
          </li>
          <li>
            Signing out ends the <strong>session</strong>, not just this tab — which is the
            right default on a shared machine.
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
            is the <em>only</em> way to revive the organization. Both routes back live behind{" "}
            <strong>Recovery</strong>, in the bottom-left of your Organizations page.
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
    icon: "🗄",
    title: "Where your documents live",
    body: (
      <>
        <p>
          <strong>We keep the catalogue; you keep the contents.</strong> Your documents live on
          storage you provide and control — we hold only the things that answer{" "}
          <em>who may see what</em> and <em>what has been done</em>.
        </p>
        <ul>
          <li>
            <strong>NAS — your own storage.</strong> An S3-compatible server on hardware you
            own. Uploads go from the browser straight to it through a short-lived signed link;
            the bytes never cross our servers.
          </li>
          <li>
            <strong>Encrypted or readable.</strong> Encrypted storage holds opaque{" "}
            <code>.kvblob</code> objects nobody can open out of band. The choice is fixed once
            storage is active.
          </li>
          <li>
            <strong>KVEP</strong> is the Knowledge Vault Employee Perk — staff organizations
            whose content stays with us. It is not available to customers.
          </li>
        </ul>
        <p>
          The <Link href="/storage">Storage page</Link> walks through every arrangement step by
          step, compares them side by side, and lists the backends still to come.
        </p>
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
          and five <strong>accent palettes</strong> (Peach, Aurora, Ocean, Sunset, Forest).
        </p>
        <ul>
          <li>
            The warm <strong>peach-white day theme</strong> is the default. Night mode and
            every accent are one click away.
          </li>
          <li>
            Your choice is stored in a cookie on this device, so signing in again brings
            back exactly the look you left.
          </li>
          <li>
            A third section, <strong>Motion</strong>, has an <strong>Animation</strong>{" "}
            switch for the ambient movement — off by default, and remembered per device.
          </li>
          <li>
            On a device with a real pointer the app draws <strong>its own cursor</strong>: a
            star over anything clickable, a turning book while it fetches, a nib over text.
            It follows a document or an exam into full screen, and hands the ordinary arrow
            back if it ever cannot draw.
          </li>
          <li>
            <strong>Hints</strong> replace the browser&apos;s tooltip — a card beside the
            pointer that explains not just what a control is, but why a compulsory field is
            compulsory.
          </li>
          <li>
            All motion respects your <em>reduced motion</em> preference.
          </li>
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
        {/* The full manual, downloadable. The PDF is the same book as the chapters in
            the repository, rebuilt whenever the product changes. */}
        <section className="guidebook-panel glass">
          <div className="guidebook-cover" aria-hidden>
            📘
          </div>
          <div className="guidebook-body">
            <span className="eyebrow">The Main Guide Book</span>
            <h3>The complete manual, {GUIDE_CHAPTERS} chapters, yours to keep</h3>
            <p>
              Every screen in the product, explained in plain language and in the order you
              actually meet it — founding an organization, building the structure, placing
              people, authoring in the Studio, running exams, revising what you published,
              tracking compliance, reading the mailbox, and keeping custody of it all.
              Written for the people who use Knowledge Vault, not for the people who build
              it.
            </p>
            <p>
              Every chapter carries a <strong>why it matters</strong> table — the benefit
              measured on time, risk &amp; compliance, security &amp; custody, cost and
              adoption — and a ready-made <strong>shot list</strong>, if you are recording a
              walk-through for your own people.
            </p>
            <div className="guidebook-actions">
              <a className="btn btn-primary" href={GUIDE_PDF} download>
                ⬇ Download the PDF
              </a>
              <a className="btn btn-quiet" href={GUIDE_MD} download>
                ⬇ Download as Markdown
              </a>
              <a className="btn btn-quiet" href={GUIDE_PDF} target="_blank" rel="noreferrer">
                Read it in the browser ↗
              </a>
            </div>
            <p className="auth-sub guidebook-note">
              Updated with every release. If a screenshot here looks different from what you
              see, you are on a newer build than the book — the chapters are dated inside.
            </p>
          </div>
        </section>

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
