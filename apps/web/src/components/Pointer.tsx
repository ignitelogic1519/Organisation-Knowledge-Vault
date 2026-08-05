"use client";

import { useEffect, useRef } from "react";

/**
 * The Knowledge Vault pointer.
 *
 * A vault of documents should feel like one under your hand, so the cursor is part of the
 * product rather than the operating system's leftover arrow. One element follows the
 * pointer exactly; a second, softer ring trails behind it with a spring, which is what
 * gives the movement weight.
 *
 * ── The hotspot ────────────────────────────────────────────────────────────────
 * Every glyph declares `--hx`/`--hy`: the point ON THE DRAWING that must sit exactly
 * where the operating system thinks the mouse is. The glyph is then offset by
 * -hx/-hy and given `transform-origin: hx hy`, so the hotspot stays pinned even while
 * the glyph scales in and out. Getting this wrong is not cosmetic — it is the
 * difference between clicking what you are pointing at and clicking somewhere near it.
 *
 * ── What it reacts to ──────────────────────────────────────────────────────────
 *   hover      arrow with a star tip / nib over text / hand over a grip / struck ring
 *   fetching   an open book turning its pages (it watches for the app's own `.skeleton`)
 *   scrolling  chevrons in the direction of travel
 *   zooming    a magnifier with + or −
 *   pressing   a spark burst at the click point, and the ring tightens
 *   moving     the ring stretches along the direction of travel, proportional to speed
 *   idle       after 10s of stillness the pointer wanders off into a little scene —
 *              see IDLE_SCENES. A new one every 10s, and the moment you move, it is a
 *              cursor again.
 *
 * Rules it obeys, because a custom cursor that ignores them is worse than none:
 *  · Fine pointers only, and never on a coarse pointer or a touch screen.
 *  · `prefers-reduced-motion` drops the trail, the idle scenes and every idle animation.
 *  · The native cursor is hidden only once this has mounted, so a JavaScript failure
 *    leaves the ordinary arrow exactly where it was.
 *  · Nothing here ever intercepts a click — the layer is `pointer-events: none`.
 */

type PointerState =
  | "default"
  | "select"
  | "text"
  | "grab"
  | "grabbing"
  | "blocked"
  | "reading"
  | "scroll"
  | "zoom";

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

/** Stillness before the pointer starts entertaining itself, and how long each scene lasts. */
const IDLE_AFTER = 10_000;
const SCENE_EVERY = 10_000;

/** A transient reaction (scroll, zoom) outlives the event by this much. */
const TRANSIENT_MS = 700;

/**
 * The idle repertoire. Each is a self-contained SVG in the markup below, revealed by
 * `data-scene`; all the motion is CSS, so an idle pointer costs no JavaScript at all.
 */
const IDLE_SCENES = [
  "stars",
  "shooting",
  "planet",
  "brain",
  "rain",
  "sun",
  "cat",
  "clock",
  "signal",
  "rocket",
  "coffee",
  "plant",
] as const;

