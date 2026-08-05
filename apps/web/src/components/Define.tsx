"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A term that explains itself.
 *
 * Every number and switch in an administration console means something precise, and the
 * meaning is usually in someone's head rather than on the screen. `Define` puts it on the
 * screen: the term keeps a dotted underline, and pointing at it (or focusing it with the
 * keyboard, or tapping it on a touch screen) opens a small card with the definition and,
 * where it matters, what changing it actually does.
 *
 * The card is rendered into a portal at the end of `<body>` and positioned in viewport
 * coordinates. That matters: the console is full of scrolling panels and drawers, and a
 * popover living inside one of them would be clipped by its `overflow`.
 */

export interface Definition {
  /** The heading of the card — usually the human name of the property. */
  term: string;
  /** One sentence: what this is. Always shown. */
  short: string;
  /** Optional second paragraph: what it does, or what changing it costs. */
  detail?: string;
  /** Optional worked example — "150 / ∞ means 150 people and no ceiling". */
  example?: string;
}

const MARGIN = 12;
const CARD_WIDTH = 320;

export function Define({
  def,
  children,
  className,
  as: Tag = "span",
}: {
  def: Definition;
  children: React.ReactNode;
  className?: string;
  /** The element the term renders as — `span` by default, `dt`/`th` where the table needs it. */
  as?: "span" | "dt" | "th" | "div" | "strong";
}) {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);

  const place = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(CARD_WIDTH, window.innerWidth - MARGIN * 2);
    // Above by default; below when the term sits too near the top of the window.
    const below = r.top < 180;
    const left = Math.min(
      Math.max(MARGIN, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - MARGIN,
    );
    setPos({ top: below ? r.bottom + 8 : r.top - 8, left, below });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    // `capture` so a scroll inside the drawer — not just the window — keeps the card glued.
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  return (
    <>
      <Tag
        ref={anchor as never}
        className={`kv-def${className ? ` ${className}` : ""}`}
        tabIndex={0}
        role="button"
        aria-describedby={open ? id : undefined}
        aria-label={`${def.term} — what this means`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Touch has no hover: a tap opens the card, a second tap closes it.
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {children}
        <span className="kv-def-mark" aria-hidden>
          ?
        </span>
      </Tag>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              className="kv-def-card"
              data-below={pos.below}
              style={{
                top: pos.top,
                left: pos.left,
                width: Math.min(CARD_WIDTH, window.innerWidth - MARGIN * 2),
              }}
            >
              <strong>{def.term}</strong>
              <span>{def.short}</span>
              {def.detail && <span className="kv-def-detail">{def.detail}</span>}
              {def.example && <code className="kv-def-example">{def.example}</code>}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
