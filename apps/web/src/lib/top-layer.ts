"use client";

/**
 * Overlays that have to survive full screen.
 *
 * An element shown full screen is promoted to the browser's TOP LAYER: it and its
 * descendants are painted above the page, and everything else in the document sits behind
 * the backdrop, unpainted. No z-index reaches past that — 2147483647 is still in the page.
 *
 * So an overlay that must stay with the reader cannot simply sit at the end of <body>. It
 * has to MOVE inside whatever is full screen, and move home again afterwards. That is all
 * this does: it owns a host element, re-parents it on demand, and says whether the host is
 * currently somewhere the browser will actually paint it.
 *
 * The host is a plain DOM node rather than something React renders, because React must
 * never be reconciling a node while it is being re-parented. Components portal their
 * overlay INTO the host, so React only ever manages what is inside it.
 */
export type TopLayerHost = {
  /** Portal target. It carries no box of its own — see `display: contents` in globals.css. */
  host: HTMLDivElement;
  /** True while the host is somewhere the browser will paint it. */
  painted: () => boolean;
  /** Put the host where it now belongs. Call it on `fullscreenchange`. */
  reseat: () => void;
  /** Done with it: the host leaves the document. */
  remove: () => void;
};

export function topLayerHost(className: string): TopLayerHost {
  const home = document.body;
  const host = document.createElement("div");
  host.className = className;
  home.appendChild(host);

  const painted = () => {
    const fs = document.fullscreenElement;
    return !fs || fs.contains(host);
  };

  const reseat = () => {
    const fs = document.fullscreenElement;
    // A full-screen <html> already contains the host; only a full-screen PART of the page
    // is something the overlay has to be carried into.
    const target = fs && !fs.contains(home) ? fs : home;
    // Also the repair path: if the full-screen element was torn down it took the host with
    // it, and `parentNode` is now a node that is no longer in the document.
    if (host.parentNode === target) return;
    try {
      target.appendChild(host);
    } catch {
      // Refused. `painted()` reports false from here on, which is the caller's cue to give
      // the native affordance back rather than leave the reader with nothing.
    }
  };

  reseat();
  return { host, painted, reseat, remove: () => host.remove() };
}
