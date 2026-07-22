"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LearningItem } from "@vault/shared";
import { ApiError, authFetch } from "@/lib/auth-client";
import { courses } from "@/lib/courses-client";
import { useDialogs } from "./dialogs";

// The in-app course viewer: content opens INSIDE the app — no second tab. Files
// stream into an inline frame; external links embed when the host allows it, with a
// graceful fallback. The action bar carries everything the learner needs: mark
// complete, fullscreen, related documents (prerequisites), rating & review after
// completion, and an escape hatch to open externally.

type ViewerItem = Pick<
  LearningItem,
  | "code"
  | "title"
  | "kind"
  | "status"
  | "mandatory"
  | "missingPrerequisites"
  | "prerequisiteCodes"
  | "viaRoleName"
>;

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
  onClose,
  onChanged,
  onOpenRelated,
}: {
  item: ViewerItem;
  onClose: () => void;
  onChanged: () => void;
  /** Open a prerequisite in the viewer if it's available to the user. */
  onOpenRelated?: (code: string) => void;
}) {
  const dialogs = useDialogs();
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const locked = item.missingPrerequisites.length > 0;
  const completed = item.status === "COMPLETED";

  // Load the content into the viewer: files become blob URLs, links embed directly
  useEffect(() => {
    let blobUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/courses/${item.code}/content`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Could not load the content");
        }
        const type = res.headers.get("content-type") ?? "";
        if (type.includes("application/json")) {
          const { url } = (await res.json()) as { url?: string };
          if (!cancelled && url) {
            setExternalUrl(url);
            setSrc(url); // may be refused by the host — the fallback stays visible
          }
        } else {
          const blob = await res.blob();
          blobUrl = URL.createObjectURL(blob);
          if (!cancelled) setSrc(blobUrl);
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

  // Prefill my existing review
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

  return (
    <div className="viewer-layer" role="presentation">
      <div className="viewer glass-strong" role="dialog" aria-modal="true" aria-label={item.title}>
        <div className="viewer-head">
          <div className="viewer-title">
            <h3>{item.title}</h3>
            <span className="chip">{item.code}</span>
            <span className="badge">{item.kind.toLowerCase()}</span>
            <span className="badge">{item.mandatory ? "mandatory" : "opt-in"}</span>
            {completed && <span className="badge badge-ok">completed</span>}
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="viewer-frame-wrap" ref={frameWrapRef}>
          {loadError && <p className="form-error viewer-note">{loadError}</p>}
          {!src && !loadError && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
          {src && (
            <iframe
              className="viewer-frame"
              src={src}
              title={item.title}
              sandbox="allow-scripts allow-same-origin allow-popups"
              allowFullScreen
            />
          )}
          {externalUrl && (
            <p className="viewer-note auth-sub">
              External content — if the frame stays blank, its host refuses embedding:{" "}
              <a href={externalUrl} target="_blank" rel="noreferrer">
                open it in a new tab ↗
              </a>
            </p>
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
          <button className="btn btn-quiet btn-small" onClick={toggleFullscreen}>
            ⛶ Fullscreen
          </button>
          {externalUrl && (
            <a className="btn btn-quiet btn-small" href={externalUrl} target="_blank" rel="noreferrer">
              Open externally ↗
            </a>
          )}
          {completed && (
            <button
              className="btn btn-quiet btn-small"
              onClick={() => setReviewOpen((v) => !v)}
            >
              {reviewOpen ? "Hide review" : "★ Rate & review"}
            </button>
          )}
          {!completed && (
            <button
              className="btn btn-primary btn-small"
              disabled={locked || busy}
              title={
                locked
                  ? `Prerequisites pending: ${item.missingPrerequisites.join(", ")}`
                  : undefined
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
                await courses.review(item.code, {
                  rating,
                  comment: comment || undefined,
                });
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
