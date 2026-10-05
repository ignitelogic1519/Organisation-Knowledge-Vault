"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { topLayerHost, type TopLayerHost } from "@/lib/top-layer";

/**
 * The Knowledge Vault pointer.
 *
 * Two marks and nothing else. A small accent dot sits exactly on the mouse — it IS the click
 * point — and a thin ring follows it on a spring. Over something you can click the ring opens
 * into a lens that inverts what it covers; over text the dot becomes a caret; over a drag
 * handle the ring widens and tightens as you take hold.
 *
 * ── Why it is fast ─────────────────────────────────────────────────────────────
 *  · The dot is moved inside the `pointermove` handler itself, so it lands in the same frame
 *    as the event. Nothing about it waits for a timer or a React render.
 *  · Both marks move ONLY by `translate3d` on their own compositor layer. Every state change is
 *    a `transform` or `opacity` transition on a child of that layer — no width, height, margin
 *    or backdrop blur is ever animated, so moving the pointer never costs a layout or a repaint.
 *  · The ring is one `requestAnimationFrame` loop that parks itself the moment the ring has
 *    caught up. A still mouse costs nothing.
 *  · The spring is integrated against real elapsed time in fixed sub-steps, so it feels the
 *    same at 60Hz or 144Hz and cannot blow up after a dropped frame.
 *  · What is under the pointer is resolved at most once per frame, not once per event.
 *
 * Rules it obeys, because a custom cursor that ignores them is worse than none:
 *  · Only on a pointer that is precise AND can hover. A phone, a tablet or a touch-first
 *    laptop never even mounts it, and a touch on a hybrid screen hides it until the mouse
 *    moves again. Every listener is passive, so it can never hold up a scroll.
 *  · The ring trails only while motion is allowed. Under `prefers-reduced-motion`, or with
 *    Appearance → Animation off (the default), it sits locked around the dot instead.
 *  · The native cursor is hidden only while this one is genuinely on screen — which is a
 *    live question, not a fact settled at mount. A script that never runs leaves the
 *    ordinary arrow exactly where it was; and an exam or a document viewer showing part
 *    of the page full screen has the browser paint that element and nothing else, so the
 *    pointer travels into it (lib/top-layer) and stands down if it cannot. Getting this
 *    wrong is how a full-screen exam ends up with no visible cursor at all.
 *  · Nothing here ever intercepts a click — both marks are `pointer-events: none`.
 */

type CursorState = "default" | "select" | "text" | "grab" | "grabbing" | "blocked";

/** Anything you can click, in one selector — kept here so the cursor and the hint agree. */
const CLICKABLE =
  'a[href],button,summary,[role="button"],[role="tab"],[role="option"],label,select,' +
  'input[type="checkbox"],input[type="radio"],input[type="range"],input[type="file"],' +
  'input[type="color"],input[type="submit"],.chip,.star,.library-card,.drawer-menu-item,' +
  ".insp-theme,.kv-def";

const TYPEABLE =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"])' +
  ':not([type="color"]):not([type="submit"]),textarea,[contenteditable="true"]';

const DRAGGABLE =
  '[draggable="true"],.sr-grip,.blockcard-grip,.sheet-grip,[data-grip],.graph-canvas';

/**
 * A widget that draws its own content — the constellation is a single <canvas> — says what is
 * under the pointer by setting an inline `cursor`. Our `cursor: none !important` stops the
 * browser drawing it, but the declaration is still there to read, so a star you can click
 * gets the same lens as a button without the graph knowing this component exists.
 */
const INLINE_CURSOR: Record<string, CursorState> = {
  pointer: "select",
  grab: "grab",
  grabbing: "grabbing",
  text: "text",
  "not-allowed": "blocked",
};

/**
 * The follower's spring, in px/s². Stiffness sets how quickly the ring catches up; the
 * damping ratio of 0.82 lets it settle in about a fifth of a second with roughly 1% of
 * overshoot — enough to feel like an object, never enough to wobble.
 */
const STIFFNESS = 520;
const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.82;
/** Integration sub-step. Small enough to be stable at any frame rate. */
const STEP = 1 / 240;
/** A frame gap longer than this (a background tab, a long task) is not replayed as motion. */
const MAX_GAP = 1 / 20;
/** Close enough, and slow enough, to call the ring settled and park the loop. */
const REST_DISTANCE = 0.1;
const REST_SPEED = 2;

/** The skeleton check is throttled: a burst of DOM changes is one look, not hundreds. */
const BUSY_CHECK_MS = 120;

/** A precise pointer that can hover — the only kind of device that gets this cursor. */
const FINE = "(hover: hover) and (pointer: fine)";

