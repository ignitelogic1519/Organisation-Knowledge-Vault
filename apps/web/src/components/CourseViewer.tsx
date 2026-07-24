"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthoredBlock, Classification, LearningItem } from "@vault/shared";
import { ApiError, authFetch } from "@/lib/auth-client";
import { courses, downloadBlob } from "@/lib/courses-client";
import { useDialogs } from "./dialogs";

// The in-app course viewer: content opens INSIDE the app — no second tab. Every document
// is wrapped in the organization's standard frame (cover with org / title / version /
// date / creator / classification; a scope & description page; a header & footer on every
// view). Uploaded files stream into an inline frame (NOT sandboxed — same-origin blobs,
// so the browser's PDF viewer works); external links embed sandboxed with a fallback;
// Studio-authored documents render natively. Downloads are offered only when the owner
// enabled them.

type ViewerItem = Pick<
  LearningItem,
  | "code"
  | "title"
  | "kind"
  | "version"
  | "status"
  | "mandatory"
  | "missingPrerequisites"
  | "prerequisiteCodes"
  | "viaRoleName"
  | "description"
  | "scope"
  | "classification"
  | "allowDownload"
  | "publishedAt"
  | "creatorName"
>;

const CLASS_LABEL: Record<Classification, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};

/** Types the browser renders safely inline — everything else is download-only. */
const SAFE_INLINE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "text/plain",
]);

/** Minimal HTML whitelist for authored rich text (defence-in-depth on top of the API). */
function sanitize(html: string): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "BR", "UL", "OL", "LI", "P", "H1", "H2", "H3", "A", "CODE", "SPAN"]);
  tpl.content.querySelectorAll("*").forEach((el) => {
    if (!allowed.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      const isSafeHref =
        el.tagName === "A" && attr.name === "href" && /^https?:\/\//i.test(attr.value);
      if (!isSafeHref) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noreferrer");
    }
  });
  return tpl.innerHTML;
}

