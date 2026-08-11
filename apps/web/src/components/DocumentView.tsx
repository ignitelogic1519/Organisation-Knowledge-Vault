"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  RICH_TEXT_TAG_SET,
  isSafeHref,
  resolveEmbed,
  sanitizeStyleAttribute,
  type AuthoredBlock,
  type BlockStyle,
  type DocumentTheme,
  type EmbedOptions,
  type MediaOptions,
  type TableCell,
} from "@vault/shared";
import { useReaderZoom } from "@/lib/reader-zoom";

// The document renderer — one implementation shared by the in-app viewer, the Studio's
// live preview and its present mode, so what an author sees while writing is exactly what
// a reader gets. Blocks arrive already validated by the API; everything visual is driven
// by the typed `style` object, never by author-supplied CSS.

/** Type families a reader's browser always has — no webfont download, no layout shift. */
export const FONT_STACKS: Record<string, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
  display: "'Avenir Next', 'Trebuchet MS', 'Segoe UI', sans-serif",
  hand: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive",
};

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * Minimal HTML whitelist for authored rich text (defence-in-depth on top of the API's
 * server-side sanitizer). Keeps the inline formatting the Studio produces — colour,
 * highlight, size, alignment — and drops everything else.
 */
export function sanitize(html: string): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("*").forEach((el) => {
    if (!RICH_TEXT_TAG_SET.has(el.tagName.toLowerCase())) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === "style") {
        const kept = sanitizeStyleAttribute(attr.value);
        if (kept) el.setAttribute("style", kept);
        else el.removeAttribute("style");
        continue;
      }
      const safeLink = el.tagName === "A" && attr.name === "href" && isSafeHref(attr.value);
      if (!safeLink) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noreferrer noopener");
    }
  });
  return tpl.innerHTML;
}

/** Turn a block's typed style into inline CSS — the only place style is materialized. */
export function blockStyleToCss(style?: BlockStyle): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  if (style.align) css.textAlign = style.align;
  if (style.color) css.color = style.color;
  if (style.background) css.background = style.background;
  if (style.font) css.fontFamily = FONT_STACKS[style.font] ?? undefined;
  // An author's explicit size is absolute at 100%, but it still has to follow the reader's
  // zoom — a document with one hand-sized heading in it must not have that heading stay
  // put while everything around it grows. `--doc-zoom` is 1 wherever nobody set it (the
  // Studio canvas, the exported preview), so this is the plain px size there.
  if (style.fontSize) css.fontSize = `calc(${style.fontSize}px * var(--doc-zoom, 1))`;
  if (style.lineHeight) css.lineHeight = style.lineHeight;
  if (style.letterSpacing) css.letterSpacing = `${style.letterSpacing}px`;
  if (style.uppercase) css.textTransform = "uppercase";
  if (style.padding != null) css.padding = `${style.padding}px`;
  if (style.radius != null) css.borderRadius = `${style.radius}px`;
  if (style.border) css.border = `1px solid ${style.accent ?? "var(--border)"}`;
  if (style.shadow) css.boxShadow = "0 10px 28px rgba(10, 14, 30, 0.14)";
  if (style.spaceAfter != null) css.marginBottom = `${style.spaceAfter}px`;
  if (style.width != null && style.width < 100) {
    css.width = `${style.width}%`;
    const float = style.float ?? "center";
    css.marginLeft = float === "left" ? 0 : "auto";
    css.marginRight = float === "right" ? 0 : "auto";
  }
  return css;
}

/** Style objects can't hold custom properties through the typed API — merge them here. */
function withAccent(css: CSSProperties, accent?: string): CSSProperties {
  return accent ? ({ ...css, ["--doc-accent"]: accent } as CSSProperties) : css;
}

/** The v1 `rows` shape and the v2 `cells` shape, normalized to one grid. */
export function tableGrid(block: AuthoredBlock): TableCell[][] {
  if (block.cells?.length) return block.cells as TableCell[][];
  return (block.rows ?? []).map((row) => row.map((text) => ({ text })));
}