export function Pointer() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  /** Whether this device should have the cursor at all. Unknown until mounted, so: no. */
  const [fine, setFine] = useState(false);
  /**
   * The pointer is portalled into a host of its own, because it has to be able to move:
   * see lib/top-layer. The host only exists after mount, so the layer is client-only —
   * nothing about a cursor was ever meaningful before hydration.
   */
  const [top, setTop] = useState<TopLayerHost | null>(null);

  // A pointing device can be plugged in or unplugged, or the window dragged to a touch
  // screen. Follow it, so the cursor is never left running on a device that has no use for it.
  useEffect(() => {
    const query = window.matchMedia(FINE);
    const sync = () => setFine(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!fine) return;
    const owned = topLayerHost("kv-pointer-host");
    setTop(owned);
    return () => {
      owned.remove();
      setTop(null);
    };
  }, [fine]);

  useEffect(() => {
    if (!top) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    const root = document.documentElement;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    /**
     * Is decorative motion allowed? Two sources, and the OS setting always wins: someone
     * who has asked their system for reduced motion must not be overridden by an
     * in-app switch. The switch (Appearance → Animation) is for the other case — a
     * system that permits motion, and a person who would rather this product sat still.
     */
    const still = () => calm.matches || root.dataset.motion === "off";

    /**
     * The native cursor is hidden only once the custom one KNOWS where it is. Until the
     * first real pointermove gives us a coordinate, the system arrow stays.
     */
    let placed = false;
    let hidden = true;

    /**
     * Every condition for taking the system cursor away, in one place: ours has to be
     * positioned (`placed`) and actually painted where the mouse is (`top.painted()`). Full
     * screen can take our pointer off the screen at any moment, and hiding the system one
     * anyway leaves nothing to point with. `toggle` with a force writes nothing when the
     * class is already right — which matters, because this class restyles every element.
     */
    const syncNative = () => {
      root.classList.toggle("kv-pointer-on", placed && top.painted());
    };

    /**
     * Something went full screen, or came back. Carry the pointer into the top layer —
     * and if it could not go, give the system cursor back rather than leave the reader
     * pointing at an exam they cannot see their mouse on.
     */
    const onFullscreen = () => {
      top.reseat();
      syncNative();
    };

    // ── Where things are ─────────────────────────────────────────────────────
    let x = 0;
    let y = 0;
    /** The ring's position and velocity — the spring's state. */
    let rx = 0;
    let ry = 0;
    let vx = 0;
    let vy = 0;
    let frame = 0;
    /** Timestamp of the previous frame; 0 while the loop is parked. */
    let last = 0;

    let target: Element | null = null;
    /** The element under the pointer may have changed since the state was last worked out. */
    let stale = true;
    /** The page scrolled under a still pointer, so what is under it has to be looked up. */
    let scrolled = false;
    let down = false;

    const put = (el: HTMLElement, px: number, py: number) => {
      el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    };

    /** One attribute on both marks, written only when it actually changes. */
    const flag = (name: "state" | "down" | "busy" | "hidden", value: string) => {
      if (dot.dataset[name] === value) return;
      dot.dataset[name] = value;
      ring.dataset[name] = value;
    };

    const reveal = () => {
      if (!hidden) return;
      hidden = false;
      flag("hidden", "false");
    };

    const conceal = () => {
      if (hidden) return;
      hidden = true;
      flag("hidden", "true");
    };

    /** What is under the pointer decides what the pointer is. */
    const resolve = (el: Element | null): CursorState => {
      if (!el) return "default";
      let state: CursorState = "default";
      const inline = (el as HTMLElement).style?.cursor;
      if (inline && INLINE_CURSOR[inline]) state = INLINE_CURSOR[inline];
      else if (el.closest('[aria-disabled="true"],:disabled')) state = "blocked";
      else if (el.closest(DRAGGABLE)) state = "grab";
      else if (el.closest(TYPEABLE)) state = "text";
      else if (el.closest(CLICKABLE)) state = "select";
      return state === "grab" && down ? "grabbing" : state;
    };

    // ── The frame ────────────────────────────────────────────────────────────
    const tick = (now: number) => {
      frame = 0;

      if (scrolled) {
        scrolled = false;
        // The layer is `pointer-events: none`, so this finds the page, never ourselves.
        target = document.elementFromPoint(x, y);
        stale = true;
      }
      if (stale) {
        stale = false;
        flag("state", resolve(target));
      }

      if (still()) {
        rx = x;
        ry = y;
        vx = vy = 0;
        last = 0;
        put(ring, rx, ry);
        return;
      }

      let dt = last ? Math.min((now - last) / 1000, MAX_GAP) : 1 / 60;
      last = now;
      while (dt > 0) {
        const h = Math.min(dt, STEP);
        vx += (STIFFNESS * (x - rx) - DAMPING * vx) * h;
        vy += (STIFFNESS * (y - ry) - DAMPING * vy) * h;
        rx += vx * h;
        ry += vy * h;
        dt -= h;
      }

      if (Math.hypot(x - rx, y - ry) < REST_DISTANCE && Math.hypot(vx, vy) < REST_SPEED) {
        // Caught up: land exactly on the dot and stop asking for frames.
        rx = x;
        ry = y;
        vx = vy = 0;
        last = 0;
        put(ring, rx, ry);
        return;
      }

      put(ring, rx, ry);
      frame = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // ── Movement ─────────────────────────────────────────────────────────────
    const onMove = (e: PointerEvent) => {
      // A finger on a hybrid screen has no cursor to draw; hand back until the mouse returns.
      if (e.pointerType === "touch") {
        conceal();
        return;
      }
      // The host rides inside whatever is full screen. If React tore that element down —
      // an exam handed in, a viewer closed — the host went with it, and no
      // `fullscreenchange` we have already handled will bring it back. Notice on the next
      // movement, which is the first moment it would matter.
      if (!top.host.isConnected) onFullscreen();

      x = e.clientX;
      y = e.clientY;
      // Zero latency: the dot is written here, in the event, not on the next frame.
      put(dot, x, y);

      if (!placed || still()) {
        // First real coordinate: put the ring there too, so it does not fly in from a corner.
        rx = x;
        ry = y;
        put(ring, x, y);
      }
      if (!placed) {
        placed = true;
        syncNative();
      }

      target = e.target instanceof Element ? e.target : null;
      stale = true;
      reveal();
      kick();
    };

    // ── Press ────────────────────────────────────────────────────────────────
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        conceal();
        return;
      }
      down = true;
      flag("down", "true");
      stale = true;
      kick();
    };

    /**
     * The press is over. `pointerup` is not the only way that happens: a native drag ends
     * the pointer stream with `pointercancel` and never sends an `up`, which used to leave
     * the cursor stuck in its grabbing pose until the next click.
     */
    const release = () => {
      if (!down) return;
      down = false;
      flag("down", "false");
      stale = true;
      kick();
    };

    // A native (HTML5) drag hands the pointer to the operating system: it draws its own
    // cursor and drag image, and sends us no movement until the drop. Step aside rather
    // than leave a frozen dot where the drag began.
    const onDragStart = () => {
      release();
      conceal();
    };
    const onDragEnd = (e: DragEvent) => {
      // Some browsers report the drop point here; where they do, reappear on it at once.
      if (!e.clientX && !e.clientY) return;
      x = rx = e.clientX;
      y = ry = e.clientY;
      vx = vy = 0;
      put(dot, x, y);
      put(ring, x, y);
      target = document.elementFromPoint(x, y);
      stale = true;
      reveal();
      kick();
    };

    // Leaving the window — or crossing into an embedded frame, which has its own cursor and
    // stops sending us movement — must not leave a ghost behind.
    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget;
      if (!to || (to instanceof Element && /^(IFRAME|EMBED|OBJECT)$/.test(to.tagName))) conceal();
    };

    // The page moving under a still pointer changes what it is over.
    const onScroll = () => {
      if (!placed || hidden) return;
      scrolled = true;
      kick();
    };

    // ── Busy ─────────────────────────────────────────────────────────────────
    // "Loading" is not a guess: the app draws a `.skeleton` while it waits. A live
    // collection makes each look a length read, and the observer only schedules one look
    // per burst of DOM changes rather than querying the document on every mutation.
    const skeletons = document.getElementsByClassName("skeleton");
    let busyTimer = 0;
    const checkBusy = () => {
      busyTimer = 0;
      flag("busy", skeletons.length > 0 ? "true" : "false");
    };
    const observer = new MutationObserver(() => {
      if (!busyTimer) busyTimer = window.setTimeout(checkBusy, BUSY_CHECK_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    checkBusy();

    // Appearance → Animation was toggled, or the OS setting changed: the next frame either
    // locks the ring onto the dot or lets the spring take it from where it is.
    const onMotionChange = () => {
      vx = vy = 0;
      last = 0;
      kick();
    };

    const passive = { passive: true } as const;
    window.addEventListener("pointermove", onMove, passive);
    window.addEventListener("pointerdown", onDown, passive);
    window.addEventListener("pointerup", release, passive);
    window.addEventListener("pointercancel", release, passive);
    window.addEventListener("dragstart", onDragStart, passive);
    window.addEventListener("dragend", onDragEnd, passive);
    document.addEventListener("pointerout", onOut, passive);
    window.addEventListener("blur", conceal);
    // Capture, so a scrolling panel inside the page counts as well as the page itself.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("kv:motionchange", onMotionChange);
    calm.addEventListener("change", onMotionChange);

    onFullscreen(); // the page may already be full screen — a reader navigating inside one

    return () => {
      root.classList.remove("kv-pointer-on");
      cancelAnimationFrame(frame);
      window.clearTimeout(busyTimer);
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", conceal);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("kv:motionchange", onMotionChange);
      calm.removeEventListener("change", onMotionChange);
    };
  }, [top]);

  const cursor = (
    <>
      {/* The follower. Blended by `difference`, so it is drawn in the inverse of whatever
          it is over — dark on the day theme, light at night, never lost against either. */}
      <div ref={ringRef} className="kv-cursor-ring" data-state="default" data-hidden="true" aria-hidden>
        <span className="kv-cursor-ring-shape">
          <span className="kv-cursor-halo" />
          <span className="kv-cursor-arc" />
          <span className="kv-cursor-lens" />
        </span>
      </div>
      {/* The core. Its centre is the click point. */}
      <div ref={dotRef} className="kv-cursor-dot" data-state="default" data-hidden="true" aria-hidden>
        <span className="kv-cursor-core" />
        <span className="kv-cursor-caret" />
      </div>
    </>
  );

  return top ? createPortal(cursor, top.host) : null;
}
