"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Renders a PDF with PDF.js — pages drawn to canvases we control — so documents display
// inline in the app regardless of the browser's "download PDFs" setting or plugin state.
// (The native <iframe> PDF viewer is unreliable across devices; this is the industry-
// standard approach used by real document viewers.)

// Bundle the worker as an asset (webpack/Next handle `new URL(..., import.meta.url)`).
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
}

export function PdfView({ data }: { data: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let task: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    (async () => {
      try {
        // Clone the buffer — pdf.js transfers/detaches it, which would break re-renders
        task = pdfjsLib.getDocument({ data: data.slice(0) });
        const doc = await task.promise;
        if (cancelled) return;
        container.innerHTML = "";
        const width = container.clientWidth || 800;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const pdfPage = await doc.getPage(n);
          const unscaled = pdfPage.getViewport({ scale: 1 });
          // Fit page width to the container (leave a little margin)
          const scale = ((width - 24) / unscaled.width) * dpr;
          const viewport = pdfPage.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page";
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / dpr}px`;
          canvas.style.height = `${viewport.height / dpr}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          container.appendChild(canvas);
          await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
        }
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not render this PDF");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.destroy().catch(() => undefined);
    };
  }, [data]);

  return (
    <div className="pdf-scroll">
      {loading && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      {error && <p className="form-error viewer-note">{error}</p>}
      <div ref={containerRef} className="pdf-pages" />
    </div>
  );
}
