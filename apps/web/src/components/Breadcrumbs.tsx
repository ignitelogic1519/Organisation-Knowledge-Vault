"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrgOptional } from "./org-context";

// The trail under the navigation bar: where you are, and one click back to every level
// above it.
//
// It is derived from the URL rather than passed in by each page, so a new page gets a
// correct trail without remembering to add one — and the trail can never disagree with
// the address bar.

/** Segments that are structural rather than places — never shown as a step. */
const HIDDEN = new Set(["orgs"]);

/** Fixed labels for the segments whose names are not derivable. */
const LABELS: Record<string, string> = {
  account: "Account",
  pricing: "Pricing",
  payment: "Buy coins",
  features: "Features",
  help: "Help & guide",
  register: "Register",
  login: "Sign in",
  new: "New organization",
  library: "Library",
  learning: "My Learning",
  studio: "Studio",
  compliance: "Compliance",
  requests: "Requests",
  graph: "Structure",
  kbase: "Knowledge Base Portal",
};

function looksLikeId(segment: string): boolean {
  // UUIDs and course codes ("100-101-0003") are identifiers, not readable steps.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment) || /^\d+(-\d+)+$/.test(segment);
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? "/";
  // The organization, when we are inside one — so its id becomes its name.
  const org = useOrgOptional();

  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [{ href: "/", label: "Home" }];

  let href = "";
  for (const segment of segments) {
    href += `/${segment}`;

    if (looksLikeId(segment)) {
      // An organization id resolves to its name; anything else identifying is skipped
      // rather than shown as a meaningless hex string.
      if (org && href === `/orgs/${org.org.id}`) {
        crumbs.push({ href, label: org.org.name });
      }
      continue;
    }
    if (HIDDEN.has(segment) && segments.length > 1) {
      // "/orgs" on its own is a real page; as a prefix of "/orgs/<id>" it is not a step.
      if (segments[0] === segment && segments.length > 1) continue;
    }
    crumbs.push({ href, label: LABELS[segment] ?? segment.replace(/-/g, " ") });
  }

  // A single step is just the page you are on — a trail of one helps nobody.
  if (crumbs.length < 2) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href}>
              {last ? (
                <span aria-current="page">{c.label}</span>
              ) : (
                <Link href={c.href}>{c.label}</Link>
              )}
              {!last && (
                <span className="breadcrumb-sep" aria-hidden>
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
