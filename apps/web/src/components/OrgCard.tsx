"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { OrgSummary } from "@vault/shared";
import { OrgBadge } from "./OrgLogoField";
import { RoleChips } from "./RoleChips";

// The organization card on the dashboard.
//
// It used to be a name, a number and a line of comma-joined role names, with the plan
// timer as a lilac pill reading "⏳ organisation · 3643d 14h left" — a raw day count, the
// plan key in place of a plan name, and no sign of the logo the owner had uploaded.
//
// This is the same information as a place you are about to enter: the organization's own
// star field behind its badge, its name, how long it has, and where YOU stand in it. The
// star field is decoration — an echo of the constellation the card opens into — but it is
// seeded from the organization number, so a given organization always wears the same sky
// and becomes recognisable at a glance in a list of twenty.

/**
 * A tiny deterministic PRNG. Two organizations must never share a sky by accident, and
 * one organization must never change its own between two page loads — both of which
 * `Math.random()` would do.
 */
function seeded(seed: number) {
  let state = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

interface Star {
  x: number;
  y: number;
  r: number;
  dim: number;
  delay: number;
}

/**
 * The card's backdrop: the logo's own constellation.
 *
 * The badge sits at a known point of the card, so it is treated as the anchor star and
 * the nearest few stars are joined to it — the sky visibly hangs off the organization's
 * own mark rather than being wallpaper behind it. Stars are biased to the right, where
 * the card has no text, and the whole layer is masked away from the lower-left where the
 * name and the chips live; a star behind a word reads as a smudge, not as a sky.
 */
const ANCHOR = { x: 13, y: 19 };

function StarField({ seed }: { seed: number }) {
  const { stars, links } = useMemo(() => {
    const rand = seeded(seed + 7);
    const count = 8 + Math.floor(rand() * 4);
    const list: Star[] = Array.from({ length: count }, () => ({
      // Biased right and up: `rand() ** 0.7` leans the distribution towards the far edge.
      x: 26 + Math.pow(rand(), 0.7) * 70,
      y: 6 + rand() * 80,
      r: 0.55 + rand() * 1.15,
      dim: 0.2 + rand() * 0.4,
      delay: rand() * 4,
    }));

    const pairs: [{ x: number; y: number }, { x: number; y: number }][] = [];
    // Each star reaches for its nearest neighbour. Joining everything to everything makes
    // a cobweb; one line each makes a constellation.
    list.forEach((a, i) => {
      let best: Star | null = null;
      let bestDistance = Infinity;
      list.forEach((b, j) => {
        if (i === j) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = b;
        }
      });
      if (best && bestDistance < 40) pairs.push([a, best]);
    });

    // …and the two closest to the badge reach back to it.
    [...list]
      .sort(
        (a, b) =>
          Math.hypot(a.x - ANCHOR.x, a.y - ANCHOR.y) - Math.hypot(b.x - ANCHOR.x, b.y - ANCHOR.y),
      )
      .slice(0, 2)
      .forEach((star) => pairs.push([ANCHOR, star]));

    return { stars: list, links: pairs };
  }, [seed]);

  return (
    <svg className="orgcard-sky" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {links.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="orgcard-sky-link" />
      ))}
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          className="orgcard-sky-star"
          style={{ opacity: s.dim, animationDelay: `${s.delay}s` }}
        />
      ))}
    </svg>
  );
}

/** Remaining time, in the largest unit that still says something useful. */
function humanRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const hours = ms / 3600_000;
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h left`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} day${days === 1 ? "" : "s"} left`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} left`;
  const years = days / 365.25;
  // One decimal only while it still moves the number — "9.9 years" beats "3643d 14h".
  return `${years < 10 ? years.toFixed(1) : Math.round(years)} years left`;
}

type Tone = "none" | "calm" | "soon" | "urgent" | "dead";

/**
 * The plan chip. Three things the old one got wrong: it printed the plan KEY rather than
 * a name, it counted in raw days however many there were, and its colour said nothing.
 * This says how long in words a person would use, colours itself by how close the end is,
 * and carries the exact date for anyone who needs it.
 */
function PlanChip({
  status,
  planKey,
  expiresAt,
}: {
  status: OrgSummary["planStatus"];
  planKey: string | null;
  expiresAt: string | null;
}) {
  if (status === "NONE") return null;

  const name = status === "DEMO" ? "Demo" : planKey ? planKey[0].toUpperCase() + planKey.slice(1) : "Plan";

  if (status === "EXPIRED") {
    return (
      <span
        className="orgcard-plan"
        data-tone="dead"
        data-hint="This organization's plan has run out. Its content is safe, but it needs an upgrade before it can be used again."
        data-hint-title={`${name} expired`}
      >
        <span className="orgcard-plan-dot" aria-hidden />
        {name} expired
      </span>
    );
  }

  if (!expiresAt) {
    return (
      <span className="orgcard-plan" data-tone="none" data-hint="No expiry date — this plan runs until it is changed." data-hint-title={name}>
        <span className="orgcard-plan-dot" aria-hidden />
        {name} · no expiry
      </span>
    );
  }

  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = ms / 86400_000;
  const tone: Tone = ms <= 0 ? "dead" : days < 3 ? "urgent" : days < 30 ? "soon" : "calm";
  const exact = new Date(expiresAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <span
      className="orgcard-plan"
      data-tone={tone}
      data-hint={`The ${name} plan runs until ${exact}.`}
      data-hint-title={tone === "urgent" ? "Ending very soon" : `${name} plan`}
      data-hint-tone={tone === "urgent" ? "required" : "info"}
    >
      <span className="orgcard-plan-dot" aria-hidden />
      {name} · {humanRemaining(ms)}
    </span>
  );
}

export function OrgCard({ org }: { org: OrgSummary }) {
  const owner = org.myPlacements.some((p) => p.kind === "OWNER");

  return (
    <Link href={`/orgs/${org.id}`} className="orgcard glass" data-owner={owner}>
      <StarField seed={org.orgNumber} />

      <div className="orgcard-top">
        <span className="orgcard-badge-halo">
          <OrgBadge name={org.name} logo={org.logo} orgNumber={org.orgNumber} size={52} />
        </span>
        {/* Identifiers together, up here. Left in the tag row below, the KVEP marker kept
            wrapping onto a line of its own and stretching every card that carried one. */}
        <span className="orgcard-ids">
          {org.isKvep && (
            <span
              className="orgcard-kvep"
              data-hint="An employee-perk organization: its documents live on Knowledge Vault's own storage."
              data-hint-title="KVEP"
            >
              KVEP
            </span>
          )}
          <span className="orgcard-num">#{org.orgNumber}</span>
        </span>
      </div>

      <div className="orgcard-body">
        <h2 className="orgcard-name" title={org.name}>
          {org.name}
        </h2>
        <div className="orgcard-tags">
          <PlanChip status={org.planStatus} planKey={org.planKey} expiresAt={org.planExpiresAt} />
        </div>
      </div>

      <div className="orgcard-roles">
        <RoleChips placements={org.myPlacements} />
      </div>

      <span className="orgcard-enter" aria-hidden>
        Enter →
      </span>
    </Link>
  );
}
