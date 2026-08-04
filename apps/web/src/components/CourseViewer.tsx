"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { versionLabel, type AuthoredBlock, type Classification, type DownloadTicket, type LearningItem } from "@vault/shared";
import { ApiError, authFetch } from "@/lib/auth-client";
import { courses, downloadBlob } from "@/lib/courses-client";
import { fetchAndDecrypt } from "@/lib/storage-crypto";
import { CourseExam } from "./CourseExam";
import { AuthoredBlockView, DocumentPages, paginate } from "./DocumentView";
import { PdfView } from "./PdfView";
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


// Authored documents render through the shared renderer in ./DocumentView — the same code
// path the Studio previews with, so the author and the reader always see the same page.
export { AuthoredBlockView, paginate };

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
  const [src, setSrc] = useState<string | null>(null); // external link URL only
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [authored, setAuthored] = useState<AuthoredBlock[] | null>(null);
  // Uploaded file: rendered natively by kind (pdf via PDF.js, image/media via tags)
  const [file, setFile] = useState<{ kind: "pdf" | "image" | "audio" | "video" | "text"; url: string; buf: ArrayBuffer; text?: string } | null>(null);
  const [unpreviewable, setUnpreviewable] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Storage unreachable is NOT a load error — the document exists and is safe, we just
  // cannot fetch it right now (docs/structure.md §9.8). It gets its own state so the
  // viewer can say that in those words instead of showing a red failure.
  const [storageDown, setStorageDown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [showCover, setShowCover] = useState(true);
  const [page, setPage] = useState(0);
  const locked = item.missingPrerequisites.length > 0;
  const completed = item.status === "COMPLETED";
  const pages = authored ? paginate(authored) : [];
  // An exam is delivered question by question by its own routes — there is no document to
  // fetch, and it completes by being passed rather than by being declared done.
  const isExam = item.kind === "EXAM";

  /** Which native renderer handles this content type, or null if none can. */
  function renderKind(type: string): "pdf" | "image" | "audio" | "video" | "text" | null {
    if (type === "application/pdf") return "pdf";
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("audio/")) return "audio";
    if (type.startsWith("video/")) return "video";
    if (type === "text/plain") return "text";
    return null;
  }

  // Load the content: files render natively by kind (PDF via PDF.js so it never depends
  // on the browser's flaky iframe PDF viewer); links embed; authored → block array.
  useEffect(() => {
    let blobUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setAuthored(null);
    setExternalUrl(null);
    setFile(null);
    setUnpreviewable(null);
    setLoadError(null);
    setStorageDown(null);
    if (isExam) return; // the exam runner fetches its own paper
    (async () => {
      try {
        const res = await authFetch(`/courses/${item.code}/content`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          // 409 is the organization's storage being unreachable or not yet reconnected.
          // The document is there; we cannot reach it. Say exactly that.
          if (res.status === 409) {
            if (!cancelled) setStorageDown(err.error ?? "");
            return;
          }
          throw new Error(err.error ?? "Could not load the content");
        }
        const type = (res.headers.get("content-type") ?? "").split(";")[0];
        if (type.includes("application/json")) {
          const data = (await res.json()) as {
            url?: string;
            authored?: AuthoredBlock[];
            downloadUrl?: string;
          };
          if (cancelled) return;
          if (data.authored) setAuthored(data.authored);
          else if (data.downloadUrl) {
            // An object in the organization's own storage: fetch the ciphertext straight
            // from their hardware and decrypt it here. Nothing routes through our API.
            const bytes = await fetchAndDecrypt(data as unknown as DownloadTicket);
            if (cancelled) return;
            const mime = (data as unknown as DownloadTicket).mime || "application/octet-stream";
            const kind = renderKind(mime);
            if (!kind) {
              setUnpreviewable(mime);
              return;
            }
            const buf = bytes.slice().buffer as ArrayBuffer;
            blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
            setFile({
              kind,
              url: blobUrl,
              buf,
              text: kind === "text" ? new TextDecoder().decode(bytes) : undefined,
            });
          } else if (data.url) {
            setExternalUrl(data.url);
            setSrc(data.url);
          }
        } else {
          const buf = await res.arrayBuffer();
          if (cancelled) return;
          const kind =
            type === "application/pdf"
              ? "pdf"
              : type.startsWith("image/")
                ? "image"
                : type.startsWith("audio/")
                  ? "audio"
                  : type.startsWith("video/")
                    ? "video"
                    : type === "text/plain"
                      ? "text"
                      : null;
          if (!kind) {
            // Not a browser-renderable type (e.g. an Office doc) — offer a download
            setUnpreviewable(type || "this file type");
            return;
          }
          blobUrl = URL.createObjectURL(new Blob([buf], { type }));
          setFile({
            kind,
            url: blobUrl,
            buf,
            text: kind === "text" ? new TextDecoder().decode(buf) : undefined,
          });
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load");
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [item.code, isExam]);

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
          <span className="doc-ver">{versionLabel(item.version)}</span>
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
                    <dd>{versionLabel(item.version)}</dd>
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
              {/* Storage unreachable — a waiting state, not a failure. The document is
                  intact on the organization's own storage; we cannot reach it right now
                  (docs/structure.md §9.8). Never dressed up as data loss. */}
              {storageDown && (
                <div className="viewer-unpreviewable">
                  <span className="viewer-unprev-icon" aria-hidden>
                    🔌
                  </span>
                  <p>
                    <strong>This document is waiting on your storage.</strong>
                  </p>
                  <p className="muted">
                    It is safe and unchanged on your organization&rsquo;s own storage —
                    Knowledge Vault just cannot reach it at the moment. It will open
                    normally as soon as the connection is restored. Your organization&rsquo;s
                    owners have been told.
                  </p>
                  {storageDown && <p className="muted viewer-note">{storageDown}</p>}
                </div>
              )}
              {!isExam &&
                !src &&
                !authored &&
                !file &&
                !unpreviewable &&
                !loadError &&
                !storageDown && (
                  <div className="skeleton" style={{ position: "absolute", inset: 0 }} />
                )}
              {/* MCQ exam: sat in place, marked by the server */}
              {isExam && <CourseExam code={item.code} onCompleted={onChanged} />}
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
              {/* Studio-authored: render natively, paginated — pages turn with the
                  transition the author chose on each page break. */}
              {authored && <DocumentPages pages={pages} page={page} onPage={setPage} />}
              {/* Uploaded file: rendered natively by kind (never the flaky iframe PDF) */}
              {file?.kind === "pdf" && <PdfView data={file.buf} />}
              {file?.kind === "image" && (
                <div className="viewer-media-wrap">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="viewer-media-img" src={file.url} alt={item.title} />
                </div>
              )}
              {file?.kind === "video" && (
                <div className="viewer-media-wrap">
                  <video className="viewer-media-el" controls src={file.url} />
                </div>
              )}
              {file?.kind === "audio" && (
                <div className="viewer-media-wrap">
                  <audio className="viewer-media-el" controls src={file.url} />
                </div>
              )}
              {file?.kind === "text" && <pre className="viewer-text">{file.text}</pre>}
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
                {item.code} · {versionLabel(item.version)} · {publishedDate}
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
          {/* An exam has no "mark complete" — passing it is what completes it. */}
          {!completed && !readOnly && !isExam && (
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
