"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { OrgSummary } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import {
  HELP_ENTRIES,
  PAGE_ENTRIES,
  normalize,
  score,
  type SearchEntry,
  type SearchGroup,
} from "@/lib/site-search";
import { IconSearch } from "./icons";

/**
 * The search box in the top bar — on the public pages and inside the app alike.
 *
 * It finds pages, Help topics and your organizations as you type, and, inside an
 * organization, offers to carry the words straight into that organization's Library or
 * My Learning, where the real course search lives. Nothing here invents a second search
 * engine: it is a fast way to reach the ones that already exist.
 *
 * Keyboard first: `/` or Ctrl/⌘ K jumps to it from anywhere, ↑ ↓ move, Enter opens,
 * Esc closes. It is a proper ARIA combobox, so a screen reader announces each result.
 *
 * Below 992px the bar has no room for a field, so it shrinks to a magnifier that opens
 * the same field as a full-width row under the bar.
 */

/** Results per group — enough to choose from, few enough to read at a glance. */
const PER_GROUP = 6;
const GROUP_ORDER: SearchGroup[] = ["This organization", "Your organizations", "Pages", "Help"];

/** Shown the moment the field is focused, before anything is typed. */
const SUGGESTED_IN = ["p-orgs", "p-new-org", "p-account", "p-pricing", "p-help"];
const SUGGESTED_OUT = ["p-features", "p-pricing", "p-help", "p-login", "p-register"];

/** The organizations list is fetched once per page load, on first use — not on every keystroke. */
let orgCache: Promise<OrgSummary[]> | null = null;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

