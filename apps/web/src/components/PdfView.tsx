"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Renders a PDF with PDF.js — pages drawn to canvases we control — so documents display
// inline in the app regardless of the browser's "download PDFs" setting or plugin state.
// (The native <iframe> PDF viewer is unreliable across devices; this is the industry-
// standard approach used by real document viewers.)
//
// Zoom works the way every document reader's does: Ctrl/⌘ + wheel on a trackpad or mouse,
// two-finger pinch on a touch screen, and Ctrl +/−/0 on the keyboard. Pages are re-rendered
// at the new scale (not stretched), so text stays sharp at 400%; while a render is in
// flight the container is scaled with a CSS transform so the gesture feels instant.

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function PdfView({ data }: { data: ArrayBuffer }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // `zoom` is what the pages are rendered at; `preview` is the transform applied while a
  // re-render catches up, so a pinch never feels like it is waiting for anything.
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState(1);
  const renderedZoom = useRef(1);

  /** Zoom about a point (the cursor or the pinch centre), keeping it under the fingers. */
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setZoom((current) => {
      const next = clamp(current * factor);
      if (next === current) return current;
      const el = scrollRef.current;
      if (el && clientX != null && clientY != null) {
        const rect = el.getBoundingClientRect();
        const x = clientX - rect.left + el.scrollLeft;
        const y = clientY - rect.top + el.scrollTop;
        const ratio = next / current;
        // Applied after the browser has laid the new size out.
        requestAnimationFrame(() => {
          el.scrollLeft = x * ratio - (clientX - rect.left);
          el.scrollTop = y * ratio - (clientY - rect.top);
        });
      }
      return next;
    });
  }, []);

  // Ctrl/⌘ + wheel, and pinch — which browsers also report as a ctrl-wheel event.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // a plain wheel still scrolls the document
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

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
        startZoom = zoom;
      }
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size !== 2 || startSpread === 0) return;
      e.preventDefault();
      const c = centre();
      const target = clamp(startZoom * (spread() / startSpread));
      setPreview(target / renderedZoom.current); // instant feedback
      zoomAt(target / zoom, c.x, c.y);
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
  }, [zoom, zoomAt]);

  // Ctrl +/−/0, the keyboard equivalent every reader supports.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomAt(1.2);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomAt(1 / 1.2);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt]);

  // Render (and re-render on zoom). Debounced, so a continuous pinch redraws once it
  // settles rather than on every frame.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    const timer = setTimeout(() => {
      (async () => {
        try {
          // Clone the buffer — pdf.js transfers/detaches it, which would break re-renders
          task = pdfjsLib.getDocument({ data: data.slice(0) });
          const doc = await task.promise;
          if (cancelled) return;
          const width = (container.parentElement?.clientWidth ?? container.clientWidth) || 800;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const canvases: HTMLCanvasElement[] = [];

          for (let n = 1; n <= doc.numPages; n++) {
            if (cancelled) return;
            const pdfPage = await doc.getPage(n);
            const unscaled = pdfPage.getViewport({ scale: 1 });
            // Fit page width to the container (leave a little margin), then apply zoom.
            const scale = (((width - 24) / unscaled.width) * dpr) * zoom;
            const viewport = pdfPage.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.className = "pdf-page";
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width / dpr}px`;
            canvas.style.height = `${viewport.height / dpr}px`;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            canvases.push(canvas);
            await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
          }
          if (cancelled) return;
          // Swap in one go so the reader never sees a half-empty document.
          container.replaceChildren(...canvases);
          renderedZoom.current = zoom;
          setPreview(1);
          setLoading(false);
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Could not render this PDF");
            setLoading(false);
          }
        }
      })();
    }, renderedZoom.current === zoom ? 0 : 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.destroy().catch(() => undefined);
    };
  }, [data, zoom]);

  const percent = Math.round(zoom * 100);

  return (
    <div className="pdf-scroll" ref={scrollRef}>
      {loading && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      {error && <p className="form-error viewer-note">{error}</p>}
      <div
        ref={containerRef}
        className="pdf-pages"
        style={preview !== 1 ? { transform: `scale(${preview})`, transformOrigin: "top center" } : undefined}
      />

      <div className="pdf-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out" title="Zoom out (Ctrl −)">
          −
        </button>
        <button type="button" className="pdf-zoom-level" onClick={() => setZoom(1)} title="Reset to 100% (Ctrl 0)">
          {percent}%
        </button>
        <button type="button" onClick={() => zoomAt(1.25)} aria-label="Zoom in" title="Zoom in (Ctrl +)">
          +
        </button>
        <span className="pdf-zoom-hint">Ctrl + scroll, or pinch</span>
      </div>
    </div>
  );
}
