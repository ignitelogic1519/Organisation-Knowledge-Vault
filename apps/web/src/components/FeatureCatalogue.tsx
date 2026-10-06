"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
        text: "See your whole organization at a glance. A live star map you can pan and zoom — click any branch you govern to act on it.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconHierarchy size={22} />,
        title: "Roles & sub-roles, without limit",
        text: "Build a role hierarchy as deep as your organization needs. Each role gets a permanent, unique number.",
      },
      {
        icon: <IconShield size={22} />,
        title: "Least-privilege governance",
        text: "Nobody can grant more power than they hold. Owners get only the rights given to them; creating sub-groups and appointing co-owners are separate rights.",
      },
      {
        icon: <IconUsers size={22} />,
        title: "Owners, members and reviewers",
        text: "Put each person exactly where they belong. Owners govern a branch, members learn from it — and members can propose content that publishes after review.",
      },
      {
        icon: <IconEyeOff size={22} />,
        title: "Public and hidden branches",
        text: "Choose who sees each branch. Branches are public and open to join requests by default; hide one and its subtree disappears from the levels below, never from those above.",
      },
      {
        icon: <IconSearch size={22} />,
        title: "Live username suggestions",
        text: "Add the right person the first time. Type two letters to see who actually exists; an unknown username is held and attaches the moment they register.",
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
        text: "Create polished, consistent documents. Build them block by block — headings, tables, images, embeds — with an authenticated cover page in your house style.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconExam size={22} />,
        title: "Exams that mark themselves",
        text: "Test understanding without marking a single paper. Build weighted, timed multiple-choice exams in the Studio; the answer key never leaves the server.",
      },
      {
        icon: <IconLibrary size={22} />,
        title: "The Library",
        text: "Find the right course in one place. Every published course on one shelf, filterable by category, with reviews — request one for your branch in a click.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconTag size={22} />,
        title: "Classification as standard",
        text: "Everyone can see how sensitive a document is. Each is marked Public, Confidential, Private or Secret on its cover and in every list; downloads are off by default.",
      },
      {
        icon: <IconDoc size={22} />,
        title: "Real document viewing",
        text: "Open any file without leaving the app. PDFs render in place with zoom, and audio, video, images and links play right where they are.",
      },
      {
        icon: <IconLayers size={22} />,
        title: "Editions, not overwrites",
        text: "Update a document without losing its history. Revise it and publish v2.0 — placements are kept, and you decide whether completions reset.",
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
        text: "Know exactly what you need to complete. Everything that reaches your position, split into pending and done, with deadlines and prerequisites made plain.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconChart size={22} />,
        title: "Compliance, per branch and per person",
        text: "See who is compliant — and, in plain words, why not. Not started, overdue, expired or out of attempts, for a whole branch or one person.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconRefresh size={22} />,
        title: "Exam resets by a manager",
        text: "Give a second chance without losing the record. When a candidate runs out of attempts, their manager resets the allowance in one click.",
      },
      {
        icon: <IconClock size={22} />,
        title: "Deadlines that escalate — and are fair",
        text: "Overdue training gets noticed, fairly. The learner and whoever placed them are notified, and deadlines run from the day the course reached each person.",
      },
      {
        icon: <IconBell size={22} />,
        title: "Reminders with a human voice",
        text: "Nudge the people who are behind. Pick them and send a default or custom reminder straight to their mailbox.",
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
        text: "Everything the platform tells you, in one place. Folders per category, labels per organization, multi-select, search and a reading pane — on every page.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconFlag size={22} />,
        title: "Knowledge Base mail flagged high",
        text: "Important messages never get buried. Access codes, plan decisions and coin adjustments arrive flagged and pinned to the top.",
      },
      {
        icon: <IconTag size={22} />,
        title: "Every request kind labelled",
        text: "Read only the requests you care about. Publishing, join requests, branch deletion and the rest each carry their own label.",
      },
      {
        icon: <IconHourglass size={22} />,
        title: "Messages that expire",
        text: "A mailbox that tidies itself. Every message shows when it will delete itself — and then it does.",
      },
      {
        icon: <IconVolume size={22} />,
        title: "Live, with a chime",
        text: "Know the moment something arrives. Messages appear instantly over a live connection, with a soft chime you can switch off.",
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
        text: "Only you hold the master key. Set at founding and unrecoverable by anyone, including us, it guards owner management, deletion and your backup.",
      },
      {
        icon: <IconArchive size={22} />,
        title: ".main and .bkp files",
        text: "Keep your own way back. Export an encrypted backup of the whole organization or a single branch — it restores even after a purge.",
      },
      {
        icon: <IconRecovery size={22} />,
        title: "Recovery, not a cliff",
        text: "Undo a deletion. A deleted organization waits 30 days, restorable in one click with the Supreme password; after that, your .main file still brings it back.",
      },
      {
        icon: <IconClock size={22} />,
        title: "Sessions that actually end",
        text: "An unattended screen doesn't stay signed in. An hour without a click, key or scroll ends the session, and the last minute is announced.",
      },
      {
        icon: <IconCoin size={22} />,
        title: "Knowledge Coins & plans",
        text: "Pay only for what you need. Plans are paid in coins, and only the free plan is metered — paid plans have unlimited documents and uploads.",
        href: "/pricing",
      },
      {
        icon: <IconGrid size={22} />,
        title: "A dashboard that scales",
        text: "Find any organization quickly. Each is a card with its logo, number, plan and your positions; past five, filter and search by your own role names.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: <IconPalette size={22} />,
        title: "Themes that stay put",
        text: "Read comfortably, day or night. A white-and-blue day theme, a full night theme and six accents — remembered on your device.",
      },
    ],
  },
];

/**
 * One feature, as a card that turns over.
 *
 * The front is a real <button>, so a click, a tap, Enter or Space turns it — nothing
 * depends on hover. The back holds the description and the card's own action. Whichever
 * face is turned away is `inert` — out of the tab order and hidden from assistive
 * technology — and focus follows the turn, so a keyboard user is never left focused on a
 * face they can no longer see. Esc turns it back.
 *
 * The flip control sits in the same bottom-right corner on both faces ("Flip for details" /
 * "Back to overview"), so it is always where the hand expects it; "Open in the app" stays
 * apart from it, on the left, as the card's one primary action.
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
  const id = useId();
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
          aria-label={`${f.title}${f.gated ? " (needs an account)" : ""} — flip for details`}
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
            <span className="fc-flip">
              <span>Flip for details</span>
              <IconFlip size={15} />
            </span>
          </span>
        </button>

        {/* A click on the back's empty space turns it back over, as on a real card; the
            buttons inside do their own thing and stop the click there. */}
        <div
          ref={backRef}
          className="fc-face fc-back"
          role="group"
          aria-labelledby={`${id}-title`}
          inert={!flipped}
          onClick={() => turn(false)}
        >
          <h3 className="fc-back-title" id={`${id}-title`}>
            {f.title}
          </h3>
          <p className="fc-text" id={`${id}-text`}>
            {f.text}
          </p>
          <div className="fc-actions">
            {f.href && (
              <button
                type="button"
                className="btn btn-primary btn-small"
                aria-describedby={`${id}-text`}
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
              className="fc-flip fc-back-btn"
              aria-describedby={f.href ? undefined : `${id}-text`}
              onClick={(e) => {
                e.stopPropagation();
                turn(false);
              }}
            >
              <span>Back to overview</span>
              <IconFlip size={15} />
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
        cancelLabel: "Create your profile",
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
