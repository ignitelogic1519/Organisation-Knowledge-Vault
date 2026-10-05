"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { hasSession } from "@/lib/auth-client";
import { useDialogs } from "./dialogs";
import {
  IconArchive,
  IconBell,
  IconCap,
  IconChart,
  IconClock,
  IconCoin,
  IconDoc,
  IconExam,
  IconEyeOff,
  IconFlag,
  IconFlip,
  IconGrid,
  IconHierarchy,
  IconHourglass,
  IconInbox,
  IconKey,
  IconLayers,
  IconLibrary,
  IconPalette,
  IconPencil,
  IconRecovery,
  IconRefresh,
  IconSearch,
  IconShield,
  IconStars,
  IconTag,
  IconUsers,
  IconVolume,
} from "./icons";

// The feature catalogue, shared by the front page and /features. Grouped so a visitor can
// find the part of the product they came for, rather than reading a wall of bullets.
//
// Each feature is a flip card: the front names it, a click turns it over to the full
// description and, where there is one, the way into it. Scanning a row of names is quick;
// the paragraph is there the moment you want it, and not before.
//
// Some entries are gated: they describe a surface that only exists once you are signed in.
// Rather than dead-ending on a login wall, the card says so and offers the sign-in.

export interface Feature {
  /** A stroke icon from components/icons — it inherits the accent colour. */
  icon: React.ReactNode;
  title: string;
  text: string;
  /** Where it lives in the product — only reachable when signed in. */
  href?: string;
  /** Shown as a small "needs an account" note. */
  gated?: boolean;
}

