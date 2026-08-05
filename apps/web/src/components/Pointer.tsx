"use client";

import { useEffect, useRef } from "react";

/**
 * The Knowledge Vault pointer.
 *
 * A vault of documents should feel like one under your hand, so the cursor is part of the
 * product rather than the operating system's leftover arrow. One element follows the
 * pointer exactly; a second, softer ring trails behind it with a spring, which is what
 * gives the movement weight. What is drawn inside depends on what is under the pointer:
 *
 *   reading   an open book turning its pages — shown while the app is fetching
 *   select    an arrow with a star at its tip, for anything clickable
 *   text      a nib, over anything you can type into
 *   grab      an open hand over a drag handle, closed while dragging
 *   blocked   a struck-through ring over a disabled control
 *   default   a small ink dot
 *
 * Rules it obeys, because a custom cursor that ignores them is worse than none:
 *  · Fine pointers only. A touch screen has no cursor to replace, and a coarse pointer
 *    (a TV remote, a stylus) is not helped by one either.
 *  · `prefers-reduced-motion` drops the trailing ring and every idle animation.
 *  · The native cursor is only hidden once this component has mounted and painted, so a
 *    JavaScript failure leaves the ordinary arrow exactly where it was.
 *  · Nothing here ever intercepts a click — the layer is `pointer-events: none`.
 */

type PointerState = "default" | "select" | "text" | "grab" | "grabbing" | "blocked" | "reading";

/** Anything you can click, in one selector — kept here so the cursor and the hint agree. */
const CLICKABLE =
  'a[href],button,summary,[role="button"],[role="tab"],[role="option"],label,select,' +
  'input[type="checkbox"],input[type="radio"],input[type="range"],input[type="file"],' +
  'input[type="color"],input[type="submit"],.chip,.star,.library-card,.drawer-menu-item,' +
  ".insp-theme,.kv-def";

const TYPEABLE =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"])' +
  ':not([type="color"]):not([type="submit"]),textarea,[contenteditable="true"]';

const DRAGGABLE = '[draggable="true"],.sr-grip,.blockcard-grip,.sheet-grip,[data-grip]';

