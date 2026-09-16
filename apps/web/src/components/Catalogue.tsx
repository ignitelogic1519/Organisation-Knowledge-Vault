"use client";

import { useId, useState } from "react";
import {
  IconAudio,
  IconBook,
  IconDoc,
  IconExam,
  IconLink,
  IconSearch,
  IconVideo,
} from "./icons";

/**
 * The catalogue — how every long list on the platform is read.
 *
 * A branch with a hundred documents on it is not a list, it is a filing cabinet, and the
 * flat `<ul>` it used to be had no way in: no search, no sections, and every row as tall
 * as its longest button row. The pieces here are the way in, and they are deliberately
 * dumb — each screen keeps its own data, filtering and grouping, and borrows the shell:
 *
 *   `CatalogueBar`      search + live count, with room for the screen's own selects
 *   `CatalogueSection`  one collapsible section per shelf / type / status
 *   `CatalogueRow`      a compact row whose TITLE is the control (see ActionMenu)
 *
 * The register matches the org library's shelves, so the same material reads the same
 * way whether it is met in the library or in a branch's drawer.
 */

export function CatalogueBar({
  value,
  onChange,
  placeholder,
  label,
  shown,
  total,
  noun,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Accessible name for the field — it carries no visible label. */
  label: string;
  shown: number;
  total: number;
  /** What is being counted: "document", "person"… pluralised with a plain -s. */
  noun: string;
  /** The screen's own controls (group-by, type filter…), laid out beside the field. */
  children?: React.ReactNode;
}) {
  const id = useId();
  const filtered = shown !== total;
  return (
    <div className="cat-bar">
      <div className="cat-search">
        <span className="cat-search-icon" aria-hidden>
          <IconSearch size={16} />
        </span>
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          type="search"
          className="cat-search-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            className="cat-search-clear"
            aria-label="Clear the search"
            onClick={() => onChange("")}
          >
            ✕
          </button>
        )}
      </div>
      {children && <div className="cat-filters">{children}</div>}
      {total > 0 && (
        <p className="cat-count">
          {filtered ? (
            <>
              <strong>{shown}</strong> of {total} {noun}
              {total === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <strong>{total}</strong> {noun}
              {total === 1 ? "" : "s"}
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function CatalogueSection({
  title,
  count,
  subtitle,
  tone,
  /** A search in progress opens every section — a hit must never hide behind a header. */
  forceOpen = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  subtitle?: React.ReactNode;
  tone?: "default" | "warn" | "muted";
  forceOpen?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  // Collapsing is a choice about a shelf, and it is remembered — but a search overrides
  // it while it runs, and the shelf goes back to the reader's choice when it clears.
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const open = forceOpen || !collapsed;

  return (
    <section className="cat-section" data-tone={tone ?? "default"}>
      <button
        type="button"
        className="cat-section-head"
        aria-expanded={open}
        data-hint={forceOpen ? "Every section stays open while a search is running" : undefined}
        onClick={() => {
          if (forceOpen) return;
          setCollapsed((v) => !v);
        }}
      >
        <span className="cat-section-caret" aria-hidden data-open={open}>
          ›
        </span>
        <span className="cat-section-title">{title}</span>
        <span className="cat-section-count">{count}</span>
        {subtitle && <span className="cat-section-sub">{subtitle}</span>}
      </button>
      {open && <ul className="cat-list">{children}</ul>}
    </section>
  );
}

/**
 * One row. Two shapes, and which one a screen wants says what kind of screen it is:
 *
 *  · `onOpen` alone — the row IS the menu (a management panel, where no single action is
 *    the obvious one). The ⋯ sits inside the row to say so.
 *  · `onOpen` + `onMore` — the row does the obvious thing (open the document) and the ⋯
 *    beside it holds the rest. A reader should never need two clicks to start reading.
 */
export function CatalogueRow({
  leading,
  title,
  meta,
  chips,
  onOpen,
  onMore,
  moreLabel,
  dim = false,
  hint,
  hintTitle,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  chips?: React.ReactNode;
  onOpen: () => void;
  onMore?: () => void;
  /** Accessible name for the ⋯ button — it is the only thing in it. */
  moreLabel?: string;
  /** Archived, out of deployment — present, but no longer in play. */
  dim?: boolean;
  hint?: string;
  hintTitle?: string;
}) {
  return (
    <li className="cat-item" data-dim={dim || undefined}>
      <button
        type="button"
        className="cat-row"
        onClick={onOpen}
        data-hint={hint}
        data-hint-title={hintTitle}
      >
        {leading && (
          <span className="cat-row-lead" aria-hidden>
            {leading}
          </span>
        )}
        <span className="cat-row-main">
          <span className="cat-row-title">{title}</span>
          {meta && <span className="cat-row-meta">{meta}</span>}
          {chips && <span className="cat-row-chips">{chips}</span>}
        </span>
        {!onMore && (
          <span className="cat-row-go" aria-hidden>
            ⋯
          </span>
        )}
      </button>
      {onMore && (
        <button
          type="button"
          className="cat-row-more"
          aria-label={moreLabel ?? "More actions"}
          data-hint={moreLabel}
          onClick={onMore}
        >
          ⋯
        </button>
      )}
    </li>
  );
}

/** Nothing matched the search — said in the screen's own words. */
export function CatalogueEmpty({ children }: { children: React.ReactNode }) {
  return <p className="cat-empty auth-sub">{children}</p>;
}

/**
 * Group rows into sections, alphabetically, with one label always pinned to the end
 * ("Uncategorised" belongs after the shelves that were actually named).
 */
export function groupItems<T>(
  items: T[],
  keyOf: (item: T) => string,
  opts: { last?: string; order?: string[] } = {},
): [string, T[]][] {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  const { last, order } = opts;
  return [...grouped.entries()].sort(([a], [b]) => {
    if (order) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== ib) return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    }
    if (last) {
      if (a === last) return 1;
      if (b === last) return -1;
    }
    return a.localeCompare(b);
  });
}

/** The glyph a document wears in a list — one per kind, so a shelf is scannable. */
export function kindGlyph(kind: string, size = 16): React.ReactNode {
  switch (kind) {
    case "EXAM":
      return <IconExam size={size} />;
    case "BOOK":
      return <IconBook size={size} />;
    case "LINK":
      return <IconLink size={size} />;
    case "AUDIO":
      return <IconAudio size={size} />;
    case "VIDEO":
      return <IconVideo size={size} />;
    default:
      return <IconDoc size={size} />;
  }
}