export function Pointer() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A pointer this precise is only meaningful on a device that has one.
    const fine = window.matchMedia("(pointer: fine)");
    if (!fine.matches) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    const dot = dotRef.current;
    const ring = ringRef.current;
    const layer = layerRef.current;
    if (!dot || !ring || !layer) return;

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
    /** The element under the pointer, remembered so state can be recomputed without a move. */
    let hovered: EventTarget | null = null;

    // ── Transient reactions (scroll / zoom) ──────────────────────────────────
    let transient: "scroll" | "zoom" | null = null;
    let transientTimer = 0;

    // ── Idle ─────────────────────────────────────────────────────────────────
    let idle = false;
    let idleTimer = 0;
    let sceneTimer = 0;
    let lastScene = -1;

    const setState = (state: PointerState) => {
      if (dot.dataset.state !== state) dot.dataset.state = state;
      if (ring.dataset.state !== state) ring.dataset.state = state;
    };

    /** What is under the pointer decides what the pointer is. */
    const resolve = (target: EventTarget | null): PointerState => {
      if (transient) return transient;
      if (down) return "grabbing";
      const el = target instanceof Element ? target : null;
      if (!el) return reading ? "reading" : "default";
      if (el.closest('[aria-disabled="true"]') || el.closest(":disabled")) return "blocked";
      if (el.closest(DRAGGABLE)) return "grab";
      if (el.closest(TYPEABLE)) return "text";
      if (el.closest(CLICKABLE)) return "select";
      return reading ? "reading" : "default";
    };

    const refresh = () => setState(resolve(hovered));

    // ── The idle repertoire ──────────────────────────────────────────────────
    /** A real clock is worth the four lines: the scene shows the actual time. */
    const syncClock = () => {
      const now = new Date();
      dot.style.setProperty("--kv-sec", String(now.getSeconds()));
      dot.style.setProperty("--kv-min", `${now.getMinutes() * 6 + now.getSeconds() * 0.1}deg`);
      dot.style.setProperty(
        "--kv-hour",
        `${(now.getHours() % 12) * 30 + now.getMinutes() * 0.5}deg`,
      );
    };

    const nextScene = () => {
      let i = 0;
      // Never the same scene twice running — the change is the point.
      do {
        i = Math.floor(Math.random() * IDLE_SCENES.length);
      } while (IDLE_SCENES.length > 1 && i === lastScene);
      lastScene = i;
      const scene = IDLE_SCENES[i];
      if (scene === "clock") syncClock();
      dot.dataset.scene = scene;
    };

    const goIdle = () => {
      if (idle || calm.matches) return;
      idle = true;
      nextScene();
      dot.dataset.idle = "true";
      ring.dataset.idle = "true";
      sceneTimer = window.setInterval(nextScene, SCENE_EVERY);
    };

    const wake = () => {
      if (idle) {
        idle = false;
        window.clearInterval(sceneTimer);
        dot.dataset.idle = "false";
        ring.dataset.idle = "false";
        refresh();
      }
      window.clearTimeout(idleTimer);
      if (!calm.matches) idleTimer = window.setTimeout(goIdle, IDLE_AFTER);
    };

    // ── Movement ─────────────────────────────────────────────────────────────
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      hovered = e.target;
      if (calm.matches) {
        ringX = x;
        ringY = y;
      }
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      wake();
      setState(resolve(e.target));
      if (dot.dataset.hidden === "true") {
        dot.dataset.hidden = "false";
        ring.dataset.hidden = "false";
      }
    };

    // The ring is deliberately a frame behind: it is what makes the pointer feel like an
    // object with mass. It also stretches along the direction of travel, which reads as
    // speed without needing a number on screen.
    const tick = () => {
      const dx = x - ringX;
      const dy = y - ringY;
      ringX += dx * 0.18;
      ringY += dy * 0.18;
      const speed = Math.min(Math.hypot(dx, dy) / 26, 1);
      const angle = speed > 0.02 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;
      ring.style.transform =
        `translate3d(${ringX}px, ${ringY}px, 0) rotate(${angle}deg) ` +
        `scale(${1 + speed * 0.5}, ${1 - speed * 0.32})`;
      frame = requestAnimationFrame(tick);
    };
    if (!calm.matches) frame = requestAnimationFrame(tick);
    else ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    // ── Press ────────────────────────────────────────────────────────────────
    const onDown = (e: PointerEvent) => {
      down = true;
      dot.dataset.down = "true";
      ring.dataset.down = "true";
      wake();
      if (calm.matches) return;
      // A spark burst at the exact click point — proof the hotspot is where you think.
      const burst = document.createElement("span");
      burst.className = "kv-burst";
      burst.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      for (let i = 0; i < 6; i++) {
        const spark = document.createElement("i");
        spark.style.setProperty("--a", `${i * 60}deg`);
        burst.appendChild(spark);
      }
      layer.appendChild(burst);
      window.setTimeout(() => burst.remove(), 620);
    };

    const onUp = (e: PointerEvent) => {
      down = false;
      dot.dataset.down = "false";
      ring.dataset.down = "false";
      hovered = e.target;
      refresh();
    };

    // Leaving the window (or entering a native menu) must not leave a ghost behind.
    const onLeave = () => {
      dot.dataset.hidden = "true";
      ring.dataset.hidden = "true";
    };
    const onEnter = () => {
      dot.dataset.hidden = "false";
      ring.dataset.hidden = "false";
    };

    // ── Scroll & zoom ────────────────────────────────────────────────────────
    const setTransient = (kind: "scroll" | "zoom", dir: string) => {
      transient = kind;
      dot.dataset.dir = dir;
      setState(kind);
      window.clearTimeout(transientTimer);
      transientTimer = window.setTimeout(() => {
        transient = null;
        refresh();
      }, TRANSIENT_MS);
    };

    const onWheel = (e: WheelEvent) => {
      wake();
      // ctrl+wheel is the browser's own zoom gesture, and a trackpad pinch arrives as
      // exactly that — so one branch covers both.
      if (e.ctrlKey) setTransient("zoom", e.deltaY < 0 ? "in" : "out");
      else setTransient("scroll", e.deltaY < 0 ? "up" : "down");
    };

    // Keyboard and scrollbar scrolling never fire `wheel`, so the scroll reaction would
    // be mouse-only without this.
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const now = window.scrollY;
      if (now !== lastScrollY) {
        if (transient !== "zoom") setTransient("scroll", now > lastScrollY ? "down" : "up");
        lastScrollY = now;
      }
      wake();
    };

    const onKey = () => wake();

    // "Loading" is not a guess: the app draws a `.skeleton` while it waits, so watching
    // for one is watching the app's own definition of being busy.
    const skeletons = () => document.querySelector(".skeleton") !== null;
    const observer = new MutationObserver(() => {
      const next = skeletons();
      if (next === reading) return;
      reading = next;
      refresh();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    reading = skeletons();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    window.addEventListener("blur", onLeave);

    // A pointing device can be unplugged, or the window dragged to a touch screen.
    const onPointerKind = (e: MediaQueryListEvent) => {
      root.classList.toggle("kv-pointer-on", e.matches);
    };
    fine.addEventListener("change", onPointerKind);

    wake(); // arm the first idle countdown

    return () => {
      root.classList.remove("kv-pointer-on");
      cancelAnimationFrame(frame);
      window.clearTimeout(idleTimer);
      window.clearTimeout(transientTimer);
      window.clearInterval(sceneTimer);
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      window.removeEventListener("blur", onLeave);
      fine.removeEventListener("change", onPointerKind);
    };
  }, []);

  return (
    <div className="kv-pointer-layer" ref={layerRef} aria-hidden>
      {/* The trailing ring — behind the glyph, so the glyph always reads first. */}
      <div ref={ringRef} className="kv-pointer-ring" data-state="default" data-hidden="true" />
      <div ref={dotRef} className="kv-pointer" data-state="default" data-hidden="true" data-idle="false">
        {/* ── Pointing glyphs. --hx/--hy is the hotspot: the point that sits on the
            mouse. Measured off each drawing, in rendered pixels. ─────────────── */}

        {/* default — a drop of ink, centred on the point */}
        <span className="kv-pointer-dot" style={{ "--hx": "4.5px", "--hy": "4.5px" } as React.CSSProperties} />

        {/* select — arrow with a star at the tip; hotspot IS the tip (4, 2.6) */}
        <svg
          className="kv-pointer-arrow"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          style={{ "--hx": "4px", "--hy": "2.6px" } as React.CSSProperties}
        >
          <path
            d="M4 2.6 L4 17.4 L8.2 13.6 L10.9 19.8 L13.6 18.6 L11 12.6 L16.6 12.2 Z"
            className="kv-pointer-arrow-body"
          />
          <path
            d="M18.6 2 L19.6 4.6 L22.2 5.6 L19.6 6.6 L18.6 9.2 L17.6 6.6 L15 5.6 L17.6 4.6 Z"
            className="kv-pointer-arrow-star"
          />
        </svg>

        {/* text — a nib; hotspot is its point, (12, 2.5) in a 24 box drawn at 20 */}
        <svg
          className="kv-pointer-nib"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          style={{ "--hx": "10px", "--hy": "2.1px" } as React.CSSProperties}
        >
          <path className="kv-nib-body" d="M12 2.5 L16.5 13 L12 21.5 L7.5 13 Z" />
          <path className="kv-nib-slit" d="M12 9.5 L12 16" />
        </svg>

        {/* grab — an open hand that closes on press; hotspot at the grip */}
        <svg
          className="kv-pointer-hand"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          style={{ "--hx": "11px", "--hy": "4.6px" } as React.CSSProperties}
        >
          <path
            className="kv-hand-body"
            d="M7 12.5 V6.6 a1.5 1.5 0 0 1 3 0 V11 V5.2 a1.5 1.5 0 0 1 3 0 V11 V6 a1.5 1.5 0 0 1 3 0 v5.4 V9.2 a1.4 1.4 0 0 1 2.8 0 v5.4 c0 3.6-2.6 6.4-6.2 6.4 -3.6 0-6.6-2.4-6.6-6 Z"
          />
        </svg>

        {/* blocked — a struck-through ring, centred */}
        <svg
          className="kv-pointer-block"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          style={{ "--hx": "10px", "--hy": "10px" } as React.CSSProperties}
        >
          <circle className="kv-block-ring" cx="12" cy="12" r="8.4" />
          <path className="kv-block-bar" d="M6.2 17.8 L17.8 6.2" />
        </svg>

        {/* reading — an open book, one leaf always in flight */}
        <svg
          className="kv-pointer-book"
          viewBox="0 0 32 24"
          width="32"
          height="24"
          style={{ "--hx": "16px", "--hy": "12px" } as React.CSSProperties}
        >
          <path className="kv-book-spine" d="M16 4.8 L16 21" />
          <path className="kv-book-page" d="M16 4.8 C12.4 2.2 7.6 1.8 3.4 3 L3.4 19.4 C7.6 18.2 12.4 18.6 16 21 Z" />
          <path className="kv-book-page" d="M16 4.8 C19.6 2.2 24.4 1.8 28.6 3 L28.6 19.4 C24.4 18.2 19.6 18.6 16 21 Z" />
          <path className="kv-book-turn" d="M16 4.8 C19.6 2.2 24.4 1.8 28.6 3 L28.6 19.4 C24.4 18.2 19.6 18.6 16 21 Z" />
        </svg>

        {/* scroll — chevrons travelling the way the page is going */}
        <svg
          className="kv-pointer-scroll"
          viewBox="0 0 24 32"
          width="20"
          height="27"
          style={{ "--hx": "10px", "--hy": "13.5px" } as React.CSSProperties}
        >
          <rect className="kv-scroll-shell" x="4" y="3" width="16" height="26" rx="8" />
          <circle className="kv-scroll-bead" cx="12" cy="10" r="2.2" />
          <path className="kv-scroll-chev kv-scroll-chev-1" d="M8 24 L12 28 L16 24" />
          <path className="kv-scroll-chev kv-scroll-chev-2" d="M8 19 L12 23 L16 19" />
        </svg>

        {/* zoom — a magnifier that gains a + or a − */}
        <svg
          className="kv-pointer-zoom"
          viewBox="0 0 24 24"
          width="24"
          height="24"
          style={{ "--hx": "10px", "--hy": "10px" } as React.CSSProperties}
        >
          <circle className="kv-zoom-lens" cx="10" cy="10" r="6.6" />
          <path className="kv-zoom-handle" d="M14.9 14.9 L21 21" />
          <path className="kv-zoom-sign kv-zoom-h" d="M6.6 10 H13.4" />
          <path className="kv-zoom-sign kv-zoom-v" d="M10 6.6 V13.4" />
        </svg>

        {/* ── Idle scenes ────────────────────────────────────────────────────
            Shown only when `data-idle="true"`, selected by `data-scene`. All
            centred on the point, all animated purely in CSS. ──────────────── */}
        <div className="kv-idle" style={{ "--hx": "22px", "--hy": "22px" } as React.CSSProperties}>
          {/* twinkling stars */}
          <svg className="kv-scene" data-for="stars" viewBox="0 0 44 44" width="44" height="44">
            <g className="kv-twinkle-g">
              <path className="kv-twinkle kv-t1" d="M12 8 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4 Z" />
              <path className="kv-twinkle kv-t2" d="M31 14 l1.1 2.9 2.9 1.1 -2.9 1.1 -1.1 2.9 -1.1 -2.9 -2.9 -1.1 2.9 -1.1 Z" />
              <path className="kv-twinkle kv-t3" d="M20 27 l1.6 4.1 4.1 1.6 -4.1 1.6 -1.6 4.1 -1.6 -4.1 -4.1 -1.6 4.1 -1.6 Z" />
              <circle className="kv-twinkle kv-t4" cx="35" cy="32" r="1.6" />
              <circle className="kv-twinkle kv-t2" cx="8" cy="26" r="1.2" />
            </g>
          </svg>

          {/* shooting star */}
          <svg className="kv-scene" data-for="shooting" viewBox="0 0 44 44" width="44" height="44">
            <circle className="kv-sky-dot" cx="9" cy="34" r="1.1" />
            <circle className="kv-sky-dot" cx="34" cy="9" r="1.1" />
            <circle className="kv-sky-dot" cx="14" cy="12" r="0.9" />
            <g className="kv-shoot">
              <path className="kv-shoot-tail" d="M0 0 L-15 9" />
              <path className="kv-shoot-head" d="M0 -3.2 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1 Z" />
            </g>
          </svg>

          {/* planet with an orbiting moon */}
          <svg className="kv-scene" data-for="planet" viewBox="0 0 44 44" width="44" height="44">
            <ellipse className="kv-orbit" cx="22" cy="22" rx="17" ry="7" />
            <circle className="kv-planet" cx="22" cy="22" r="8" />
            <path className="kv-planet-band" d="M14.6 19 q7.4 -2.6 14.8 0" />
            <g className="kv-moon-g">
              <circle className="kv-moon" cx="39" cy="22" r="2.6" />
            </g>
          </svg>

          {/* a brain, braining */}
          <svg className="kv-scene" data-for="brain" viewBox="0 0 44 44" width="44" height="44">
            <g className="kv-brain-g">
              <path
                className="kv-brain"
                d="M21 11 a5 5 0 0 0 -8.4 3.2 a4.4 4.4 0 0 0 -2 7.2 a4.6 4.6 0 0 0 2.6 7 a5 5 0 0 0 7.8 3.4 Z"
              />
              <path
                className="kv-brain"
                d="M23 11 a5 5 0 0 1 8.4 3.2 a4.4 4.4 0 0 1 2 7.2 a4.6 4.6 0 0 1 -2.6 7 a5 5 0 0 1 -7.8 3.4 Z"
              />
              <path className="kv-brain-fold" d="M17 16 q3 2 1 5 q-2 3 1 5" />
              <path className="kv-brain-fold" d="M27 16 q-3 2 -1 5 q2 3 -1 5" />
            </g>
            <circle className="kv-spark kv-spark-1" cx="12" cy="9" r="1.5" />
            <circle className="kv-spark kv-spark-2" cx="32" cy="8" r="1.2" />
            <circle className="kv-spark kv-spark-3" cx="36" cy="18" r="1.3" />
          </svg>

          {/* a cloud, raining */}
          <svg className="kv-scene" data-for="rain" viewBox="0 0 44 44" width="44" height="44">
            <path
              className="kv-cloud"
              d="M13 24 a6 6 0 0 1 1.4 -11.8 a8 8 0 0 1 15 2.4 a5.6 5.6 0 0 1 -1.4 11 Z"
            />
            <g className="kv-rain">
              <path className="kv-drop kv-d1" d="M14 27 l-1.6 5" />
              <path className="kv-drop kv-d2" d="M21 27 l-1.6 5" />
              <path className="kv-drop kv-d3" d="M28 27 l-1.6 5" />
            </g>
          </svg>

          {/* the sun */}
          <svg className="kv-scene" data-for="sun" viewBox="0 0 44 44" width="44" height="44">
            <g className="kv-rays">
              {Array.from({ length: 8 }, (_, i) => (
                <path key={i} className="kv-ray" d="M22 3.5 L22 8.5" transform={`rotate(${i * 45} 22 22)`} />
              ))}
            </g>
            <circle className="kv-sun" cx="22" cy="22" r="8.4" />
          </svg>

          {/* a cat, licking its paw */}
          <svg className="kv-scene" data-for="cat" viewBox="0 0 44 44" width="44" height="44">
            <g className="kv-cat-body">
              <path className="kv-cat-fill" d="M12 20 L14 11 L19 15 h6 L30 11 L32 20 a10 10 0 0 1 -20 0 Z" />
              <circle className="kv-cat-eye" cx="18" cy="21" r="1.3" />
              <circle className="kv-cat-eye" cx="26" cy="21" r="1.3" />
              <path className="kv-cat-nose" d="M22 24 l-1.4 -1.6 h2.8 Z" />
              <path className="kv-cat-whisk" d="M13 24 h4 M31 24 h-4" />
            </g>
            {/* The paw rises to the SIDE of the muzzle, not over it — dead centre just
                read as a blob on the chin at cursor size. */}
            <g className="kv-paw-g">
              <ellipse className="kv-paw" cx="30" cy="35" rx="4" ry="3.1" />
              <circle className="kv-paw-bean" cx="28.6" cy="33.9" r="0.75" />
              <circle className="kv-paw-bean" cx="31.4" cy="33.9" r="0.75" />
            </g>
            <path className="kv-tongue" d="M23.4 25.4 q2.4 1.8 0.6 4 q-2.6 -1.4 -0.6 -4 Z" />
          </svg>

          {/* a clock — showing the actual time */}
          <svg className="kv-scene" data-for="clock" viewBox="0 0 44 44" width="44" height="44">
            <circle className="kv-clock-face" cx="22" cy="22" r="15" />
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} className="kv-clock-tick" d="M22 9 L22 11.4" transform={`rotate(${i * 30} 22 22)`} />
            ))}
            <path className="kv-clock-hand kv-clock-hour" d="M22 22 L22 14.5" />
            <path className="kv-clock-hand kv-clock-min" d="M22 22 L22 11" />
            <path className="kv-clock-hand kv-clock-sec" d="M22 24 L22 10" />
            <circle className="kv-clock-pin" cx="22" cy="22" r="1.5" />
          </svg>

          {/* an internet signal, finding its bars */}
          <svg className="kv-scene" data-for="signal" viewBox="0 0 44 44" width="44" height="44">
            <rect className="kv-bar kv-bar-1" x="8" y="27" width="5.5" height="8" rx="1.6" />
            <rect className="kv-bar kv-bar-2" x="16" y="22" width="5.5" height="13" rx="1.6" />
            <rect className="kv-bar kv-bar-3" x="24" y="16" width="5.5" height="19" rx="1.6" />
            <rect className="kv-bar kv-bar-4" x="32" y="9" width="5.5" height="26" rx="1.6" />
          </svg>

          {/* a rocket, going up */}
          <svg className="kv-scene" data-for="rocket" viewBox="0 0 44 44" width="44" height="44">
            <g className="kv-rocket-g">
              <path className="kv-rocket-body" d="M22 6 c5 5 6.6 11 6.6 16.4 L15.4 22.4 C15.4 17 17 11 22 6 Z" />
              <path className="kv-rocket-fin" d="M15.4 19 L11.4 26 L15.4 24.6 Z" />
              <path className="kv-rocket-fin" d="M28.6 19 L32.6 26 L28.6 24.6 Z" />
              <circle className="kv-rocket-port" cx="22" cy="16" r="2.6" />
              <path className="kv-flame kv-flame-a" d="M18.8 23.4 q3.2 7 3.2 10 q0 -3 3.2 -10 Z" />
              <path className="kv-flame kv-flame-b" d="M20.4 23.4 q1.6 4.6 1.6 6.6 q0 -2 1.6 -6.6 Z" />
            </g>
          </svg>

          {/* a coffee, steaming */}
          <svg className="kv-scene" data-for="coffee" viewBox="0 0 44 44" width="44" height="44">
            <path className="kv-steam kv-steam-1" d="M17 16 q-2.4 -3 0 -6 q2.4 -3 0 -6" />
            <path className="kv-steam kv-steam-2" d="M23 16 q-2.4 -3 0 -6 q2.4 -3 0 -6" />
            <path className="kv-cup" d="M11 19 h20 v7 a10 10 0 0 1 -20 0 Z" />
            <path className="kv-cup-handle" d="M31 21 a4.6 4.6 0 0 1 0 8" />
            <path className="kv-saucer" d="M8 37 h24" />
          </svg>

          {/* a seedling, growing */}
          <svg className="kv-scene" data-for="plant" viewBox="0 0 44 44" width="44" height="44">
            <path className="kv-pot" d="M13 28 h18 l-2.4 10 h-13.2 Z" />
            <g className="kv-sprout">
              <path className="kv-stem" d="M22 28 V15" />
              <path className="kv-leaf kv-leaf-l" d="M22 20 q-7 -1.4 -7 -6 q6 0 7 6 Z" />
              <path className="kv-leaf kv-leaf-r" d="M22 17 q7 -1.4 7 -6 q-6 0 -7 6 Z" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
