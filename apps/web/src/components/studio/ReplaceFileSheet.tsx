"use client";

import { useEffect, useRef, useState } from "react";
import { versionLabel, type StorageView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { courses, fileToBase64, type CourseDetail } from "@/lib/courses-client";
import { uploadFile } from "@/lib/storage-client";
import { useDialogs } from "@/components/dialogs";
import { Row } from "./fields";

// A new edition of an UPLOADED document.
//
// Version control was only ever offered on Studio-built material: the branch panel gated
// "take out of deployment" and "revise" behind `source === "STUDIO"`, so a policy PDF
// could never be updated at all. The only route was to delete it and upload a new one —
// which loses its code, its completion history, its placements and its ratings, and leaves
// every reference to it dangling.
//
// The API always supported it (PATCH /courses/:code accepts a new file, a new link or a
// new object). This is the missing door: swap the bytes, bump the version, keep everything
// else, and record what changed against the new edition.

const prettyBytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function ReplaceFileSheet({
  code,
  orgId,
  orgStorage,
  onClose,
  onDone,
}: {
  code: string;
  orgId: string;
  orgStorage: StorageView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialogs = useDialogs();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    courses
      .info(code)
      .then(setDetail)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not open this document"));
  }, [code]);

  const nextVersion = detail ? detail.version + 1 : null;

  const publish = async () => {
    if (!detail) return;
    if (!file && !url.trim()) {
      setError("Choose the replacement file, or paste the new address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // A live document cannot be rewritten under its readers. Offer the pause here
      // rather than refusing with an error the author then has to go and act on.
      if (!detail.withdrawn) {
        const ok = await dialogs.confirm({
          title: "Pause it while the new edition lands?",
          message: `“${detail.title}” is in deployment, so readers are on ${versionLabel(detail.version)} right now. Publishing a new edition takes it out of deployment for a moment and puts it straight back on exactly the same branches — nobody loses their place, and nothing is unassigned.`,
          confirmLabel: `Publish ${versionLabel(detail.version + 1)}`,
        });
        if (!ok) {
          setBusy(false);
          return;
        }
        await courses.withdraw(code, true);
      }

      let uploaded: { storageObjectId: string } | null = null;
      if (file && orgStorage?.status === "ACTIVE") {
        uploaded = await uploadFile(orgId, file, (s) =>
          setStage(
            s === "encrypting"
              ? "Encrypting in this browser…"
              : s === "uploading"
                ? "Uploading to your storage…"
                : s === "finishing"
                  ? "Finishing…"
                  : "Preparing…",
          ),
        );
        setStage(null);
      }

      const { version } = await courses.update(code, {
        url: url.trim() || undefined,
        storageObjectId: uploaded?.storageObjectId,
        fileBase64: !uploaded && file ? await fileToBase64(file) : undefined,
        filename: !uploaded && file ? file.name : undefined,
        mime: !uploaded && file ? file.type || "application/octet-stream" : undefined,
        versionNote: note.trim() || undefined,
      });
      dialogs.toast(`Published ${versionLabel(version)} of ${code}.`, "success");
      onDone();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not publish the new edition";
      setError(message);
      dialogs.toast(message, "danger");
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  return (
    <div
      className="sheet-layer"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet sheet-wide glass-strong" role="dialog" aria-modal="true">
        <span className="sheet-grip" aria-hidden />
        <div className="sheet-body">
          <div className="proped-head">
            <div>
              <h3>New edition of {detail?.title ?? code}</h3>
              <p className="auth-sub">
                <span className="chip">{code}</span>{" "}
                {detail && (
                  <>
                    <span className="chip">{versionLabel(detail.version)}</span> →{" "}
                    <span className="chip chip-shelf">{versionLabel(nextVersion!)}</span>
                  </>
                )}
              </p>
            </div>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>

          <p className="proped-note">
            The document keeps its code, its classification, its placements, its ratings and
            everybody&rsquo;s completion history. Only what people open changes.
            {detail?.resetsCompletionOnUpdate
              ? " Because this document is set to require re-reading after an update, existing completions will expire and everyone it reaches will be asked to read it again."
              : " Existing completions stay valid — this document is not set to require a re-read after an update."}
          </p>

          <div
            className="upcomp-drop"
            data-dragging={dragging}
            data-filled={!!file}
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              setFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
          >
            <input
              ref={inputRef}
              type="file"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <>
                <span className="upcomp-drop-icon" aria-hidden>
                  📄
                </span>
                <strong>{file.name}</strong>
                <small>
                  {prettyBytes(file.size)} · {file.type || "unknown type"}
                </small>
                <span className="upcomp-drop-swap">Click to choose a different file</span>
              </>
            ) : (
              <>
                <span className="upcomp-drop-icon" aria-hidden>
                  ⤒
                </span>
                <strong>Drop the replacement here</strong>
                <small>
                  {orgStorage?.status === "ACTIVE"
                    ? "Up to 200 MB — straight to your own storage."
                    : "Up to 10 MB."}
                </small>
              </>
            )}
          </div>

          <Row
            label="…or a new address"
            hint="For material that lives on another site."
            why="Replacing a file with a link (or the other way round) is allowed — it is still the same document, so it keeps its code and its history."
          >
            <input
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Row>

          <Row
            label="What changed"
            hint="Recorded in this document's version history."
            why="Six months from now, this sentence is the only thing that explains why the edition exists. It is shown to anyone who opens the document's version history."
          >
            <textarea
              rows={2}
              maxLength={500}
              value={note}
              placeholder="Reissued after the September policy review…"
              onChange={(e) => setNote(e.target.value)}
            />
          </Row>

          {stage && <p className="insp-note">{stage}</p>}
          {error && <p className="form-error">{error}</p>}

          <div className="sheet-actions">
            <button className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={publish}>
              {busy
                ? (stage ?? "Publishing…")
                : nextVersion
                  ? `Publish ${versionLabel(nextVersion)}`
                  : "Publish the new edition"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
