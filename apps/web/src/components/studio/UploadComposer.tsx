"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { OrgPlanLimitsView, PublishCheck, StorageView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { courses, fileToBase64 } from "@/lib/courses-client";
import { uploadFile } from "@/lib/storage-client";
import { useDialogs } from "@/components/dialogs";
import { DocumentProperties } from "./DocumentProperties";
import { Row } from "./fields";
import { focusCheck, PublishReadiness, usePublishGate } from "./PublishGate";
import { EMPTY_META, type StudioMeta } from "./model";

// The upload composer.
//
// Bringing a document IN and building one in the Studio produce the same kind of object,
// so this is the Studio's properties panel with a drop zone where the canvas would be.
// Before, the two forms asked for different things — the upload form had deadlines and
// recurrence the Studio lacked, the Studio had themes and version notes the upload form
// lacked — and a document's properties depended on which door it came through. They now
// share `DocumentProperties`, so there is exactly one answer to "what does a document
// carry".
//
// It is a two-step composer rather than one long form: what the material IS, then what the
// organization does with it. The second step is the same panel the Studio shows.

type Step = "source" | "properties";

const KINDS = [
  { key: "DOCUMENT", label: "Document", icon: "📄", hint: "A PDF, a Word file, a scan." },
  { key: "BOOK", label: "Book", icon: "📕", hint: "Long-form, read over several sittings." },
  { key: "LINK", label: "Link", icon: "🔗", hint: "Material that lives on another site." },
  { key: "AUDIO", label: "Audio", icon: "🎧", hint: "A recording or a briefing." },
  { key: "VIDEO", label: "Video", icon: "🎬", hint: "A recorded session or a walkthrough." },
] as const;

type UploadKind = (typeof KINDS)[number]["key"];

const prettyBytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function UploadComposer({
  orgId,
  roleNodeId,
  roleName,
  limits,
  categories,
  orgStorage,
  needsReview,
  onDone,
  onCancel,
}: {
  orgId: string;
  roleNodeId: string;
  roleName: string;
  limits: OrgPlanLimitsView | null;
  categories: string[];
  orgStorage: StorageView | null;
  needsReview: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const dialogs = useDialogs();
  const [step, setStep] = useState<Step>("source");
  const [kind, setKind] = useState<UploadKind>("DOCUMENT");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [meta, setMeta] = useState<StudioMeta>({ ...EMPTY_META, mandatory: true });
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasSource = !!file || !!url.trim();
  const gate = usePublishGate({
    title: meta.title,
    description: meta.description,
    scope: meta.scope,
    category: meta.category,
    classification: meta.classification,
    contentCount: hasSource ? 1 : 0,
    noun: "upload",
  });

  const maxNote =
    orgStorage?.status === "ACTIVE"
      ? "Up to 200 MB — it goes straight to your own storage."
      : "Up to 10 MB while the organization has no storage of its own connected.";

  const take = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    // A file usually knows what it is called; the author can always overrule it.
    setMeta((m) => (m.title.trim() ? m : { ...m, title: f.name.replace(/\.[^.]+$/, "") }));
  }, []);

  /** The shelf suggestion, asked for once the title and description exist. */
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const suggestShelf = useCallback(() => {
    if (!meta.title.trim()) return;
    courses
      .suggestCategory(orgId, meta.title, meta.description)
      .then((r) => setSuggestion(r.suggestion))
      .catch(() => undefined);
  }, [orgId, meta.title, meta.description]);

  const goToCheck = useCallback((id: PublishCheck["id"]) => {
    setStep(id === "content" ? "source" : "properties");
  }, []);

  const kindMeta = useMemo(() => KINDS.find((k) => k.key === kind)!, [kind]);

  const submit = async () => {
    if (gate.blockers.length > 0) {
      const first = gate.blockers[0];
      setStep(first.id === "content" ? "source" : "properties");
      await dialogs.alert({
        title:
          gate.blockers.length === 1
            ? `${first.label} is still needed`
            : `${gate.blockers.length} things are still needed`,
        tone: "danger",
        message: (
          <>
            <p>This upload cannot be published yet. Each item below is compulsory.</p>
            <ul className="pubgate-alert-list">
              {gate.blockers.map((c) => (
                <li key={c.id}>
                  <strong>{c.label}</strong> — {c.fix}
                  <small>{c.why}</small>
                </li>
              ))}
            </ul>
          </>
        ),
      });
      window.setTimeout(() => focusCheck(first.id), 80);
      return;
    }

    setBusy(true);
    try {
      // When the organization has its own storage the bytes go from this browser to their
      // hardware and we only pass on the reference (docs/structure.md §9.3).
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

      const created = await courses.create(orgId, {
        roleNodeId,
        kind,
        title: meta.title.trim(),
        description: meta.description.trim(),
        scope: meta.scope.trim() || undefined,
        classification: meta.classification!,
        category: meta.category.trim() || undefined,
        allowDownload: meta.allowDownload,
        inLibrary: meta.inLibrary,
        url: url.trim() || undefined,
        storageObjectId: uploaded?.storageObjectId,
        fileBase64: !uploaded && file ? await fileToBase64(file) : undefined,
        filename: !uploaded && file ? file.name : undefined,
        mime: !uploaded && file ? file.type || "application/octet-stream" : undefined,
        deadlineDays: meta.deadlineDays ?? undefined,
        retakeEveryNDays: meta.retakeEveryNDays ?? undefined,
        resetsCompletionOnUpdate: meta.resets,
        prerequisiteCodes: meta.prerequisiteCodes,
        replacesCourseCode: meta.replacesCourseCode || undefined,
        replacementMode: meta.replacementMode,
        versionNote: meta.versionNote.trim() || undefined,
      });

      if (!created.draft) {
        await courses.place(created.code, {
          roleNodeId,
          mandatory: meta.mandatory,
          inheritToDescendants: meta.inherit,
        });
        dialogs.toast(`Published ${created.code} to ${roleName}.`, "success");
      } else {
        dialogs.toast("Sent to your branch manager for review.", "success");
      }
      onDone();
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not publish", "danger");
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  return (
    <div className="upcomp glass">
      <div className="upcomp-head">
        <div className="upcomp-steps" role="tablist" aria-label="Upload steps">
          <button
            type="button"
            role="tab"
            aria-selected={step === "source"}
            data-active={step === "source"}
            data-done={hasSource}
            onClick={() => setStep("source")}
          >
            <span className="upcomp-step-n">1</span> The material
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={step === "properties"}
            data-active={step === "properties"}
            data-done={gate.ready}
            onClick={() => setStep("properties")}
          >
            <span className="upcomp-step-n">2</span> Its properties
          </button>
        </div>
        <div className="upcomp-head-actions">
          <PublishReadiness
            blockers={gate.blockers}
            advisories={gate.advisories}
            noun="upload"
            onGo={goToCheck}
          />
          <button type="button" className="icon-btn" aria-label="Close" onClick={onCancel}>
            ✕
          </button>
        </div>
      </div>

      {step === "source" && (
        <div className="upcomp-body">
          <h4 className="insp-section">What kind of material is this?</h4>
          <div className="upcomp-kinds">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                className="upcomp-kind"
                data-active={kind === k.key}
                data-hint={k.hint}
                data-hint-title={k.label}
                onClick={() => setKind(k.key)}
              >
                <span aria-hidden>{k.icon}</span>
                <strong>{k.label}</strong>
              </button>
            ))}
          </div>

          <div data-check="content">
            <h4 className="insp-section">
              {kind === "LINK" ? "Where does it live?" : "The file"}
            </h4>
            {kind !== "LINK" && (
              <div
                className="upcomp-drop"
                data-dragging={dragging}
                data-filled={!!file}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  take(e.dataTransfer.files?.[0] ?? null);
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                }}
                data-hint={maxNote}
                data-hint-title="Drop a file, or click to choose one"
              >
                <input
                  ref={inputRef}
                  type="file"
                  hidden
                  onChange={(e) => take(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <span className="upcomp-drop-icon" aria-hidden>
                      {kindMeta.icon}
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
                    <strong>Drop the file here</strong>
                    <small>{maxNote}</small>
                  </>
                )}
              </div>
            )}

            {orgStorage?.status === "ACTIVE" && kind !== "LINK" && (
              <p className="insp-note">
                It goes straight from this browser to your own storage
                {orgStorage.encryption === "ENCRYPTED" ? ", encrypted here first" : ""} — the bytes
                never pass through Knowledge Vault.
              </p>
            )}
            {orgStorage?.status === "DEGRADED" && (
              <p className="insp-warn">
                Your storage is unreachable, so uploads are paused. Everything already stored is
                safe and unchanged.
              </p>
            )}

            <Row
              label={kind === "LINK" ? "Address" : "…or an address instead of a file"}
              hint="Anything hosted elsewhere — a shared drive, a recording, a policy site."
              why="A link is registered as content like any other document: it is classified, placed on branches and completed the same way. Only the bytes live somewhere else."
            >
              <input
                type="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Row>
            {stage && <p className="insp-note">{stage}</p>}
          </div>

          <div className="upcomp-foot">
            <button type="button" className="btn btn-quiet btn-small" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => {
                suggestShelf();
                setStep("properties");
              }}
            >
              Next — its properties →
            </button>
          </div>
        </div>
      )}

      {step === "properties" && (
        <div className="upcomp-body">
          <div data-check="title">
            <Row
              label="Title"
              required
              missing={gate.blockers.some((b) => b.id === "title")}
              why={gate.checks.find((c) => c.id === "title")!.why}
            >
              <input
                value={meta.title}
                maxLength={120}
                onBlur={suggestShelf}
                onChange={(e) => setMeta({ ...meta, title: e.target.value })}
              />
            </Row>
          </div>
          {suggestion && suggestion !== meta.category && (
            <p className="insp-note">
              Similar material lives on the{" "}
              <button
                type="button"
                className="chip chip-shelf"
                onClick={() => setMeta({ ...meta, category: suggestion })}
              >
                {suggestion}
              </button>{" "}
              shelf — click to use it, or keep your own tag.
            </p>
          )}

          <DocumentProperties
            meta={meta}
            onMeta={setMeta}
            limits={limits}
            categories={categories}
            needsReview={needsReview}
            noun="upload"
            // "Document or book" is chosen up on step 1, as one of five kinds.
            showKind={false}
            checks={gate.checks}
            onGoToCheck={goToCheck}
            orgId={orgId}
          />

          <div className="upcomp-foot">
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => setStep("source")}
            >
              ← The material
            </button>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={busy}
              data-pending={!gate.ready || undefined}
              data-hint={
                gate.ready
                  ? needsReview
                    ? "Send it to your branch manager for review."
                    : `Publish it to ${roleName}.`
                  : `${gate.blockers.length} compulsory ${gate.blockers.length === 1 ? "item is" : "items are"} still missing.`
              }
              data-hint-tone={gate.ready ? "info" : "required"}
              onClick={submit}
            >
              {busy ? (stage ?? "Publishing…") : needsReview ? "Submit for review" : "Publish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