export function AuthoredBlockView({ block }: { block: AuthoredBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level ?? 2}`) as "h1" | "h2" | "h3";
      return <Tag dangerouslySetInnerHTML={{ __html: sanitize(block.html ?? "") }} />;
    }
    case "paragraph":
      return <p dangerouslySetInnerHTML={{ __html: sanitize(block.html ?? "") }} />;
    case "divider":
      return <hr className="doc-divider" />;
    case "card":
      return (
        <div className="doc-card">
          {block.title && <strong>{block.title}</strong>}
          <div dangerouslySetInnerHTML={{ __html: sanitize(block.html ?? "") }} />
        </div>
      );
    case "checklist":
      return (
        <ul className="doc-checklist">
          {(block.items ?? []).map((it, i) => (
            <li key={i}>
              <span className="doc-check" aria-hidden>
                ☐
              </span>
              {it}
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="doc-table-wrap">
          <table className="doc-table">
            <tbody>
              {(block.rows ?? []).map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    r === 0 ? <th key={c}>{cell}</th> : <td key={c}>{cell}</td>,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "image":
      return block.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="doc-image" src={block.url} alt={block.title ?? ""} />
      ) : null;
    case "media":
      return block.url ? (
        block.mediaKind === "audio" ? (
          <audio className="doc-media" controls src={block.url} />
        ) : (
          <video className="doc-media" controls src={block.url} />
        )
      ) : null;
    default:
      return null; // pagebreak is handled by the pager, not rendered inline
  }
}

/** Split authored blocks into pages on every pagebreak. */
export function paginate(blocks: AuthoredBlock[]): AuthoredBlock[][] {
  const pages: AuthoredBlock[][] = [[]];
  for (const b of blocks) {
    if (b.type === "pagebreak") pages.push([]);
    else pages[pages.length - 1].push(b);
  }
  return pages.filter((p) => p.length > 0);
}

function Stars({
  value,
  onChange,
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
}) {
  return (
    <span className="stars" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="star"
          data-on={value !== null && n <= value}
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange?.(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export function CourseViewer({
  item,
  orgName,
  onClose,
  onChanged,
  onOpenRelated,
  readOnly = false,
}: {
  item: ViewerItem;
  orgName: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenRelated?: (code: string) => void;
  /** Preview only — hides Mark-complete and Rate & review (e.g. reviewing a draft). */
  readOnly?: boolean;
}) {
  const dialogs = useDialogs();
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [authored, setAuthored] = useState<AuthoredBlock[] | null>(null);
  const [unpreviewable, setUnpreviewable] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [showCover, setShowCover] = useState(true);
  const [page, setPage] = useState(0);
  const locked = item.missingPrerequisites.length > 0;
  const completed = item.status === "COMPLETED";
  const pages = authored ? paginate(authored) : [];

  // Load the content: files → blob URL, links → embed URL, authored → block array
  useEffect(() => {
    let blobUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setAuthored(null);
    setExternalUrl(null);
    setUnpreviewable(null);
    setLoadError(null);
    (async () => {
      try {
        const res = await authFetch(`/courses/${item.code}/content`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Could not load the content");
        }
        const type = res.headers.get("content-type") ?? "";
        if (type.includes("application/json")) {
          const data = (await res.json()) as { url?: string; authored?: AuthoredBlock[] };
          if (cancelled) return;
          if (data.authored) setAuthored(data.authored);
          else if (data.url) {
            setExternalUrl(data.url);
            setSrc(data.url);
          }
        } else {
          const blob = await res.blob();
          // Only render types the browser shows safely inline; a blob: URL is
          // same-origin, so an HTML/SVG blob would execute in our context — those are
          // offered as a download instead of framed.
          if (SAFE_INLINE.has((blob.type || "").split(";")[0])) {
            blobUrl = URL.createObjectURL(blob);
            if (!cancelled) setSrc(blobUrl);
          } else if (!cancelled) {
            setUnpreviewable(blob.type || "this file type");
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load");
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [item.code]);

  useEffect(() => {
    if (!completed) return;
    courses
      .reviews(item.code)
      .then((r) => {
        if (r.mine) {
          setRating(r.mine.rating);
          setComment(r.mine.comment ?? "");
        }
      })
      .catch(() => undefined);
  }, [item.code, completed]);

  const toggleFullscreen = useCallback(() => {
    const el = frameWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => undefined);
  }, []);

  const download = useCallback(async () => {
    try {
      const res = await authFetch(`/courses/${item.code}/content?download=1`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Download failed");
      }
      const cd = res.headers.get("content-disposition") ?? "";
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? `${item.code}`;
      downloadBlob(await res.blob(), name);
    } catch (e) {
      dialogs.toast(e instanceof Error ? e.message : "Download failed", "danger");
    }
  }, [item.code, dialogs]);

  const publishedDate = item.publishedAt.slice(0, 10);

  return (
    <div className="viewer-layer" role="presentation">
      <div className="viewer glass-strong" role="dialog" aria-modal="true" aria-label={item.title}>
        <div className="viewer-head">
          <div className="viewer-title">
            <h3>{item.title}</h3>
            <span className="chip">{item.code}</span>
            <span className={`badge class-badge class-${item.classification}`}>
              {CLASS_LABEL[item.classification]}
            </span>
            <span className="badge">{item.mandatory ? "mandatory" : "opt-in"}</span>
            {completed && <span className="badge badge-ok">completed</span>}
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Standard header bar — org, classification, version on every document */}
        <div className={`doc-headerbar class-strip-${item.classification}`}>
          <span className="doc-org">{orgName}</span>
          <span className="doc-class">{CLASS_LABEL[item.classification]}</span>
          <span className="doc-ver">v{item.version}</span>
        </div>

        <div className="viewer-frame-wrap" ref={frameWrapRef}>
          {/* Auto-generated cover + scope pages (the "first two pages" standard) */}
          {showCover && (
            <div className="doc-cover-pages">
              <section className="doc-page doc-cover">
                <span className={`doc-cover-class class-badge class-${item.classification}`}>
                  {CLASS_LABEL[item.classification]}
                </span>
                <span className="doc-cover-org">{orgName}</span>
                <h1 className="doc-cover-title">{item.title}</h1>
                <dl className="doc-cover-meta">
                  <div>
                    <dt>Published</dt>
                    <dd>{publishedDate}</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{item.version}</dd>
                  </div>
                  <div>
                    <dt>Author</dt>
                    <dd>{item.creatorName}</dd>
                  </div>
                  <div>
                    <dt>Reference</dt>
                    <dd>{item.code}</dd>
                  </div>
                </dl>
              </section>
              <section className="doc-page doc-scope-page">
                <h2>Description &amp; scope</h2>
                <h3>Description</h3>
                <p>{item.description ?? "—"}</p>
                <h3>Scope</h3>
                <p>{item.scope ?? "—"}</p>
              </section>
              <button className="btn btn-quiet btn-small doc-cover-skip" onClick={() => setShowCover(false)}>
                Skip to content ↓
              </button>
            </div>
          )}

          {!showCover && (
            <>
              {loadError && <p className="form-error viewer-note">{loadError}</p>}
              {!src && !authored && !unpreviewable && !loadError && (
                <div className="skeleton" style={{ position: "absolute", inset: 0 }} />
              )}
              {/* Type that can't render safely inline (e.g. an Office doc) — offer download */}
              {unpreviewable && (
                <div className="viewer-unpreviewable">
                  <span className="viewer-unprev-icon" aria-hidden>
                    ⤓
                  </span>
                  <p>This file type can&apos;t be previewed in the browser.</p>
                  {item.allowDownload ? (
                    <button className="btn btn-primary btn-small" onClick={download}>
                      ⬇ Download to open
                    </button>
                  ) : (
                    <p className="auth-sub">
                      The owner hasn&apos;t enabled downloads for this document.
                    </p>
                  )}
                </div>
              )}
              {/* Studio-authored: render natively, paginated (books turn page by page) */}
              {authored && (
                <div className="doc-authored">
                  <article className="doc-sheet">
                    {(pages[page] ?? []).map((b, i) => (
                      <AuthoredBlockView key={i} block={b} />
                    ))}
                  </article>
                  {pages.length > 1 && (
                    <div className="doc-pager glass-strong">
                      <button
                        className="btn btn-quiet btn-small"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        ← Prev
                      </button>
                      <span className="auth-sub">
                        Page {page + 1} of {pages.length}
                      </span>
                      <button
                        className="btn btn-quiet btn-small"
                        disabled={page >= pages.length - 1}
                        onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Uploaded file: same-origin blob, NOT sandboxed → PDF viewer works */}
              {src && !externalUrl && (
                <iframe className="viewer-frame" src={src} title={item.title} allowFullScreen />
              )}
              {/* External link: sandboxed, with a fallback when the host refuses embedding */}
              {src && externalUrl && (
                <>
                  <iframe
                    className="viewer-frame"
                    src={src}
                    title={item.title}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    allowFullScreen
                  />
                  <p className="viewer-note auth-sub">
                    External content — if the frame stays blank the host refuses embedding:{" "}
                    <a href={externalUrl} target="_blank" rel="noreferrer">
                      open it in a new tab ↗
                    </a>
                  </p>
                </>
              )}
            </>
          )}

          {/* Standard footer on the framed content */}
          {!showCover && (
            <div className={`doc-footerbar class-strip-${item.classification}`}>
              <span>
                {orgName} · {CLASS_LABEL[item.classification]}
              </span>
              <span>
                {item.code} · v{item.version} · {publishedDate}
              </span>
            </div>
          )}
        </div>

        {item.prerequisiteCodes.length > 0 && (
          <div className="viewer-related">
            <span className="auth-sub">Related — required first:</span>
            {item.prerequisiteCodes.map((code) => (
              <button
                key={code}
                className="chip viewer-related-chip"
                data-missing={item.missingPrerequisites.includes(code)}
                title={
                  item.missingPrerequisites.includes(code)
                    ? "Not completed yet — open it"
                    : "Completed — open it again"
                }
                onClick={() => onOpenRelated?.(code)}
              >
                {code}
              </button>
            ))}
          </div>
        )}

        <div className="viewer-actions">
          {!showCover && (
            <button className="btn btn-quiet btn-small" onClick={() => setShowCover(true)}>
              ↑ Cover
            </button>
          )}
          <button className="btn btn-quiet btn-small" onClick={toggleFullscreen}>
            ⛶ Fullscreen
          </button>
          {item.allowDownload && !authored && (
            <button className="btn btn-quiet btn-small" onClick={download}>
              ⬇ Download
            </button>
          )}
          {externalUrl && (
            <a className="btn btn-quiet btn-small" href={externalUrl} target="_blank" rel="noreferrer">
              Open externally ↗
            </a>
          )}
          {completed && !readOnly && (
            <button className="btn btn-quiet btn-small" onClick={() => setReviewOpen((v) => !v)}>
              {reviewOpen ? "Hide review" : "★ Rate & review"}
            </button>
          )}
          {!completed && !readOnly && (
            <button
              className="btn btn-primary btn-small"
              disabled={locked || busy}
              title={
                locked ? `Prerequisites pending: ${item.missingPrerequisites.join(", ")}` : undefined
              }
              onClick={async () => {
                setBusy(true);
                try {
                  await courses.complete(item.code);
                  dialogs.toast(`"${item.title}" marked complete.`, "success");
                  onChanged();
                  setReviewOpen(true);
                } catch (e) {
                  dialogs.toast(e instanceof ApiError ? e.message : "Failed", "danger");
                } finally {
                  setBusy(false);
                }
              }}
            >
              ✓ Mark complete
            </button>
          )}
        </div>

        {reviewOpen && completed && (
          <form
            className="viewer-review"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await courses.review(item.code, { rating, comment: comment || undefined });
                dialogs.toast("Thanks — your review is saved.", "success");
                setReviewOpen(false);
                onChanged();
              } catch (err) {
                dialogs.toast(
                  err instanceof ApiError ? err.message : "Could not save the review",
                  "danger",
                );
              }
            }}
          >
            <div className="viewer-review-row">
              <span className="auth-sub">Your rating (optional)</span>
              <Stars value={rating} onChange={setRating} />
            </div>
            <label className="field">
              <span>Comment for other members (optional)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="What should others know before opening this?"
              />
            </label>
            <div className="sheet-actions">
              <button className="btn btn-primary btn-small">Save review</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export { Stars };
