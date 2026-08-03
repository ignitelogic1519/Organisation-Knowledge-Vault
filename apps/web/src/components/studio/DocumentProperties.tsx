"use client";

import type { Classification, OrgPlanLimitsView } from "@vault/shared";
import { Meter, Row, Toggle } from "./fields";
import type { StudioMeta } from "./model";

// The document properties every piece of Studio-authored material carries: the cover data
// that the standardized frame prints, the library shelf it sits on, and how it is placed on
// the branch. An MCQ exam is published through this very panel — it is a course like any
// other, so it is classified, described, made requestable from the library, made mandatory
// and inherited down the branch by exactly the same switches a document is.

const CLASSES: Classification[] = ["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"];
const CLASS_LABEL: Record<Classification, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};

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
}: {
  meta: StudioMeta;
  onMeta: (next: StudioMeta) => void;
  limits: OrgPlanLimitsView | null;
  categories: string[];
  needsReview: boolean;
  noun?: string;
  showKind?: boolean;
}) {
  return (
    <>
      <h4 className="insp-section">Cover &amp; library</h4>
      <Row label="Classification *">
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
      {showKind && (
        <Row label="Document type">
          <select
            value={meta.kind}
            onChange={(e) => onMeta({ ...meta, kind: e.target.value as StudioMeta["kind"] })}
          >
            <option value="DOCUMENT">Document</option>
            <option value="BOOK">Book (multi-page)</option>
          </select>
        </Row>
      )}
      <Row label="Library shelf">
        <input
          list="studio-shelves"
          value={meta.category}
          maxLength={40}
          placeholder="AI, Safety, Onboarding…"
          onChange={(e) => onMeta({ ...meta, category: e.target.value })}
        />
      </Row>
      <datalist id="studio-shelves">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Row label="Description *" hint={`Printed on the ${noun}'s description page.`}>
        <textarea
          rows={3}
          maxLength={500}
          value={meta.description}
          onChange={(e) => onMeta({ ...meta, description: e.target.value })}
        />
      </Row>
      <Row label="Scope" hint="Who it applies to and what it covers.">
        <textarea
          rows={3}
          maxLength={2000}
          value={meta.scope}
          onChange={(e) => onMeta({ ...meta, scope: e.target.value })}
        />
      </Row>

      <h4 className="insp-section">Placement</h4>
      <Toggle
        label="Publish to the library"
        checked={meta.inLibrary}
        onChange={(v) => onMeta({ ...meta, inLibrary: v })}
        hint="Members can find it there and request it for their own branch."
      />
      {!needsReview && (
        <>
          <Toggle
            label="Mandatory for this branch"
            checked={meta.mandatory}
            onChange={(v) => onMeta({ ...meta, mandatory: v })}
          />
          <Toggle
            label="Inherit to lower branches"
            checked={meta.inherit}
            onChange={(v) => onMeta({ ...meta, inherit: v })}
          />
        </>
      )}
      <Toggle
        label="Re-reading required after an update"
        checked={meta.resets}
        onChange={(v) => onMeta({ ...meta, resets: v })}
        hint={`Completions expire when the ${noun} changes.`}
      />

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
