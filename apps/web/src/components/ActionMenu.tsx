"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The action menu — what a row does, asked for by name.
 *
 * A row of eight small buttons is how a list stops being readable: the buttons outweigh
 * the thing they belong to, every card is a different width, and the one destructive
 * button sits a thumb's width from the harmless one. So a row carries no buttons at all.
 * Its title is the control; choosing it opens this menu, and the menu lists what can be
 * done in full words, grouped by what the choice actually touches.
 *
 * It behaves like a menu, not like a form:
 *  · it opens focused on the first option, and ↑/↓/Home/End walk the list;
 *  · Escape, the scrim and Close all dismiss it, and focus returns to the row;
 *  · an option that runs asynchronously holds the menu open, spinner on that row, and
 *    only closes once the work is done — a failure leaves the menu standing so the
 *    reason (toast or inline error) is read next to what caused it;
 *  · a destructive option is separated, tinted and never first.
 *
 * It is portalled to <body> because every panel on this platform is glass, and a
 * `position: fixed` overlay inside a `backdrop-filter` ancestor anchors to that panel
 * instead of the window (design.md §3.3).
 */

export type ActionTone = "default" | "primary" | "danger";

export interface ActionOption {
  key: string;
  label: string;
  /** What choosing it does, in a sentence — the hover hints became these. */
  desc?: React.ReactNode;
  glyph?: React.ReactNode;
  tone?: ActionTone;
  /** A setting that is currently on: the row is ticked and keeps an accent edge. */
  on?: boolean;
  disabled?: boolean;
  /** Shown instead of `desc` when disabled — a dead row must say why. */
  disabledReason?: string;
  run: () => void | Promise<void>;
  /** Leave the menu open afterwards (a toggle the user may want to flip twice). */
  keepOpen?: boolean;
}

export interface ActionGroup {
  title?: string;
  note?: React.ReactNode;
  options: ActionOption[];
}

export function ActionMenu({
  title,
  subtitle,
  chips,
  groups,
  onClose,
}: {
  title: string;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  groups: ActionGroup[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // The row that opened the menu gets the focus back when it closes — otherwise the
  // keyboard lands at the top of the document and the reader loses their place in a
  // list that may be a hundred rows long.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setMounted(true);
    return () => openerRef.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>(".action-option:not([disabled])")
      ?.focus();
  }, [mounted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = [
      ...(panelRef.current?.querySelectorAll<HTMLButtonElement>(
        ".action-option:not([disabled])",
      ) ?? []),
    ];
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const last = items.length - 1;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? last
          : i === -1
            ? e.key === "ArrowDown"
              ? 0
              : last
            : e.key === "ArrowDown"
              ? (i + 1) % items.length
              : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const select = useCallback(
    async (opt: ActionOption) => {
      if (opt.disabled || busy) return;
      setBusy(opt.key);
      try {
        await opt.run();
        if (!opt.keepOpen) onClose();
      } catch {
        // The caller reports its own failure (inline error + toast). The menu stays.
      } finally {
        setBusy(null);
      }
    },
    [busy, onClose],
  );

  if (!mounted) return null;

  return createPortal(
    <div
      // Its own layer, just under the dialog layer: an option that asks for a
      // confirmation must see that confirmation land ON TOP of the menu, not behind it.
      className="sheet-layer action-layer"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="action-sheet glass-strong"
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${title}`}
        ref={panelRef}
      >
        <span className="sheet-grip" aria-hidden />
        <div className="action-head">
          <h3>{title}</h3>
          {subtitle && <p className="auth-sub">{subtitle}</p>}
          {chips && <div className="action-chips">{chips}</div>}
        </div>

        <div className="action-groups">
          {groups
            .filter((g) => g.options.length > 0)
            .map((g, gi) => (
              <section key={g.title ?? `g${gi}`} className="action-group">
                {g.title && <p className="action-group-title">{g.title}</p>}
                {g.note && <p className="action-group-note">{g.note}</p>}
                {g.options.map((o, oi) => (
                  <button
                    key={o.key}
                    type="button"
                    className="action-option"
                    style={{ "--i": oi } as React.CSSProperties}
                    data-tone={o.tone ?? "default"}
                    data-on={o.on ? "true" : undefined}
                    disabled={o.disabled || busy !== null}
                    aria-pressed={o.on === undefined ? undefined : o.on}
                    onClick={() => void select(o)}
                  >
                    {(o.glyph || busy === o.key) && (
                      <span className="action-option-glyph" aria-hidden>
                        {busy === o.key ? <span className="action-spinner" /> : o.glyph}
                      </span>
                    )}
                    <span className="action-option-text">
                      <span className="action-option-label">
                        {o.label}
                        {o.on && (
                          <span className="action-option-tick" aria-hidden>
                            ✓
                          </span>
                        )}
                      </span>
                      {(o.disabled ? o.disabledReason : o.desc) && (
                        <span className="action-option-desc">
                          {o.disabled ? o.disabledReason : o.desc}
                        </span>
                      )}
                    </span>
                    <span className="action-option-arrow" aria-hidden>
                      ›
                    </span>
                  </button>
                ))}
              </section>
            ))}
        </div>

        <div className="action-foot">
          <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