export function NavSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  /** The small-screen row is open (on a wide screen the field is always there). */
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [myOrgs, setMyOrgs] = useState<OrgSummary[]>([]);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setSignedIn(hasSession());
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Close and clear on navigation — the search did its job.
  useEffect(() => {
    setQuery("");
    setFocused(false);
    setRevealed(false);
  }, [pathname]);

  const loadOrgs = useCallback(() => {
    if (!hasSession()) return;
    orgCache ??= orgs.list().catch(() => {
      orgCache = null; // a failed fetch is retried next time, not remembered as "no orgs"
      return [];
    });
    orgCache.then(setMyOrgs);
  }, []);

  /** The organization you are standing in, if any: /orgs/<id>/… */
  const here = useMemo(() => {
    const m = /^\/orgs\/([^/]+)/.exec(pathname);
    if (!m || m[1] === "new") return null;
    return myOrgs.find((o) => o.id === m[1]) ?? { id: m[1], name: "this organization" };
  }, [pathname, myOrgs]);

  const results = useMemo(() => {
    const q = query.trim();
    const visible = (e: SearchEntry) => e.signedIn === undefined || e.signedIn === signedIn;

    if (!q) {
      const ids = signedIn ? SUGGESTED_IN : SUGGESTED_OUT;
      return ids
        .map((id) => PAGE_ENTRIES.find((e) => e.id === id))
        .filter((e): e is SearchEntry => !!e && visible(e));
    }

    const scored: { e: SearchEntry; s: number }[] = [];
    for (const e of [...PAGE_ENTRIES, ...HELP_ENTRIES]) {
      if (!visible(e)) continue;
      const s = score(e, q);
      if (s) scored.push({ e, s });
    }

    const nq = normalize(q);
    for (const o of myOrgs) {
      const e: SearchEntry = {
        id: `o-${o.id}`,
        group: "Your organizations",
        title: o.name,
        hint: `Organization #${o.orgNumber}`,
        href: `/orgs/${o.id}`,
        icon: "🏛",
        keywords: `#${o.orgNumber} ${o.orgNumber}`,
      };
      const s = score(e, q) || (String(o.orgNumber).startsWith(nq.replace(/^#/, "")) ? 50 : 0);
      if (s) scored.push({ e, s });
    }

    // Inside an organization the most useful thing is usually its courses, and those are
    // searched by the server — so offer to take the words there.
    if (here) {
      const words = encodeURIComponent(q);
      scored.push(
        {
          e: {
            id: "x-library",
            group: "This organization",
            title: `Search the Library for “${q}”`,
            hint: `Courses and documents in ${here.name}`,
            href: `/orgs/${here.id}/library?q=${words}`,
            icon: "📚",
          },
          s: 1000,
        },
        {
          e: {
            id: "x-learning",
            group: "This organization",
            title: `Search My Learning for “${q}”`,
            hint: "What has been assigned to you",
            href: `/orgs/${here.id}/learning?q=${words}`,
            icon: "🎓",
          },
          s: 999,
        },
      );
    }

    const out: SearchEntry[] = [];
    for (const g of GROUP_ORDER) {
      out.push(
        ...scored
          .filter((r) => r.e.group === g)
          .sort((a, b) => b.s - a.s)
          .slice(0, PER_GROUP)
          .map((r) => r.e),
      );
    }
    return out;
  }, [query, signedIn, myOrgs, here]);

  // A new query starts at the top result — and so does a list that shrank under the
  // highlight (the organizations arriving can reorder it).
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [active, results.length]);

  const open = focused && (results.length > 0 || query.trim().length > 0);

  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    setFocused(false);
    inputRef.current?.blur();
    if (entry.href.startsWith("/guide/")) {
      window.open(entry.href, "_blank", "noopener");
      return;
    }
    router.push(entry.href);
  };

  // `/` and Ctrl/⌘ K reach the field from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Not inside a rich-text editor, where Ctrl/⌘ K conventionally means "insert link".
      const combo =
        (e.key === "k" || e.key === "K") &&
        (e.metaKey || e.ctrlKey) &&
        !(e.target instanceof HTMLElement && e.target.isContentEditable);
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target);
      if (!combo && !slash) return;
      e.preventDefault();
      setRevealed(true);
      // The small-screen row has to render before it can take focus.
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A click anywhere else closes the results (and the small-screen row).
  useEffect(() => {
    if (!focused && !revealed) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setFocused(false);
        setRevealed(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [focused, revealed]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else {
        setFocused(false);
        setRevealed(false);
        inputRef.current?.blur();
      }
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let lastGroup: SearchGroup | null = null;

  return (
    <div className="kv-search" ref={wrapRef} data-revealed={revealed} data-open={open}>
      {/* Small screens: the magnifier that opens the row. */}
      <button
        type="button"
        className="icon-btn kv-search-toggle"
        aria-label="Search"
        aria-expanded={revealed}
        onClick={() => {
          setRevealed((v) => !v);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <IconSearch />
      </button>

      <div className="kv-search-field">
        <span className="kv-search-icon" aria-hidden>
          <IconSearch />
        </span>
        <input
          ref={inputRef}
          type="search"
          className="kv-search-input"
          placeholder="Search pages, help, organizations…"
          aria-label="Search Knowledge Vault"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && results[active] ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true);
            loadOrgs();
          }}
          onKeyDown={onKeyDown}
        />
        {!query && (
          <kbd className="kv-search-kbd" aria-hidden>
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        )}
      </div>

      {open && (
        <div className="kv-search-panel" role="presentation">
          {results.length === 0 ? (
            <p className="kv-search-empty">
              Nothing matches “{query.trim()}”. Try a page name, a topic such as{" "}
              <em>password</em> or <em>exams</em>, or an organization’s name.
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search results" className="kv-search-list">
              {results.map((r, i) => {
                const heading =
                  r.group !== lastGroup ? (query.trim() ? r.group : "Suggested") : null;
                lastGroup = r.group;
                return (
                  <li key={r.id} role="presentation">
                    {heading && (
                      <div className="kv-search-group" aria-hidden>
                        {heading}
                      </div>
                    )}
                    <div
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      className="kv-search-option"
                      // Keep focus in the field, so the click does not blur it first.
                      onPointerDown={(e) => e.preventDefault()}
                      onPointerMove={() => setActive(i)}
                      onClick={() => go(r)}
                    >
                      <span className="kv-search-option-icon" aria-hidden>
                        {r.icon}
                      </span>
                      <span className="kv-search-option-text">
                        <span className="kv-search-option-title">{r.title}</span>
                        <span className="kv-search-option-hint">{r.hint}</span>
                      </span>
                      <span className="kv-search-option-go" aria-hidden>
                        ↵
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
