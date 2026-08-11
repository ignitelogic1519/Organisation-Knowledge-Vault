"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Renders a PDF with PDF.js — pages drawn to canvases we control — so documents display
// inline in the app regardless of the browser's "download PDFs" setting or plugin state.
// (The native <iframe> PDF viewer is unreliable across devices; this is the industry-
// standard approach used by real document viewers.)
//
// Zoom works the way every document reader's does: Ctrl/⌘ + wheel on a trackpad or mouse,
// two-finger pinch on a touch screen, and Ctrl +/−/0 on the keyboard. A plain wheel or a
// one-finger drag always scrolls — zoom is deliberate, or a reader who meant to scroll
// loses their place.
//
// WHAT MAKES IT FAST. Every page keeps its own canvas for the life of the document, and a
// zoom does two separate things at two different speeds:
//
//   1. Immediately, every canvas is RESIZED in CSS. That is a style write per page and
//      nothing else: the layout is correct on the next frame, scrolling is correct, and
//      each page shows its existing bitmap scaled by the browser — slightly soft, in the
//      right place, instantly.
//   2. Shortly after, the pages the reader can actually SEE are re-rasterised at the new
//      scale and swapped in sharp. Pages off screen are left alone until they scroll into
//      view.
//
// The version before this re-rasterised the WHOLE document on every zoom step. On a
// 134-page book that was around twenty-five seconds of blocked main thread per press of
// the + button — which is what "the zoom buttons take forever" meant. Now the cost of a
// zoom is the handful of pages in front of the reader, whatever the document's length.

/**
 * pdf.js 6.1 calls `Map.prototype.getOrInsertComputed` — a proposal that only reached
 * shipping browsers in late 2025. On anything older the very first document throws
 * "getOrInsertComputed is not a function" from inside the library and the reader shows an
 * empty frame: no pages, and therefore no zoom to complain about either. That is a large
 * share of phones, where the Android WebView trails the desktop browser by months.
 *
 * Four lines of the proposal's own semantics, installed before the library is touched,
 * and the viewer works on every browser again. It is a no-op wherever the method is
 * already native.
 */
function installMapGetOrInsert() {
  // Same story, different proposal: pdf.js reaches for `Math.sumPrecise` while measuring
  // glyphs. Missing, it does not throw — it quietly degrades the text on the page.
  const maths = Math as unknown as Record<string, unknown>;
  if (typeof maths.sumPrecise !== "function") {
    maths.sumPrecise = (values: Iterable<number>) => {
      // Neumaier summation: the running compensation is what makes it "precise", and it
      // costs one extra add per term.
      let sum = 0;
      let compensation = 0;
      for (const value of values) {
        const next = sum + value;
        compensation +=
          Math.abs(sum) >= Math.abs(value) ? sum - next + value : value - next + sum;
        sum = next;
      }
      return sum + compensation;
    };
  }

  for (const Ctor of [Map, WeakMap] as unknown as (typeof Map)[]) {
    const proto = Ctor.prototype as unknown as Record<string, unknown>;
    if (typeof proto.getOrInsert !== "function") {
      proto.getOrInsert = function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
        if (!this.has(key)) this.set(key, value);
        return this.get(key);
      };
    }
    if (typeof proto.getOrInsertComputed !== "function") {
      proto.getOrInsertComputed = function (
        this: Map<unknown, unknown>,
        key: unknown,
        compute: (k: unknown) => unknown,
      ) {
        if (!this.has(key)) this.set(key, compute(key));
        return this.get(key);
      };
    }
  }
}

if (typeof window !== "undefined") {
  installMapGetOrInsert();
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** How far outside the frame a page is still worth rasterising, as a fraction of it. */
const OVERSCAN = 0.75;
/** A pinch settles before the sharpening starts, so a gesture is not fighting a render. */
const SHARPEN_DELAY = 140;
/** Retina, but never more than twice — beyond that it is memory nobody can see. */
const maxDpr = () => Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);

