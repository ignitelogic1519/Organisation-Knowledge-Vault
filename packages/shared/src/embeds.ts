// Embed allowlist. An authored document may frame content from a small, named set of
// hosts — the ones an organization actually uses for training material. Anything else is
// refused, and every accepted URL is REBUILT from its parsed parts rather than passed
// through, so a crafted query string can never smuggle a different destination into the
// frame. The renderer sandboxes the iframe on top of this.

export interface EmbedProvider {
  key: string;
  label: string;
  /** Default aspect ratio (width / height); null = use the author's height. */
  ratio: number | null;
}

export const EMBED_PROVIDERS: EmbedProvider[] = [
  { key: "youtube", label: "YouTube", ratio: 16 / 9 },
  { key: "vimeo", label: "Vimeo", ratio: 16 / 9 },
  { key: "drive", label: "Google Drive", ratio: null },
  { key: "docs", label: "Google Docs / Sheets / Slides", ratio: null },
  { key: "forms", label: "Google Forms", ratio: null },
  { key: "maps", label: "Google Maps", ratio: 16 / 10 },
  { key: "calendar", label: "Google Calendar", ratio: 4 / 3 },
];

export interface ResolvedEmbed {
  provider: string;
  /** The URL to put in the iframe — always rebuilt by us, never the author's string. */
  src: string;
  ratio: number | null;
}

const ID = /^[A-Za-z0-9_-]{5,80}$/;

// The WHATWG URL parser exists in every runtime this package targets (Node and the
// browser), but the shared package compiles against the plain ES library so that nothing
// here can reach for a DOM global by accident. Declare exactly the surface we use.
interface ParsedUrl {
  protocol: string;
  hostname: string;
  pathname: string;
  searchParams: { get(name: string): string | null };
}
declare const URL: { new (input: string): ParsedUrl };

/**
 * Turn a pasted address into a safe embed, or null when the host isn't on the list.
 * Accepts the normal "share" URLs people copy out of each product.
 */
export function resolveEmbed(raw: string): ResolvedEmbed | null {
  let url: ParsedUrl;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname;

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id = url.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([^/]+)/.exec(path)?.[1];
    if (id && ID.test(id)) {
      // nocookie host: no advertising cookies are set for the reader
      return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: 16 / 9 };
    }
    const list = url.searchParams.get("list");
    if (list && ID.test(list)) {
      return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`, ratio: 16 / 9 };
    }
    return null;
  }
  if (host === "youtu.be") {
    const id = path.slice(1);
    return ID.test(id)
      ? { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}`, ratio: 16 / 9 }
      : null;
  }

  // ── Vimeo ────────────────────────────────────────────────────────────────
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = /(?:^\/video\/|^\/)(\d{5,12})/.exec(path)?.[1];
    return id ? { provider: "vimeo", src: `https://player.vimeo.com/video/${id}`, ratio: 16 / 9 } : null;
  }

  // ── Google Workspace ─────────────────────────────────────────────────────
  if (host === "drive.google.com") {
    const id = /\/file\/d\/([^/]+)/.exec(path)?.[1] ?? url.searchParams.get("id");
    return id && ID.test(id)
      ? { provider: "drive", src: `https://drive.google.com/file/d/${id}/preview`, ratio: null }
      : null;
  }
  if (host === "docs.google.com") {
    const m = /^\/(document|spreadsheets|presentation|forms)\/d\/(?:e\/)?([^/]+)/.exec(path);
    if (!m) return null;
    const [, kind, id] = m;
    if (!ID.test(id)) return null;
    if (kind === "forms") {
      return { provider: "forms", src: `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`, ratio: null };
    }
    const tail = kind === "presentation" ? "embed" : "preview";
    return { provider: "docs", src: `https://docs.google.com/${kind}/d/${id}/${tail}`, ratio: kind === "presentation" ? 16 / 9 : null };
  }
  if (host === "calendar.google.com") {
    const src = url.searchParams.get("src");
    return src
      ? { provider: "calendar", src: `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(src)}`, ratio: 4 / 3 }
      : null;
  }
  if (host === "google.com" || host === "maps.google.com") {
    // Only the official "embed a map" URL — a plain maps link can't be framed anyway
    if (path.startsWith("/maps/embed")) {
      const pb = url.searchParams.get("pb");
      return pb
        ? { provider: "maps", src: `https://www.google.com/maps/embed?pb=${encodeURIComponent(pb)}`, ratio: 16 / 10 }
        : null;
    }
    return null;
  }

  return null;
}

/** The human explanation shown when an address is refused. */
export const EMBED_HELP =
  "Paste a share link from YouTube, Vimeo, Google Drive, Docs, Sheets, Slides, Forms, " +
  "Maps or Calendar. Other hosts are not embedded, for the organization's safety.";