export interface FeatureGroup {
  id: string;
  label: string;
  blurb: string;
  features: Feature[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "structure",
    label: "Structure & people",
    blurb:
      "Your organization as it really is: a tree of roles, with people placed exactly where they belong.",
    features: [
      {
        icon: <IconStars size={22} />,
        title: "The Constellation",
        text: "Your whole organization as a live star map. Pan, zoom, and click any branch you govern to act on it — no menus to hunt through.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconHierarchy size={22} />,
        title: "Roles & sub-roles, without limit",
        text: "Build CEO → HR → Assistant HR as deep as your organization goes. Every role carries a permanent number that is never reused.",
      },
      {
        icon: <IconShield size={22} />,
        title: "Least-privilege governance",
        text: "Owners hold only the rights granted to them, and can never hand out a capability they don't hold themselves. Creating sub-groups and appointing co-owners are separate, explicit flags.",
      },
      {
        icon: <IconUsers size={22} />,
        title: "Owners, members and reviewers",
        text: "Place someone as an owner who governs a branch, or a member who learns from it. Members can be allowed to propose content that publishes after review.",
      },
      {
        icon: <IconEyeOff size={22} />,
        title: "Public and hidden branches",
        text: "Branches are public by default and accept join requests. Hide one and its whole subtree disappears from the layer below — while the levels above always keep seeing it.",
      },
      {
        icon: <IconSearch size={22} />,
        title: "Live username suggestions",
        text: "Adding someone? Type two letters and see who actually exists, before you commit. Unknown usernames are reserved and attach the moment that person registers.",
      },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge & the Studio",
    blurb: "Author it, classify it, shelve it — and know exactly who it reaches.",
    features: [
      {
        icon: <IconPencil size={22} />,
        title: "The Document Studio",
        text: "Build documents block by block — headings, tables, images, embeds, page breaks and turn animations — with an authenticated cover page and a consistent house style.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconExam size={22} />,
        title: "Exams that mark themselves",
        text: "Build an MCQ paper in the same Studio: weighted questions, shuffling, time limits, attempt allowances and an invigilator that notices when a candidate leaves the paper. The answer key never leaves the server.",
      },
      {
        icon: <IconLibrary size={22} />,
        title: "The Library",
        text: "Every published course on one shelf, filterable by category, with ratings and reviews from the people who completed it. Request one for your own branch in a click.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconTag size={22} />,
        title: "Classification as standard",
        text: "Public, Confidential, Private or Secret — every document carries one, on its cover and in every list. Downloads are off unless the owner turns them on.",
      },
      {
        icon: <IconDoc size={22} />,
        title: "Real document viewing",
        text: "PDFs render inside the app rather than depending on the browser's plugin, with Ctrl+scroll and pinch zoom in full screen. Audio, video, images and links all play in place.",
      },
      {
        icon: <IconLayers size={22} />,
        title: "Editions, not overwrites",
        text: "Take a document out of deployment, revise it, and publish v2.0 — placements are kept, and you decide whether completions reset.",
      },
    ],
  },
  {
    id: "compliance",
    label: "Learning & compliance",
    blurb: "The right course reaching the right person, and proof that it landed.",
    features: [
      {
        icon: <IconCap size={22} />,
        title: "My Learning",
        text: "Everything that reaches your position, split into what's pending and what's done, with deadlines, recurrence and prerequisites made plain.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconChart size={22} />,
        title: "Compliance, per branch and per person",
        text: "For every course reaching a branch you govern: who is compliant, who isn't, and — in plain words — why. Not started, overdue, expired, or out of exam attempts. Look one person up and get every course that reaches them, in one card.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconRefresh size={22} />,
        title: "Exam resets by a manager",
        text: "A candidate who has spent every attempt can't sit the paper again on their own. Their manager resets the allowance in one click; the sittings stay on record.",
      },
      {
        icon: <IconClock size={22} />,
        title: "Deadlines that escalate — and are fair",
        text: "An overdue mandatory course notifies the learner and the person who placed them. A deadline runs from the day the course reached that person, so a new starter is never instantly late for something placed a year ago.",
      },
      {
        icon: <IconBell size={22} />,
        title: "Reminders with a human voice",
        text: "Pick the people who are behind and send a default or custom nudge straight to their mailbox.",
      },
    ],
  },
  {
    id: "mailbox",
    label: "The Mailbox",
    blurb:
      "One message surface on every page — categorised, prioritised, and it cleans up after itself.",
    features: [
      {
        icon: <IconInbox size={22} />,
        title: "A real mail client",
        text: "Folders per category, labels per organization, multi-select, search and a reading pane. Everything the platform has to tell you, in one place, on every page.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconFlag size={22} />,
        title: "Knowledge Base mail flagged high",
        text: "Access codes, plan decisions and coin adjustments arrive flagged and pinned to the top, so an important message never sits below routine noise.",
      },
      {
        icon: <IconTag size={22} />,
        title: "Every request kind labelled",
        text: "Document publishing, a course for your path, join requests, branch deletion, visibility — each carries its own label, so you can read one kind and ignore the rest.",
      },
      {
        icon: <IconHourglass size={22} />,
        title: "Messages that expire",
        text: "Every message shows exactly when it deletes itself, and then does. Your mailbox and our database both stay clean without anyone tidying.",
      },
      {
        icon: <IconVolume size={22} />,
        title: "Live, with a chime",
        text: "Messages arrive the instant they're written, over a live connection — with a soft chime you can switch off.",
      },
    ],
  },
  {
    id: "custody",
    label: "Custody & plans",
    blurb: "The platform holds nothing it could hold hostage.",
    features: [
      {
        icon: <IconKey size={22} />,
        title: "The Supreme password",
        text: "Set at founding, unrecoverable by anyone including us. It gates owner management, deletion, and the encryption of your existence backup.",
      },
      {
        icon: <IconArchive size={22} />,
        title: ".main and .bkp files",
        text: "Export an encrypted backup of the whole organization, or of a single branch, and keep it yourself. It is the one way back after a purge — and it works.",
      },
      {
        icon: <IconRecovery size={22} />,
        title: "Recovery, not a cliff",
        text: "A deleted organization waits 30 days, restorable with the Supreme password in one click. After the purge, your .main file still brings it back — both routes live behind one Recovery button on your organizations page.",
      },
      {
        icon: <IconClock size={22} />,
        title: "Sessions that actually end",
        text: "An hour away from the keyboard ends a session, and the next visit is told why. Background polling doesn't count as presence — only a click, a key, a scroll or a page opened does, and the last minute is announced.",
      },
      {
        icon: <IconCoin size={22} />,
        title: "Knowledge Coins & plans",
        text: "Plans are paid in coins. Only the free plan is metered — every paid plan carries unlimited documents and uploads.",
        href: "/pricing",
      },
      {
        icon: <IconGrid size={22} />,
        title: "A dashboard that scales",
        text: "Every organization as a card — its logo, its number, its plan in months rather than thousands of days, and the positions you hold. Past five, a filter and a search that knows your own role names.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconPalette size={22} />,
        title: "Themes that stay put",
        text: "A warm peach-white day theme by default, a full night theme, and five accent palettes — remembered on your device and restored next time you sign in.",
      },
    ],
  },
];

/**
 * One feature, as a card that turns over.
 *
 * The front is a real <button>, so it is reachable and operable by keyboard; the back holds
 * the description and the card's own action. Whichever face is turned away is `inert` — out
 * of the tab order and hidden from assistive technology — and focus follows the turn, so a
 * keyboard user is never left focused on a face they can no longer see.
 */
function FlipCard({
  feature: f,
  index,
  flipped,
  onFlip,
  onOpen,
}: {
  feature: Feature;
  /** Position in its area, shown as 01, 02… — the tab above already names the area. */
  index: number;
  flipped: boolean;
  onFlip: (next: boolean) => void;
  onOpen: (f: Feature) => void;
}) {
  const frontRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const turned = useRef(false);

  // Move focus to the face now showing — but only after a turn the reader made, never on
  // first render.
  useEffect(() => {
    if (!turned.current) return;
    if (flipped) backRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    else frontRef.current?.focus({ preventScroll: true });
  }, [flipped]);

  const turn = (next: boolean) => {
    turned.current = true;
    onFlip(next);
  };

  return (
    <article
      className="fc"
      data-flipped={flipped}
      onKeyDown={(e) => {
        if (e.key === "Escape" && flipped) turn(false);
      }}
    >
      <div className="fc-inner">
        <button
          ref={frontRef}
          type="button"
          className="fc-face fc-front"
          aria-label={`${f.title}${f.gated ? " (needs an account)" : ""} — view details`}
          aria-expanded={flipped}
          inert={flipped}
          onClick={() => turn(true)}
        >
          <span className="fc-top">
            <span className="fc-icon" aria-hidden>
              {f.icon}
            </span>
            {f.gated && <span className="fc-gate">Needs an account</span>}
          </span>
          <span className="fc-index" aria-hidden>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="fc-title">{f.title}</span>
          <span className="fc-cue">
            <span>View details</span>
            <IconFlip size={15} />
          </span>
        </button>

        {/* A click on the back's empty space turns it back over, as on a real card; the
            buttons inside do their own thing and stop the click there. */}
        <div
          ref={backRef}
          className="fc-face fc-back"
          inert={!flipped}
          onClick={() => turn(false)}
        >
          <h3 className="fc-back-title">{f.title}</h3>
          <p className="fc-text">{f.text}</p>
          <div className="fc-actions">
            {f.href && (
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(f);
                }}
              >
                {f.gated ? "Open in the app ↗" : "See it ↗"}
              </button>
            )}
            <button
              type="button"
              className="fc-back-btn"
              aria-label={`Turn back to ${f.title}`}
              onClick={(e) => {
                e.stopPropagation();
                turn(false);
              }}
            >
              <IconFlip size={15} />
              <span>Back</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function FeatureCatalogue({ defaultGroup }: { defaultGroup?: string }) {
  const dialogs = useDialogs();
  const [active, setActive] = useState(defaultGroup ?? FEATURE_GROUPS[0].id);
  const group = FEATURE_GROUPS.find((g) => g.id === active) ?? FEATURE_GROUPS[0];
  /** Which cards are turned over. A new area starts with every card face up. */
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  useEffect(() => setFlipped(new Set()), [active]);

  const open = async (f: Feature) => {
    if (!f.href) return;
    if (f.gated && !hasSession()) {
      const go = await dialogs.confirm({
        title: "Sign in to open this",
        message: `${f.title} lives inside your organization, so it needs an account. Sign in — or create a profile, it takes a moment.`,
        confirmLabel: "Sign in",
        cancelLabel: "Create a profile",
      });
      window.location.href = go ? "/login" : "/register";
      return;
    }
    window.location.href = f.href;
  };

  return (
    <div className="feature-catalogue">
      <div className="feature-tabs" role="tablist" aria-label="Feature areas">
        {FEATURE_GROUPS.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={g.id === active}
            className={`btn btn-small ${g.id === active ? "btn-primary" : "btn-quiet"}`}
            onClick={() => setActive(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <p className="feature-blurb">{group.blurb}</p>

      <div className="fc-grid">
        {group.features.map((f, i) => (
          <FlipCard
            key={f.title}
            feature={f}
            index={i}
            flipped={flipped.has(f.title)}
            onFlip={(next) =>
              setFlipped((prev) => {
                const out = new Set(prev);
                if (next) out.add(f.title);
                else out.delete(f.title);
                return out;
              })
            }
            onOpen={open}
          />
        ))}
      </div>

      <div className="feature-foot">
        <Link className="btn btn-primary" href="/register">
          Create your profile
        </Link>
        <Link className="btn btn-quiet" href="/pricing">
          See the plans
        </Link>
        <Link className="btn btn-quiet" href="/help">
          Read the guide book
        </Link>
      </div>
    </div>
  );
}