/** One page of the document: its canvas, its true size, and what it was last drawn at. */
interface Shell {
  page: pdfjsLib.PDFPageProxy;
  canvas: HTMLCanvasElement;
  /** The page's own dimensions at scale 1, which never change. */
  base: { width: number; height: number };
  /** The zoom its bitmap was drawn for — 0 while it has never been drawn. */
  drawnAt: number;
  task: { cancel: () => void } | null;
}

export function PdfView({ data }: { data: ArrayBuffer }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  // The live scale, read by the gesture handlers and the render loop. They are bound once
  // and never rebound: depending on the `zoom` STATE meant tearing the pinch listeners
  // down and re-attaching them on every frame, against a value one render behind the
  // fingers.
  const zoomRef = useRef(1);
  const shellsRef = useRef<Shell[]>([]);
  const sharpenTimer = useRef(0);

  /** The width one page is fitted to — the frame, less the padding around the stack. */
  const availableWidth = useCallback(
    () => Math.max(120, (containerRef.current?.parentElement?.clientWidth ?? 800) - 24),
    [],
  );

  /**
   * Give every page the size it has at this zoom. Pure style writes — no rasterising —
   * so the whole document is correctly laid out within a frame of the gesture.
   */
  const layout = useCallback(() => {
    const avail = availableWidth();
    for (const shell of shellsRef.current) {
      const width = avail * zoomRef.current;
      shell.canvas.style.width = `${width}px`;
      shell.canvas.style.height = `${(width * shell.base.height) / shell.base.width}px`;
    }
  }, [availableWidth]);

  /** Draw one page at the current zoom, swapping the bitmap in only once it is complete. */
  const draw = useCallback(
    async (shell: Shell) => {
      const at = zoomRef.current;
      if (shell.drawnAt === at || shell.task) return;
      const dpr = maxDpr();
      const scale = ((availableWidth() * at) / shell.base.width) * dpr;
      const viewport = shell.page.getViewport({ scale });
      // Drawn off to the side and blitted across. Resizing the live canvas would blank the
      // page for as long as the render takes, and a document that flashes white every time
      // you zoom is worse than one that is briefly soft.
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.floor(viewport.width));
      off.height = Math.max(1, Math.floor(viewport.height));
      const offCtx = off.getContext("2d");
      if (!offCtx) return;
      const task = shell.page.render({ canvasContext: offCtx, viewport, canvas: off });
      shell.task = task;
      try {
        await task.promise;
        // The reader may have zoomed again while this was drawing; that render wins.
        if (zoomRef.current !== at) return;
        shell.canvas.width = off.width;
        shell.canvas.height = off.height;
        shell.canvas.getContext("2d")?.drawImage(off, 0, 0);
        shell.drawnAt = at;
      } catch {
        /* cancelled, or a page pdf.js cannot draw — the shell keeps its size either way */
      } finally {
        if (shell.task === task) shell.task = null;
      }
    },
    [availableWidth],
  );

  /** Rasterise what the reader can see, plus a little beyond it in both directions. */
  const sharpenVisible = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop - el.clientHeight * OVERSCAN;
    const bottom = el.scrollTop + el.clientHeight * (1 + OVERSCAN);
    for (const shell of shellsRef.current) {
      const y = shell.canvas.offsetTop;
      const height = shell.canvas.offsetHeight;
      if (y + height < top || y > bottom) {
        // Off screen and stale: drop any render still running for it.
        if (shell.task && shell.drawnAt !== zoomRef.current) {
          shell.task.cancel();
          shell.task = null;
        }
        continue;
      }
      void draw(shell);
    }
  }, [draw]);

  const scheduleSharpen = useCallback(
    (delay = SHARPEN_DELAY) => {
      window.clearTimeout(sharpenTimer.current);
      sharpenTimer.current = window.setTimeout(sharpenVisible, delay);
    },
    [sharpenVisible],
  );

  /**
   * Go to a scale, keeping a point (the cursor, or the centre of a pinch) where it is on
   * screen. Because `layout` is only style writes, the anchor can be honoured in the same
   * breath — there is no "wait for the pages to be redrawn first" any more.
   */
  const zoomToScale = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const current = zoomRef.current;
      const target = clamp(next);
      if (target === current) return;
      const el = scrollRef.current;
      let anchor: { contentX: number; contentY: number; offsetX: number; offsetY: number } | null =
        null;
      if (el && clientX != null && clientY != null) {
        const rect = el.getBoundingClientRect();
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;
        anchor = {
          contentX: (offsetX + el.scrollLeft) / current,
          contentY: (offsetY + el.scrollTop) / current,
          offsetX,
          offsetY,
        };
      }
      zoomRef.current = target;
      setZoom(target);
      layout();
      if (el && anchor) {
        el.scrollLeft = anchor.contentX * target - anchor.offsetX;
        el.scrollTop = anchor.contentY * target - anchor.offsetY;
      }
      scheduleSharpen();
    },
    [layout, scheduleSharpen],
  );

  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) =>
      zoomToScale(zoomRef.current * factor, clientX, clientY),
    [zoomToScale],
  );

  // ── Load the document, and build one canvas per page ──────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Clone the buffer — pdf.js transfers/detaches it, which would break a reload.
        task = pdfjsLib.getDocument({ data: data.slice(0) });
        const doc = await task.promise;
        if (cancelled) return;
        const shells: Shell[] = [];
        const frag = document.createDocumentFragment();
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page";
          shells.push({ page, canvas, base, drawnAt: 0, task: null });
          frag.appendChild(canvas);
        }
        if (cancelled) return;
        container.replaceChildren(frag);
        shellsRef.current = shells;
        layout();
        setLoading(false);
        // The first screen, straight away; the rest as it is scrolled to.
        sharpenVisible();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not render this PDF");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(sharpenTimer.current);
      for (const shell of shellsRef.current) shell.task?.cancel();
      shellsRef.current = [];
      task?.destroy().catch(() => undefined);
    };
  }, [data, layout, sharpenVisible]);

  // Sharpen what comes into view as the reader scrolls, and re-fit when the frame resizes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scheduleSharpen(60);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(() => {
      layout();
      // Every bitmap is now the wrong width, not just the visible ones.
      for (const shell of shellsRef.current) shell.drawnAt = 0;
      scheduleSharpen(200);
    });
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [layout, scheduleSharpen]);

  // Ctrl/⌘ + wheel, and the trackpad pinch browsers report as exactly that.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // a plain wheel still scrolls the document
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Two-finger pinch on a touch screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const points = new Map<number, { x: number; y: number }>();
    let startSpread = 0;
    let startZoom = 1;

    const spread = () => {
      const [a, b] = [...points.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const centre = () => {
      const [a, b] = [...points.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) {
        startSpread = spread();
        startZoom = zoomRef.current;
      }
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size !== 2 || startSpread === 0) return;
      e.preventDefault();
      const c = centre();
      zoomToScale(startZoom * (spread() / startSpread), c.x, c.y);
    };
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (points.size < 2) startSpread = 0;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [zoomToScale]);

  // Ctrl +/−/0, the keyboard equivalent every reader supports.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(1.2);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomBy(1 / 1.2);
      } else if (e.key === "0") {
        e.preventDefault();
        zoomToScale(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy, zoomToScale]);

  const percent = Math.round(zoom * 100);

  return (
    <div className="pdf-scroll" ref={scrollRef}>
      {loading && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      {error && <p className="form-error viewer-note">{error}</p>}
      <div ref={containerRef} className="pdf-pages" />

      <div className="pdf-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out (Ctrl −)">
          −
        </button>
        <button type="button" className="pdf-zoom-level" onClick={() => zoomToScale(1)} title="Reset to 100% (Ctrl 0)">
          {percent}%
        </button>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (Ctrl +)">
          +
        </button>
        <span className="pdf-zoom-hint">Ctrl + scroll, or pinch</span>
      </div>
    </div>
  );
}
