"use client";

/**
 * Where a document opens, and how the reader gets back out.
 *
 * On a desktop browser a document opens in a window of its own, sized to the screen. On a
 * phone — and above all inside the Android shell, which is a single WebView with no tabs and
 * no second window to switch to — a new window is either refused outright or becomes a place
 * the reader cannot leave. There, the document opens in the SAME view and the reader route
 * shows a tab strip to walk back to the page they came from (see `?from=`).
 */

/** True where a second window is not something the reader can manage (or have at all). */
export function isSingleViewDevice(): boolean {
  if (typeof window === "undefined") return true;
  // The Android shell: a WebView reports `; wv` in its user agent.
  if (/\bwv\b/.test(navigator.userAgent)) return true;
  // Installed as a PWA / standalone app window: same story, there is no tab strip.
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // A phone or small tablet: a pop-up here is a window the reader has to hunt for.
  return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
}

/** The reader route for a document, remembering the page to come back to. */
export function readerPath(orgId: string, code: string, preview = false): string {
  const from = typeof window !== "undefined" ? window.location.pathname : "";
  const query = new URLSearchParams();
  if (preview) query.set("mode", "preview");
  if (from) query.set("from", from);
  const q = query.toString();
  return `/read/${encodeURIComponent(orgId)}/${encodeURIComponent(code)}${q ? `?${q}` : ""}`;
}

/**
 * Open a document as its own full-screen reading surface: a screen-sized window where the
 * device has windows, the same view where it does not. Returns false only when a real
 * browser blocked the pop-up, so the caller can say so — never on a single-view device,
 * where navigating in place always works.
 */
export function openInWindow(orgId: string, code: string, preview = false): boolean {
  const url = readerPath(orgId, code, preview);
  if (isSingleViewDevice()) {
    window.location.assign(url);
    return true;
  }
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

/**
 * The storage setup guide, on the same terms as a document: its own tab where the device
 * has tabs, the same view where it does not. It is opened from the storage form, and the
 * reader is expected to work between the two — so this is a plain tab rather than the
 * chromeless pop-up a document gets, and it keeps `?from=` so a phone can walk back.
 */
export function openStorageGuide(): void {
  const from = typeof window !== "undefined" ? window.location.pathname : "";
  const url = `/storage/guide${from ? `?from=${encodeURIComponent(from)}` : ""}`;
  if (isSingleViewDevice()) {
    window.location.assign(url);
    return;
  }
  window.open(url, "kv-storage-guide", "noopener=no")?.focus();
}
