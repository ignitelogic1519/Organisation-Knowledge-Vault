"use client";

import { useEffect, useState } from "react";
import {
  REPLACEMENT_MODE_TEXT,
  replacementModes,
  type Classification,
  type LibraryCourse,
  type OrgPlanLimitsView,
  type PublishCheck,
  type ReplacementMode,
} from "@vault/shared";
import { courses } from "@/lib/courses-client";
import { Meter, Row, Toggle } from "./fields";
import { PublishChecklist } from "./PublishGate";
import type { StudioMeta } from "./model";

// The document properties EVERY piece of material carries, wherever it was made.
//
// This panel is the single definition of "what a document is" on the platform: the Studio
// renders it, the exam editor renders it, the upload composer renders it and the
// properties editor renders it over an already-published course. That is deliberate — the
// three routes used to ask for different things, so a document written in the Studio could
// not be given a deadline, a recurrence or a prerequisite, and an uploaded one could not be
// given a theme or a version note. A document is a document; only its body differs.

const CLASSES: Classification[] = ["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"];
const CLASS_LABEL: Record<Classification, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};
const CLASS_WHY: Record<Classification, string> = {
  PUBLIC: "Anyone in the organization may read it and it may leave the organization.",
  CONFIDENTIAL: "For the organization only. It may be read widely inside, never outside.",
  PRIVATE: "For the branches it is placed on. Not for general circulation.",
  SECRET: "Named recipients only. The strictest handling the platform recognises.",
};

/** Days-or-nothing input: an empty box means "no rule", not zero. */
function DayField({
  label,
  value,
  onChange,
  hint,
  why,
  placeholder = "no limit",
  check,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  why: string;
  placeholder?: string;
  check?: string;
}) {
  return (
    <div data-check={check}>
      <Row label={label} hint={hint} why={why}>
        <input
          type="number"
          min={1}
          max={3650}
          value={value ?? ""}
          placeholder={placeholder}
          data-hint={why}
          data-hint-title={label}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        />
      </Row>
    </div>
  );
}

