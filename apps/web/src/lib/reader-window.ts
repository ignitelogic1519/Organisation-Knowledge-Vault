"use client";

/**
 * Opening a document in a window of its own, sized to fill the screen. The reader route
 * (/read/<org>/<code>) renders the same viewer the in-app reader uses, with nothing else
 * on the page. Returns false when the browser blocked the pop-up, so the caller can say so.
 */
export function openInWindow(orgId: string, code: string, preview = false): boolean {
  const url = `/read/${encodeURIComponent(orgId)}/${encodeURIComponent(code)}${
    preview ? "?mode=preview" : ""
  }`;
  const w = Math.max(screen.availWidth || window.outerWidth, 640);
  const h = Math.max(screen.availHeight || window.outerHeight, 480);
  // `popup` drops the tab strip and the toolbars, so the document — not the browser — is
  // what fills the screen, and the window can still go true-fullscreen from inside.
  const win = window.open(
    url,
    `kv-doc-${code}`,
    `popup=yes,noopener=no,width=${w},height=${h},left=0,top=0`,
  );
  win?.focus();
  return !!win;
}
