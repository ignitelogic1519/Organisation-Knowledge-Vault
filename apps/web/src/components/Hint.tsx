"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { topLayerHost, type TopLayerHost } from "@/lib/top-layer";

/**
 * The hint layer — the platform's tooltip.
 *
 * The browser's own tooltip appears about a second late, in the operating system's font,
 * in a corner of its own choosing, and it cannot be styled at all. This replaces it with
 * a glass card that opens beside the pointer and travels with it.
 *
 * It reads two sources, in this order:
 *
 *   `data-hint`   the deliberate one. Optional `data-hint-title` gives it a heading and
 *                 `data-hint-tone="required|info|danger"` colours the rail down its side —
 *                 that is what the Studio uses to explain why a field is compulsory.
 *   `title`       everything else. On hover the attribute is MOVED onto the element as
 *                 `data-hint` and removed, so the native tooltip never double-renders and
 *                 the several hundred `title=` strings already written across the app all
 *                 became rich hints without being touched.
 *
 * Behaviour worth knowing:
 *  · It opens after a short delay, but a second hint opened while one is already showing
 *    swaps instantly — moving along a toolbar should not feel like waiting six times.
 *  · It flips to the other side of the pointer near a screen edge rather than being cut off.
 *  · Keyboard focus opens it too, anchored to the element instead of the pointer, so it is
 *    not a mouse-only affordance.
 *  · It follows the page into full screen (lib/top-layer), because a card left behind in
 *    the page is painted nowhere — and having already taken `title` away, that would mean
 *    no tooltip at all. Where it cannot follow, `title` is left alone instead.
 *  · Fine pointers only, and `prefers-reduced-motion` removes the travel, never the card.
 */

const OPEN_DELAY = 320;
/** Once one hint is open, the next follows immediately. */
const CHAIN_WINDOW = 700;
const OFFSET_X = 18;
const OFFSET_Y = 20;
const MARGIN = 10;

export function HintLayer() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<TopLayerHost | null>(null);

  useEffect(() => {
    const owned = topLayerHost("kv-hint-host");
    setTop(owned);
    return () => owned.remove();
  }, []);

  useEffect(() => {
    if (!top) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const card = cardRef.current;
    if (!card) return;

    const titleEl = card.querySelector<HTMLElement>(".kv-hint-title")!;
    const bodyEl = card.querySelector<HTMLElement>(".kv-hint-body")!;

    let openTimer = 0;
    let closedAt = 0;
    let current: Element | null = null;
    let px = 0;
    let py = 0;
    /** Anchored to an element (keyboard focus) rather than following the pointer. */
    let anchored: DOMRect | null = null;

    const place = () => {
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      let left: number;
      let top: number;
      if (anchored) {
        left = anchored.left + anchored.width / 2 - w / 2;
        top = anchored.bottom + 10;
        if (top + h > window.innerHeight - MARGIN) top = anchored.top - h - 10;
      } else {
        // Beside the pointer, flipping across it when the edge of the screen is closer
        // than the card is wide.
        left = px + OFFSET_X;
        top = py + OFFSET_Y;
        if (left + w > window.innerWidth - MARGIN) left = px - w - OFFSET_X;
        if (top + h > window.innerHeight - MARGIN) top = py - h - OFFSET_Y * 0.6;
      }
      card.style.left = `${Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN))}px`;
      card.style.top = `${Math.max(MARGIN, Math.min(top, window.innerHeight - h - MARGIN))}px`;
    };

    const show = (el: Element, rect?: DOMRect) => {
      const source = el as HTMLElement;
      const heading = source.dataset.hintTitle ?? "";
      const body = source.dataset.hint ?? "";
      if (!body) return;
      current = el;
      anchored = rect ?? null;
      titleEl.textContent = heading;
      titleEl.hidden = !heading;
      bodyEl.textContent = body;
      card.dataset.tone = source.dataset.hintTone ?? "info";
      card.dataset.open = "true";
      // Lay it out once it has its content, so the measurements are the real ones.
      requestAnimationFrame(place);
    };

    const hide = () => {
      if (card.dataset.open !== "true") return;
      card.dataset.open = "false";
      closedAt = Date.now();
      current = null;
      anchored = null;
    };

    /** The nearest ancestor carrying a hint — and the moment `title` becomes one. */
    const hintTarget = (from: EventTarget | null): HTMLElement | null => {
      // Nowhere to draw (something is full screen and the card could not be carried into
      // it): take nothing away, so the browser's own tooltip still explains the control.
      if (!top.painted()) return null;
      let el = from instanceof Element ? (from as HTMLElement) : null;
      while (el) {
        if (el.dataset?.hint) return el;
        // Adopt a native title exactly once. Removing the attribute is what stops the
        // browser drawing its own tooltip on top of ours.
        const native = el.getAttribute?.("title");
        if (native && native.trim()) {
          el.dataset.hint = native.trim();
          el.removeAttribute("title");
          return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      const target = hintTarget(e.target);
      if (!target) {
        window.clearTimeout(openTimer);
        hide();
        return;
      }
      if (target === current) {
        if (!anchored) place();
        return;
      }
      window.clearTimeout(openTimer);
      // Chaining: if a hint was up a moment ago, the next one is not a fresh intent to
      // hover, it is the same gesture continuing.
      const instant = card.dataset.open === "true" || Date.now() - closedAt < CHAIN_WINDOW;
      if (instant) {
        show(target);
      } else {
        openTimer = window.setTimeout(() => show(target), OPEN_DELAY);
      }
    };

    // Keyboard parity: tabbing to a control explains it too.
    const onFocus = (e: FocusEvent) => {
      const target = hintTarget(e.target);
      if (!target) return;
      show(target, target.getBoundingClientRect());
    };
    const onBlur = () => hide();
    const onScroll = () => hide();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    // Full screen changed: follow the page in or out of the top layer, and drop any card
    // still open — it was measured against a viewport that no longer exists.
    const onFullscreen = () => {
      top.reseat();
      hide();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", hide, { passive: true });
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);

    return () => {
      window.clearTimeout(openTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", hide);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [top]);

  const overlay = (
    <div ref={cardRef} className="kv-hint" role="tooltip" data-open="false" data-tone="info">
      <span className="kv-hint-rail" aria-hidden />
      <strong className="kv-hint-title" hidden />
      <span className="kv-hint-body" />
    </div>
  );

  return top ? createPortal(overlay, top.host) : null;
}
