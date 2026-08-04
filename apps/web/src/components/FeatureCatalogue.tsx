"use client";

import Link from "next/link";
import { useState } from "react";
import { hasSession } from "@/lib/auth-client";
import { useDialogs } from "./dialogs";

// The feature catalogue, shared by the front page and /features. Grouped so a visitor can
// find the part of the product they came for, rather than reading a wall of bullets.
//
// Some entries are gated: they describe a surface that only exists once you are signed in.
// Rather than dead-ending on a login wall, the card says so and offers the sign-in.

export interface Feature {
  icon: string;
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
        icon: "✦",
        title: "The Constellation",
        text: "Your whole organization as a live star map. Pan, zoom, and click any branch you govern to act on it — no menus to hunt through.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: "🌳",
        title: "Roles & sub-roles, without limit",
        text: "Build CEO → HR → Assistant HR as deep as your organization goes. Every role carries a permanent number that is never reused.",
      },
      {
        icon: "🛡",
        title: "Least-privilege governance",
        text: "Owners hold only the rights granted to them, and can never hand out a capability they don't hold themselves. Creating sub-groups and appointing co-owners are separate, explicit flags.",
      },
      {
        icon: "👥",
        title: "Owners, members and reviewers",
        text: "Place someone as an owner who governs a branch, or a member who learns from it. Members can be allowed to propose content that publishes after review.",
      },
      {
        icon: "🙈",
        title: "Public and hidden branches",
        text: "Branches are public by default and accept join requests. Hide one and its whole subtree disappears from the layer below — while the levels above always keep seeing it.",
      },
      {
        icon: "🔎",
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
        icon: "✍",
        title: "The Document Studio",
        text: "Build documents block by block — headings, tables, images, embeds, page breaks and turn animations — with an authenticated cover page and a consistent house style.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: "🧪",
        title: "Exams that mark themselves",
        text: "Build an MCQ paper in the same Studio: weighted questions, shuffling, time limits, attempt allowances and an invigilator that notices when a candidate leaves the paper. The answer key never leaves the server.",
      },
      {
        icon: "📚",
        title: "The Library",
        text: "Every published course on one shelf, filterable by category, with ratings and reviews from the people who completed it. Request one for your own branch in a click.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: "🏷",
        title: "Classification as standard",
        text: "Public, Confidential, Private or Secret — every document carries one, on its cover and in every list. Downloads are off unless the owner turns them on.",
      },
      {
        icon: "📄",
        title: "Real document viewing",
        text: "PDFs render inside the app rather than depending on the browser's plugin, with Ctrl+scroll and pinch zoom in full screen. Audio, video, images and links all play in place.",
      },
      {
        icon: "🔁",
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
        icon: "🎓",
        title: "My Learning",
        text: "Everything that reaches your position, split into what's pending and what's done, with deadlines, recurrence and prerequisites made plain.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: "📊",
        title: "Compliance, per branch",
        text: "For every course reaching a branch you govern: who is compliant, who isn't, and — in plain words — why. Not started, overdue, expired, or out of exam attempts.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: "♻️",
        title: "Exam resets by a manager",
        text: "A candidate who has spent every attempt can't sit the paper again on their own. Their manager resets the allowance in one click; the sittings stay on record.",
      },
      {
        icon: "⏰",
        title: "Deadlines that escalate",
        text: "An overdue mandatory course notifies the learner and the person who placed them — nothing quietly rots.",
      },
      {
        icon: "🔔",
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
        icon: "📥",
        title: "A real mail client",
        text: "Folders per category, labels per organization, multi-select, search and a reading pane. Everything the platform has to tell you, in one place, on every page.",
        href: "/orgs",
        gated: true,
      },
      {
        icon: "🚩",
        title: "Knowledge Base mail flagged high",
        text: "Access codes, plan decisions and coin adjustments arrive flagged and pinned to the top, so an important message never sits below routine noise.",
      },
      {
        icon: "🏷",
        title: "Every request kind labelled",
        text: "Document publishing, a course for your path, join requests, branch deletion, visibility — each carries its own label, so you can read one kind and ignore the rest.",
      },
      {
        icon: "⏳",
        title: "Messages that expire",
        text: "Every message shows exactly when it deletes itself, and then does. Your mailbox and our database both stay clean without anyone tidying.",
      },
      {
        icon: "🔊",
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
        icon: "🔐",
        title: "The Supreme password",
        text: "Set at founding, unrecoverable by anyone including us. It gates owner management, deletion, and the encryption of your existence backup.",
      },
      {
        icon: "💾",
        title: ".main and .bkp files",
        text: "Export an encrypted backup of the whole organization, or of a single branch, and keep it yourself. It is the one way back after a purge — and it works.",
      },
      {
        icon: "🗑",
        title: "A recycle bin, not a cliff",
        text: "A deleted organization waits 30 days in the bin, restorable in one click, before anything is actually purged.",
      },
      {
        icon: "🪙",
        title: "Knowledge Coins & plans",
        text: "Plans are paid in coins. Only the free plan is metered — every paid plan carries unlimited documents and uploads.",
        href: "/pricing",
      },
      {
        icon: "🎨",
        title: "Themes that stay put",
        text: "A warm peach-white day theme by default, a full night theme, and five accent palettes — remembered on your device and restored next time you sign in.",
      },
    ],
  },
];

export function FeatureCatalogue({ defaultGroup }: { defaultGroup?: string }) {
  const dialogs = useDialogs();
  const [active, setActive] = useState(defaultGroup ?? FEATURE_GROUPS[0].id);
  const group = FEATURE_GROUPS.find((g) => g.id === active) ?? FEATURE_GROUPS[0];

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

      <div className="feature-grid">
        {group.features.map((f) => (
          <article key={f.title} className="feature-card glass">
            <span className="feature-icon" aria-hidden>
              {f.icon}
            </span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            {f.href && (
              <button className="btn btn-quiet btn-small" onClick={() => open(f)}>
                {f.gated ? "Open in the app ↗" : "See it ↗"}
              </button>
            )}
            {f.gated && <span className="feature-gate">Needs an account</span>}
          </article>
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