export function DocumentProperties({
  meta,
  onMeta,
  limits,
  categories,
  needsReview,
  /** What the author is writing — only the wording changes. */
  noun = "document",
  /** The DOCUMENT/BOOK selector, which an exam has no use for. */
  showKind = true,
  /** false while revising something already published — placements belong to the branch. */
  showPlacement = true,
  /** false when the properties are being edited on a course that already exists. */
  showVersionControl = true,
  /** The live publish checks, when the caller wants the checklist rendered in here. */
  checks,
  onGoToCheck,
  /** Org id — needed to offer the library as replacement candidates. */
  orgId,
  /** The course being edited, so it is never offered as its own replacement. */
  selfCode,
}: {
  meta: StudioMeta;
  onMeta: (next: StudioMeta) => void;
  limits: OrgPlanLimitsView | null;
  categories: string[];
  needsReview: boolean;
  noun?: string;
  showKind?: boolean;
  showPlacement?: boolean;
  showVersionControl?: boolean;
  checks?: PublishCheck[];
  onGoToCheck?: (id: PublishCheck["id"]) => void;
  orgId?: string;
  selfCode?: string;
}) {
  const missing = (id: PublishCheck["id"]) =>
    !!checks?.some((c) => c.id === id && c.required && !c.ok);
  const why = (id: PublishCheck["id"]) => checks?.find((c) => c.id === id)?.why;

  // Candidates for "what does this replace" — the org's own library, loaded once.
  const [library, setLibrary] = useState<LibraryCourse[] | null>(null);
  useEffect(() => {
    if (!orgId || !showVersionControl) return;
    courses
      .library(orgId)
      .then((r) => setLibrary(r.courses.filter((c) => c.code !== selfCode && !c.supersededByCode)))
      .catch(() => setLibrary([]));
  }, [orgId, selfCode, showVersionControl]);

  const replacing = (library ?? []).find((c) => c.code === meta.replacesCourseCode);

  return (
    <>
      {checks && (
        <PublishChecklist checks={checks} noun={noun} onGo={onGoToCheck} />
      )}

      <h4 className="insp-section">Cover &amp; library</h4>
      <div data-check="classification">
        <Row
          label="Classification"
          required
          missing={missing("classification")}
          why={
            why("classification") ??
            "Classification is the organization's handling instruction and prints on every page."
          }
        >
          <select
            value={meta.classification ?? ""}
            onChange={(e) =>
              onMeta({ ...meta, classification: (e.target.value || null) as Classification | null })
            }
          >
            <option value="">Choose…</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {CLASS_LABEL[c]}
              </option>
            ))}
          </select>
        </Row>
        {meta.classification && (
          <small className="insp-hint">{CLASS_WHY[meta.classification]}</small>
        )}
      </div>

      {showKind && (
        <Row
          label="Document type"
          why="A book is paginated and opens with a contents page; a document is read straight through."
        >
          <select
            value={meta.kind}
            onChange={(e) => onMeta({ ...meta, kind: e.target.value as StudioMeta["kind"] })}
          >
            <option value="DOCUMENT">Document</option>
            <option value="BOOK">Book (multi-page)</option>
          </select>
        </Row>
      )}

      <div data-check="shelf">
        <Row
          label="Library shelf"
          why={why("shelf") ?? "The shelf tag is what groups this with related material in the library."}
        >
          <input
            list="studio-shelves"
            value={meta.category}
            maxLength={40}
            placeholder="AI, Safety, Onboarding…"
            onChange={(e) => onMeta({ ...meta, category: e.target.value })}
          />
        </Row>
      </div>
      <datalist id="studio-shelves">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div data-check="description">
        <Row
          label="Description"
          required
          missing={missing("description")}
          hint={`Printed on the ${noun}'s description page.`}
          why={
            why("description") ??
            "The description is page two of the standard format and the summary line in the library."
          }
        >
          <textarea
            rows={3}
            maxLength={500}
            value={meta.description}
            onChange={(e) => onMeta({ ...meta, description: e.target.value })}
          />
        </Row>
      </div>

      <div data-check="scope">
        <Row
          label="Scope"
          hint="Who it applies to and what it covers."
          why={why("scope") ?? "Scope prints under the description on page two."}
        >
          <textarea
            rows={3}
            maxLength={2000}
            value={meta.scope}
            onChange={(e) => onMeta({ ...meta, scope: e.target.value })}
          />
        </Row>
      </div>

      {/* ── Reading rules — the half that used to exist only on the upload form ── */}
      <h4 className="insp-section">Reading rules</h4>
      <p className="insp-note">
        The same rules an uploaded document carries. Each is a course-wide default; a branch
        can still tighten it for itself when the {noun} is placed.
      </p>
      <DayField
        label="Deadline (days)"
        value={meta.deadlineDays}
        onChange={(deadlineDays) => onMeta({ ...meta, deadlineDays })}
        why="How long someone has to finish it after it reaches them. Past this they show as overdue in compliance and their manager is nudged. Leave empty for no deadline."
        hint="Counted from the day it lands on the reader's branch."
      />
      <DayField
        label="Repeat every (days)"
        value={meta.retakeEveryNDays}
        onChange={(retakeEveryNDays) => onMeta({ ...meta, retakeEveryNDays })}
        why="Recurrence. A completion expires this many days after it is granted and the reader has to do it again — this is how annual policy sign-offs and yearly refreshers are enforced. Leave empty and a completion never lapses."
        hint="Yearly refresher = 365."
        placeholder="never expires"
      />
      <Toggle
        label="Re-reading required after an update"
        checked={meta.resets}
        onChange={(v) => onMeta({ ...meta, resets: v })}
        hint={`Completions expire when a new edition of the ${noun} is published.`}
      />
      <Toggle
        label="Readers may download it"
        checked={meta.allowDownload}
        onChange={(v) => onMeta({ ...meta, allowDownload: v })}
        hint="Off keeps the material inside the app. A classified document that can be downloaded has left your custody."
      />
      <Row
        label="Prerequisites"
        hint="Course codes, comma-separated. They must be completed before this unlocks."
        why="A reader who has not finished the prerequisite cannot mark this complete. Use it for a sequence — the induction before the procedure it assumes."
      >
        <input
          value={meta.prerequisiteCodes.join(", ")}
          placeholder="100-101-0001, …"
          onChange={(e) =>
            onMeta({
              ...meta,
              prerequisiteCodes: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </Row>

      {/* ── Version control ────────────────────────────────────────────────── */}
      {showVersionControl && (
        <>
          <h4 className="insp-section">Version control</h4>
          <p className="insp-note">
            Does something on the shelves already cover this? Say so here, and decide whether
            the two live side by side or this one takes over.
          </p>
          <Row
            label="Replaces"
            why="Naming what this replaces is what keeps the library honest. Without it two documents on the same subject sit next to each other and nobody can tell which one is current."
          >
            <select
              value={meta.replacesCourseCode}
              onChange={(e) => onMeta({ ...meta, replacesCourseCode: e.target.value })}
            >
              <option value="">Nothing — this is new</option>
              {(library ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.title} · {c.code}
                </option>
              ))}
            </select>
          </Row>
          {meta.replacesCourseCode && (
            <div className="insp-modes">
              {replacementModes.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="insp-mode"
                  data-active={meta.replacementMode === m}
                  data-hint={REPLACEMENT_MODE_TEXT[m].blurb}
                  data-hint-title={REPLACEMENT_MODE_TEXT[m].label}
                  onClick={() => onMeta({ ...meta, replacementMode: m as ReplacementMode })}
                >
                  <strong>{REPLACEMENT_MODE_TEXT[m].label}</strong>
                  <small>{REPLACEMENT_MODE_TEXT[m].blurb}</small>
                </button>
              ))}
            </div>
          )}
          {meta.replacesCourseCode && meta.replacementMode === "SUPERSEDE" && replacing && (
            <p className="insp-warn">
              On publish, <strong>{replacing.title}</strong> is retired: it leaves the library
              and each of its {replacing.usedIn.length}{" "}
              {replacing.usedIn.length === 1 ? "branch" : "branches"} receives this one on the
              same terms. Its completion history is kept.
            </p>
          )}
          <Row
            label="What changed"
            hint="Recorded in this document's edition history."
            why="Every publication writes a row in the version history. A sentence here is what tells a reader in six months why the edition they are looking at exists."
          >
            <textarea
              rows={2}
              maxLength={500}
              value={meta.versionNote}
              placeholder="Rewrote section 4 after the audit…"
              onChange={(e) => onMeta({ ...meta, versionNote: e.target.value })}
            />
          </Row>
        </>
      )}

      {/* ── Placement ───────────────────────────────────────────────────────── */}
      <h4 className="insp-section">Placement</h4>
      <Toggle
        label="Publish to the library"
        checked={meta.inLibrary}
        onChange={(v) => onMeta({ ...meta, inLibrary: v })}
        hint="Members can find it there and request it for their own branch."
      />
      {!showPlacement && (
        <p className="insp-note">
          Where this sits on the branch — mandatory, inherited — is managed from the branch
          itself. A new edition keeps exactly the placements this one has.
        </p>
      )}
      {showPlacement && !needsReview && (
        <>
          <Toggle
            label="Mandatory for this branch"
            checked={meta.mandatory}
            onChange={(v) => onMeta({ ...meta, mandatory: v })}
            hint="Mandatory lands on everyone's compliance list. Opt-in is offered, not required."
          />
          <Toggle
            label="Inherit to lower branches"
            checked={meta.inherit}
            onChange={(v) => onMeta({ ...meta, inherit: v })}
            hint="On, every branch beneath this one receives it too."
          />
        </>
      )}
      {showPlacement && needsReview && (
        <p className="insp-note">
          Whether this is mandatory, and how far down it reaches, is set by the manager who
          reviews it — those are their branch&rsquo;s decisions to make.
        </p>
      )}

      {limits && (
        <>
          <h4 className="insp-section">Plan allowance</h4>
          <Meter label="Studio documents" used={limits.documents.used} limit={limits.documents.limit} />
          <Meter label="Uploaded documents" used={limits.uploads.used} limit={limits.uploads.limit} />
          <p className="insp-note">
            {limits.planName ? `${limits.planName} plan` : "No active plan"}
            {limits.draftsEnabled ? " · drafts included" : " · drafts are a premium capability"}
          </p>
        </>
      )}
    </>
  );
}
