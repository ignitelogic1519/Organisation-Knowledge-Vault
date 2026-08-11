"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The reading-zoom gesture, shared by everything the reader can open.
 *
 * Every document reader on earth agrees on the same three gestures, and the rule that
 * matters most is the one about what does NOT zoom: a plain wheel or a one-finger drag
 * scrolls, always. Zooming is deliberate — Ctrl/⌘ held down, or two fingers on the glass —
 * because a reader who meant to scroll and got a resize has lost their place in the text.
 *
 *   · Ctrl/⌘ + wheel (a trackpad pinch arrives as exactly this)
 *   · two-finger pinch on a touch screen
 *   · Ctrl +, Ctrl −, Ctrl 0
 *
 * Text zoom is applied by SCALING THE TYPE, not by transforming the box: the page keeps
 * its width, the lines re-wrap, and nothing ever needs horizontal scrolling to be read.
 * (The PDF view zooms differently — it re-rasterises pages — so it keeps its own handler.)
 */

export const MIN_READER_ZOOM = 0.6;
export const MAX_READER_ZOOM = 3;

const clamp = (z: number) => Math.min(MAX_READER_ZOOM, Math.max(MIN_READER_ZOOM, z));

export function useReaderZoom(enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoomState] = useState(1);
  // The gesture handlers are bound once; they read the live value from here rather than
  // being torn down and rebound on every zoom step.
  const live = useRef(1);

  const setZoom = useCallback((next: number) => {
    const value = clamp(next);
    live.current = value;
    setZoomState(value);
  }, []);
  const zoomBy = useCallback((factor: number) => setZoom(live.current * factor), [setZoom]);
  const reset = useCallback(() => setZoom(1), [setZoom]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // a plain wheel still scrolls the page
      e.preventDefault();
      setZoom(live.current * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    // Two-finger pinch.
    const points = new Map<number, { x: number; y: number }>();
    let startSpread = 0;
    let startZoom = 1;
    const spread = () => {
      const [a, b] = [...points.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) {
        startSpread = spread();
        startZoom = live.current;
      }
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size !== 2 || startSpread === 0) return;
      e.preventDefault();
      setZoom(startZoom * (spread() / startSpread));
    };
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      if (points.size < 2) startSpread = 0;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);

    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom(live.current * 1.15);
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom(live.current / 1.15);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled, setZoom]);

  return { ref, zoom, zoomBy, reset, percent: Math.round(zoom * 100) };
}