export function Pointer() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A pointer this precise is only meaningful on a device that has one.
    const fine = window.matchMedia("(pointer: fine)");
    if (!fine.matches) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const root = document.documentElement;
    root.classList.add("kv-pointer-on");

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let ringX = x;
    let ringY = y;
    let frame = 0;
    let down = false;
    /** True while the app is fetching — the book-turning state. */
    let reading = false;

    const setState = (state: PointerState) => {
      if (dot.dataset.state !== state) dot.dataset.state = state;
      if (ring.dataset.state !== state) ring.dataset.state = state;
    };

    /** What is under the pointer decides what the pointer is. */
    const resolve = (target: EventTarget | null): PointerState => {
      if (down) return "grabbing";
      const el = target instanceof Element ? target : null;
      if (!el) return reading ? "reading" : "default";
      if (el.closest('[aria-disabled="true"]') || el.closest(":disabled")) return "blocked";
      if (el.closest(DRAGGABLE)) return "grab";
      if (el.closest(TYPEABLE)) return "text";
      if (el.closest(CLICKABLE)) return "select";
      return reading ? "reading" : "default";
    };

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (calm.matches) {
        ringX = x;
        ringY = y;
      }
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      setState(resolve(e.target));
      if (dot.dataset.hidden === "true") {
        dot.dataset.hidden = "false";
        ring.dataset.hidden = "false";
      }
    };

    // The ring is deliberately a frame behind: it is what makes the pointer feel like an
    // object with mass rather than a sprite pinned to the mouse.
    const tick = () => {
      ringX += (x - ringX) * 0.18;
      ringY += (y - ringY) * 0.18;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      frame = requestAnimationFrame(tick);
    };
    if (!calm.matches) frame = requestAnimationFrame(tick);
    else ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    const onDown = () => {
      down = true;
      dot.dataset.down = "true";
      ring.dataset.down = "true";
    };
    const onUp = (e: PointerEvent) => {
      down = false;
      dot.dataset.down = "false";
      ring.dataset.down = "false";
      setState(resolve(e.target));
    };
    // Leaving the window (or entering a native menu) must not leave a ghost behind.
    const onLeave = () => {
      dot.dataset.hidden = "true";
      ring.dataset.hidden = "true";
    };

    // "Loading" is not a guess: the app draws a `.skeleton` while it waits, so watching
    // for one is watching the app's own definition of being busy.
    const skeletons = () => document.querySelector(".skeleton") !== null;
    const observer = new MutationObserver(() => {
      const next = skeletons();
      if (next === reading) return;
      reading = next;
      // Re-resolve without waiting for the pointer to move — the page just changed
      // underneath it.
      setState(resolve(document.elementFromPoint(x, y)));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    reading = skeletons();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    // A pointing device can be unplugged, or the window dragged to a touch screen.
    const onPointerKind = (e: MediaQueryListEvent) => {
      root.classList.toggle("kv-pointer-on", e.matches);
    };
    fine.addEventListener("change", onPointerKind);

    return () => {
      root.classList.remove("kv-pointer-on");
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      fine.removeEventListener("change", onPointerKind);
    };
  }, []);

  return (
    <div className="kv-pointer-layer" aria-hidden>
      {/* The trailing ring — behind the glyph, so the glyph always reads first. */}
      <div ref={ringRef} className="kv-pointer-ring" data-state="default" data-hidden="true" />
      <div ref={dotRef} className="kv-pointer" data-state="default" data-hidden="true">
        {/* default — a drop of ink */}
        <span className="kv-pointer-dot" />

        {/* select — an arrow with a star at the very tip */}
        <svg className="kv-pointer-arrow" viewBox="0 0 24 24" width="24" height="24">
          <path
            d="M4 2.6 L4 17.4 L8.2 13.6 L10.9 19.8 L13.6 18.6 L11 12.6 L16.6 12.2 Z"
            className="kv-pointer-arrow-body"
          />
          <path
            d="M18.6 2 L19.6 4.6 L22.2 5.6 L19.6 6.6 L18.6 9.2 L17.6 6.6 L15 5.6 L17.6 4.6 Z"
            className="kv-pointer-arrow-star"
          />
        </svg>

        {/* reading — an open book whose right-hand page turns, over and over */}
        <svg className="kv-pointer-book" viewBox="0 0 32 24" width="32" height="24">
          <path className="kv-book-spine" d="M16 4.8 L16 21" />
          <path
            className="kv-book-page"
            d="M16 4.8 C12.4 2.2 7.6 1.8 3.4 3 L3.4 19.4 C7.6 18.2 12.4 18.6 16 21 Z"
          />
          <path
            className="kv-book-page"
            d="M16 4.8 C19.6 2.2 24.4 1.8 28.6 3 L28.6 19.4 C24.4 18.2 19.6 18.6 16 21 Z"
          />
          {/* the leaf in flight */}
          <path
            className="kv-book-turn"
            d="M16 4.8 C19.6 2.2 24.4 1.8 28.6 3 L28.6 19.4 C24.4 18.2 19.6 18.6 16 21 Z"
          />
        </svg>

        {/* text — a nib */}
        <svg className="kv-pointer-nib" viewBox="0 0 24 24" width="20" height="20">
          <path className="kv-nib-body" d="M12 2.5 L16.5 13 L12 21.5 L7.5 13 Z" />
          <path className="kv-nib-slit" d="M12 9.5 L12 16" />
        </svg>

        {/* grab — an open hand that closes on press */}
        <svg className="kv-pointer-hand" viewBox="0 0 24 24" width="22" height="22">
          <path
            className="kv-hand-body"
            d="M7 12.5 V6.6 a1.5 1.5 0 0 1 3 0 V11 V5.2 a1.5 1.5 0 0 1 3 0 V11 V6 a1.5 1.5 0 0 1 3 0 v5.4 V9.2 a1.4 1.4 0 0 1 2.8 0 v5.4 c0 3.6-2.6 6.4-6.2 6.4 -3.6 0-6.6-2.4-6.6-6 Z"
          />
        </svg>

        {/* blocked — a struck-through ring */}
        <svg className="kv-pointer-block" viewBox="0 0 24 24" width="20" height="20">
          <circle className="kv-block-ring" cx="12" cy="12" r="8.4" />
          <path className="kv-block-bar" d="M6.2 17.8 L17.8 6.2" />
        </svg>
      </div>
    </div>
  );
}