/** The v1 `items` shape and the v2 `list` shape, normalized. */
export function checklistEntries(block: AuthoredBlock) {
  if (block.list?.length) return block.list;
  return (block.items ?? []).map((text) => ({ text, checked: false, hint: undefined }));
}

function cellCss(cell: TableCell): CSSProperties {
  return {
    fontWeight: cell.bold ? 700 : undefined,
    fontStyle: cell.italic ? "italic" : undefined,
    textAlign: cell.align,
    color: cell.color,
    background: cell.background,
  };
}

// ── Media player ─────────────────────────────────────────────────────────────

/**
 * The document's audio/video player. Beyond the browser default it adds the controls the
 * organization's material actually needs: a speed selector, a quality ladder, a clip
 * window, and a **non-skippable** mode that lets the reader rewind but never jump past the
 * furthest point they have genuinely watched.
 */
export function DocumentMedia({
  url,
  kind,
  options,
  caption,
  style,
}: {
  url: string;
  kind: "audio" | "video";
  options?: MediaOptions;
  caption?: string;
  style?: BlockStyle;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const sources = options?.sources?.length ? options.sources : [{ label: "Source", url }];
  const [quality, setQuality] = useState(0);
  const [speed, setSpeed] = useState(options?.defaultSpeed ?? 1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [finished, setFinished] = useState(false);
  const watched = useRef(0); // furthest point genuinely reached, in seconds
  const skippable = options?.skippable !== false;
  const speedControl = options?.speedControl !== false;
  const activeUrl = sources[Math.min(quality, sources.length - 1)]?.url ?? url;

  // Keep the element's playback rate in step with the selector
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed, activeUrl]);

  // Switching quality must not lose the reader's place
  const switchQuality = (index: number) => {
    const el = ref.current;
    const at = el?.currentTime ?? 0;
    const wasPlaying = el ? !el.paused : false;
    setQuality(index);
    requestAnimationFrame(() => {
      const next = ref.current;
      if (!next) return;
      next.currentTime = at;
      next.playbackRate = speed;
      if (wasPlaying) void next.play().catch(() => undefined);
    });
  };

  const onTimeUpdate = () => {
    const el = ref.current;
    if (!el) return;
    const start = options?.startAt ?? 0;
    if (el.currentTime < start) el.currentTime = start;
    // Non-skippable: allow rewinding freely, refuse any jump beyond what was watched
    if (!skippable && el.currentTime > watched.current + 1.2) {
      el.currentTime = watched.current;
    } else if (el.currentTime > watched.current) {
      watched.current = el.currentTime;
    }
    if (options?.endAt && el.currentTime >= options.endAt) {
      el.pause();
      setFinished(true);
    }
    setProgress(el.currentTime);
  };

  const Tag = (kind === "audio" ? "audio" : "video") as "video";
  const pct = duration ? Math.min(100, (progress / duration) * 100) : 0;
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <figure className="doc-media-block" style={blockStyleToCss(style)} data-kind={kind}>
      <div className="doc-media-shell">
        <Tag
          ref={ref}
          className={`doc-media doc-media-${kind}`}
          src={activeUrl}
          poster={kind === "video" ? options?.poster : undefined}
          controls={skippable}
          controlsList={options?.download ? undefined : "nodownload"}
          autoPlay={options?.autoplay}
          loop={options?.loop}
          muted={options?.muted}
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setDuration(el.duration || 0);
            el.playbackRate = speed;
            if (options?.startAt) el.currentTime = options.startAt;
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onSeeking={() => {
            const el = ref.current;
            if (!skippable && el && el.currentTime > watched.current + 1.2) {
              el.currentTime = watched.current;
            }
          }}
          onTimeUpdate={onTimeUpdate}
          onEnded={() => {
            setPlaying(false);
            setFinished(true);
          }}
        >
          {options?.captionsUrl && (
            <track kind="captions" src={options.captionsUrl} default label="Captions" />
          )}
        </Tag>

        {/* Non-skippable material gets our own transport: play/pause and a read-only
            progress bar, so there is no seek handle to drag past the content. */}
        {!skippable && (
          <div className="doc-media-guard">
            <button
              type="button"
              className="doc-media-play"
              aria-label={playing ? "Pause" : "Play"}
              onClick={() => {
                const el = ref.current;
                if (!el) return;
                if (el.paused) void el.play().catch(() => undefined);
                else el.pause();
              }}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <div className="doc-media-track" role="presentation">
              <span className="doc-media-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="doc-media-time">
              {fmt(progress)} / {fmt(duration || 0)}
            </span>
            <span className="badge doc-media-lock" title="This recording must be watched in full">
              🔒 no skipping
            </span>
          </div>
        )}
      </div>

      <div className="doc-media-bar">
        {sources.length > 1 && (
          <label className="doc-media-control">
            <span>Quality</span>
            <select value={quality} onChange={(e) => switchQuality(Number(e.target.value))}>
              {sources.map((s, i) => (
                <option key={`${s.label}-${i}`} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {speedControl && (
          <label className="doc-media-control">
            <span>Speed</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {PLAYBACK_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        )}
        {options?.trackCompletion && (
          <span className={`badge ${finished ? "badge-ok" : ""}`}>
            {finished ? "✓ watched in full" : "must be watched in full"}
          </span>
        )}
      </div>
      {caption && <figcaption className="doc-caption">{caption}</figcaption>}
    </figure>
  );
}

// ── Embeds ───────────────────────────────────────────────────────────────────

/**
 * Framed content from an allow-listed host. The address is resolved through the shared
 * allowlist (which rebuilds it from its parsed parts) and the frame is sandboxed, so a
 * document can carry a training video or a form without carrying a script into our origin.
 */
export function DocumentEmbed({
  url,
  options,
  caption,
  style,
}: {
  url: string;
  options?: EmbedOptions;
  caption?: string;
  style?: BlockStyle;
}) {
  const resolved = resolveEmbed(url);
  if (!resolved) return null;
  const ratio = resolved.ratio;
  return (
    <figure className="doc-embed" style={blockStyleToCss(style)}>
      <div
        className="doc-embed-frame"
        style={
          ratio
            ? { aspectRatio: `${ratio}` }
            : { height: `${options?.height ?? 480}px` }
        }
      >
        <iframe
          src={resolved.src}
          title={caption || `${resolved.provider} embed`}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
        />
      </div>
      {(caption || options?.showSource) && (
        <figcaption className="doc-caption">
          {caption}
          {options?.showSource && (
            <>
              {caption ? " · " : ""}
              <a href={resolved.src} target="_blank" rel="noreferrer noopener">
                open the source ↗
              </a>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** Collapsible panels — the reader expands what they need. */
function DocumentAccordion({ block, css }: { block: AuthoredBlock; css: CSSProperties }) {
  return (
    <div className="doc-accordion" style={css}>
      {(block.panels ?? []).map((panel, i) => (
        <details key={i} className="doc-panel" open={panel.open}>
          <summary>
            <span className="doc-panel-caret" aria-hidden>
              ▸
            </span>
            {panel.title || `Section ${i + 1}`}
          </summary>
          <div
            className="doc-panel-body"
            dangerouslySetInnerHTML={{ __html: sanitize(panel.html ?? "") }}
          />
        </details>
      ))}
    </div>
  );
}

/** Strip tags from authored HTML so a heading can become a contents entry. */
function headingText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]*>/g, "").trim();
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return (tpl.content.textContent ?? "").trim();
}

/** A slug stable enough to anchor to, and unique per document position. */
export function headingId(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `h-${index}${base ? `-${base}` : ""}`;
}

/** Contents built from the document's own headings, with anchors that scroll. */
function DocumentToc({
  block,
  headings,
  css,
}: {
  block: AuthoredBlock;
  headings: { id: string; text: string; level: number }[];
  css: CSSProperties;
}) {
  const depth = block.depth ?? 3;
  const listed = headings.filter((h) => h.level <= depth);
  return (
    <nav className="doc-toc" style={css} aria-label={block.title || "Contents"}>
      <h3>{block.title || "Contents"}</h3>
      {listed.length === 0 ? (
        <p className="auth-sub">Add headings to this document and they will appear here.</p>
      ) : (
        <ol>
          {listed.map((h) => (
            <li key={h.id} data-level={h.level}>
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

// ── Blocks ───────────────────────────────────────────────────────────────────

/** Headings the current page's contents block can point at. */
const HeadingContext = createContext<{ id: string; text: string; level: number }[]>([]);

export function AuthoredBlockView({ block, index = 0 }: { block: AuthoredBlock; index?: number }) {
  const css = withAccent(blockStyleToCss(block.style), block.style?.accent);
  const animation = block.style?.animation && block.style.animation !== "none"
    ? block.style.animation
    : undefined;
  const wrap = (node: React.ReactNode) =>
    animation ? (
      <RevealBlock animation={animation}>{node}</RevealBlock>
    ) : (
      <>{node}</>
    );

  switch (block.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, block.level ?? 2));
      const Tag = `h${level}` as "h1";
      return wrap(
        <Tag
          className="doc-heading"
          id={headingId(headingText(block.html ?? ""), index)}
          style={css}
          dangerouslySetInnerHTML={{ __html: sanitize(block.html ?? "") }}
        />,
      );
    }
    case "paragraph":
      return wrap(
        <p className="doc-paragraph" style={css} dangerouslySetInnerHTML={{ __html: sanitize(block.html ?? "") }} />,
      );
    case "divider":
      return <hr className="doc-divider" style={css} />;
    case "spacer":
      return <div className="doc-spacer" style={{ height: `${block.size ?? 32}px` }} aria-hidden />;
    case "card":
      return wrap(
        <div className={`doc-card doc-tone-${block.variant ?? "neutral"}`} style={css}>
          {block.title && <strong className="doc-card-title">{block.title}</strong>}
          <div dangerouslySetInnerHTML={{ __html: sanitize(block.html ?? "") }} />
        </div>,
      );
    case "quote":
      return wrap(
        <figure className={`doc-quote doc-tone-${block.variant ?? "accent"}`} style={css}>
          <blockquote dangerouslySetInnerHTML={{ __html: sanitize(block.html ?? "") }} />
          {block.attribution && <figcaption>— {block.attribution}</figcaption>}
        </figure>,
      );
    case "code":
      return wrap(
        <div className="doc-code" style={css}>
          {block.language && <span className="doc-code-lang">{block.language}</span>}
          <pre>
            <code>{block.html ?? ""}</code>
          </pre>
        </div>,
      );
    case "button":
      return wrap(
        <div className="doc-button-row" style={{ textAlign: block.style?.align ?? "left" }}>
          {block.url ? (
            <a
              className={`doc-button doc-tone-${block.variant ?? "accent"}`}
              href={block.url}
              target="_blank"
              rel="noreferrer noopener"
              style={css}
            >
              {block.title || "Open link"}
            </a>
          ) : (
            <span className="doc-button doc-button-empty">{block.title || "Link not set"}</span>
          )}
        </div>,
      );
    case "checklist": {
      const entries = checklistEntries(block);
      return wrap(
        <ul className="doc-checklist" style={css}>
          {entries.map((it, i) => (
            <li key={i} data-checked={!!it.checked}>
              <span className="doc-check" aria-hidden>
                {it.checked ? "☑" : "☐"}
              </span>
              <span>
                {it.text}
                {it.hint && <em className="doc-check-hint">{it.hint}</em>}
              </span>
            </li>
          ))}
        </ul>,
      );
    }
    case "columns":
      return wrap(
        <div className="doc-columns" style={css} data-count={block.columns?.length ?? 0}>
          {(block.columns ?? []).map((col, i) => (
            <section key={i} className="doc-column" style={col.width ? { flex: `0 0 ${col.width}%` } : undefined}>
              {col.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="doc-column-image" src={col.url} alt={col.title ?? ""} />
              )}
              {col.title && <h3>{col.title}</h3>}
              <div dangerouslySetInnerHTML={{ __html: sanitize(col.html ?? "") }} />
            </section>
          ))}
        </div>,
      );
    case "table": {
      const grid = tableGrid(block);
      const opts = block.table ?? {};
      const headerRow = opts.headerRow !== false;
      return wrap(
        <figure className="doc-table-wrap" style={css}>
          <table
            className="doc-table"
            data-borders={opts.borders ?? "all"}
            data-striped={!!opts.striped}
            data-compact={!!opts.compact}
            data-sticky={!!opts.stickyHeader}
          >
            {opts.columnWidths?.length ? (
              <colgroup>
                {grid[0]?.map((_, c) => (
                  <col key={c} style={opts.columnWidths?.[c] ? { width: `${opts.columnWidths[c]}%` } : undefined} />
                ))}
              </colgroup>
            ) : null}
            <tbody>
              {grid.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => {
                    const isHead = (headerRow && r === 0) || (opts.headerColumn && c === 0);
                    const Cell = isHead ? "th" : "td";
                    return (
                      <Cell
                        key={c}
                        style={cellCss(cell)}
                        colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                        rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      >
                        {cell.text}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {(opts.caption || block.caption) && (
            <figcaption className="doc-caption">{opts.caption ?? block.caption}</figcaption>
          )}
        </figure>,
      );
    }
    case "image":
      return block.url
        ? wrap(
            <figure className="doc-figure" style={{ textAlign: block.style?.float ?? block.style?.align ?? "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="doc-image" src={block.url} alt={block.title ?? block.caption ?? ""} style={css} />
              {block.caption && <figcaption className="doc-caption">{block.caption}</figcaption>}
            </figure>,
          )
        : null;
    case "media":
      return block.url
        ? wrap(
            <DocumentMedia
              url={block.url}
              kind={block.mediaKind === "audio" ? "audio" : "video"}
              options={block.media}
              caption={block.caption}
              style={block.style}
            />,
          )
        : null;
    case "embed":
      return block.url
        ? wrap(
            <DocumentEmbed url={block.url} options={block.embed} caption={block.caption} style={block.style} />,
          )
        : null;
    case "accordion":
      return wrap(<DocumentAccordion block={block} css={css} />);
    case "toc":
      return <TocSlot block={block} css={css} />;
    default:
      return null; // pagebreak is handled by the pager, not rendered inline
  }
}

/** The contents block reads the page's headings from context. */
function TocSlot({ block, css }: { block: AuthoredBlock; css: CSSProperties }) {
  const headings = useContext(HeadingContext);
  return <DocumentToc block={block} headings={headings} css={css} />;
}

/** Scroll-triggered entrance for a single block (honors reduced-motion). */
function RevealBlock({ animation, children }: { animation: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setShown(true), {
      threshold: 0.12,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="doc-anim" data-anim={animation} data-shown={shown}>
      {children}
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

export interface DocumentPage {
  blocks: AuthoredBlock[];
  /** How this page arrives when the reader turns onto it. */
  transition: string;
  label: string | null;
}

/** Split authored blocks into pages on every pagebreak, keeping each page's transition. */
export function paginate(blocks: AuthoredBlock[]): DocumentPage[] {
  const pages: DocumentPage[] = [{ blocks: [], transition: "fade", label: null }];
  for (const b of blocks) {
    if (b.type === "pagebreak") {
      pages.push({
        blocks: [],
        transition: b.transition && b.transition !== "none" ? b.transition : "none",
        label: b.pageLabel ?? null,
      });
    } else {
      pages[pages.length - 1].blocks.push(b);
    }
  }
  return pages.filter((p) => p.blocks.length > 0);
}

/**
 * A paginated document with page-turn animation and a pager. Used by the viewer, the
 * Studio preview and present mode — `page`/`onPage` make it controllable, otherwise it
 * keeps its own position.
 */
/** The document theme as CSS custom properties on the sheet. */
export function themeToCss(theme?: DocumentTheme): CSSProperties {
  if (!theme) return {};
  const css: Record<string, string> = {};
  if (theme.bodyFont) css["--doc-body-font"] = FONT_STACKS[theme.bodyFont] ?? "";
  if (theme.headingFont) css["--doc-heading-font"] = FONT_STACKS[theme.headingFont] ?? "";
  if (theme.accent) css["--doc-theme-accent"] = theme.accent;
  if (theme.paper) css["--doc-paper"] = theme.paper;
  if (theme.ink) css["--doc-ink"] = theme.ink;
  if (theme.measure) css["--doc-measure"] = `${theme.measure}rem`;
  return css as CSSProperties;
}

export function DocumentPages({
  pages,
  page,
  onPage,
  showPager = true,
  /** The reading-size pill. Off in the Studio's preview, which has its own controls. */
  showZoom = true,
  className = "",
  theme,
}: {
  pages: DocumentPage[];
  page?: number;
  onPage?: (n: number) => void;
  showPager?: boolean;
  showZoom?: boolean;
  className?: string;
  theme?: DocumentTheme;
}) {
  const [own, setOwn] = useState(0);
  const zoom = useReaderZoom(showZoom);
  const current = Math.min(page ?? own, Math.max(0, pages.length - 1));
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const go = (n: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, n));
    setDirection(next >= current ? "next" : "prev");
    if (onPage) onPage(next);
    else setOwn(next);
  };
  const active = pages[current];

  // Keyboard paging — the reader expects ← → and PageUp/PageDown to turn pages
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(current + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Headings on this page, so a contents block can link to them
  const headings = useMemo(
    () =>
      (active?.blocks ?? [])
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.type === "heading")
        .map(({ b, i }) => {
          const text = headingText(b.html ?? "");
          return { id: headingId(text, i), text: text || "Untitled section", level: b.level ?? 2 };
        }),
    [active],
  );

  if (!active) return null;
  return (
    <div
      className={`doc-authored ${className}`}
      ref={zoom.ref}
      // Type scale, not a transform: the sheet keeps its width and the lines re-wrap, so
      // a reader who has zoomed in never has to scroll sideways to finish a sentence.
      style={{ "--doc-zoom": zoom.zoom } as CSSProperties}
    >
      {showZoom && (
      <div className="reader-zoom" role="group" aria-label="Reading size">
        <button
          type="button"
          onClick={() => zoom.zoomBy(1 / 1.15)}
          aria-label="Smaller"
          title="Smaller (Ctrl −)"
        >
          −
        </button>
        <button
          type="button"
          className="reader-zoom-level"
          onClick={zoom.reset}
          title="Back to 100% (Ctrl 0)"
        >
          {zoom.percent}%
        </button>
        <button
          type="button"
          onClick={() => zoom.zoomBy(1.15)}
          aria-label="Larger"
          title="Larger (Ctrl +)"
        >
          +
        </button>
        <span className="reader-zoom-hint">Ctrl + scroll, or pinch</span>
      </div>
      )}
      <article
        className="doc-sheet doc-turn"
        key={current}
        data-transition={active.transition}
        data-density={theme?.density ?? "normal"}
        data-headings={theme?.headingStyle ?? "plain"}
        data-themed={theme ? Object.keys(theme).length > 0 : false}
        data-direction={direction}
        style={themeToCss(theme)}
      >
        <HeadingContext.Provider value={headings}>
          {active.blocks.map((b, i) => (
            <AuthoredBlockView key={i} block={b} index={i} />
          ))}
        </HeadingContext.Provider>
      </article>

      {showPager && pages.length > 1 && (
        <div className="doc-pager glass-strong">
          <button
            className="btn btn-quiet btn-small doc-pager-btn"
            disabled={current === 0}
            aria-label="Previous page"
            onClick={() => go(current - 1)}
          >
            <span aria-hidden>←</span>
            <span className="doc-pager-word">Prev</span>
          </button>
          <span className="doc-pager-label auth-sub">
            {active.label && <span className="doc-pager-name">{active.label}</span>}
            <span className="doc-pager-count">
              {current + 1}/{pages.length}
            </span>
          </span>
          <button
            className="btn btn-quiet btn-small doc-pager-btn"
            disabled={current >= pages.length - 1}
            aria-label="Next page"
            onClick={() => go(current + 1)}
          >
            <span className="doc-pager-word">Next</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Convenience: paginate + render in one call (Studio preview). */
export function DocumentBody({
  blocks,
  className,
  theme,
}: {
  blocks: AuthoredBlock[];
  className?: string;
  theme?: DocumentTheme;
}) {
  const pages = useMemo(() => paginate(blocks), [blocks]);
  return <DocumentPages pages={pages} className={className} theme={theme} showZoom={false} />;
}
