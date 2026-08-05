import { z } from "zod";
import { examBodySchema } from "./exams.js";
import type { Classification, CompletionStatus, CourseKind } from "./types.js";

// Course & learning contracts — docs/structure.md §3 (courses), §5 (assignment), §6 (surfaces).

// ── Authored documents (the Studio format, v2) ───────────────────────────────
// A document is a flat, ordered list of blocks. Everything visual a block can carry lives
// in typed sub-objects (style / table / media) rather than free-form CSS, so the server can
// validate it and the renderer can never be handed arbitrary markup. v1 documents (plain
// `rows` tables, no `style`) stay valid — every new field is optional and the renderer
// falls back to the v1 shape.

/** Horizontal alignment, shared by blocks and table cells. */
export const alignments = ["left", "center", "right", "justify"] as const;
export const alignSchema = z.enum(alignments);
export type BlockAlign = z.infer<typeof alignSchema>;

/**
 * A colour the renderer may inline. Deliberately narrow — hex, rgb()/rgba() or a bare
 * keyword — so nothing that could smuggle CSS (url(), expression(), ;) ever reaches a
 * style attribute.
 */
export const docColorSchema = z
  .string()
  .trim()
  .max(32)
  .regex(
    /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|transparent|[a-zA-Z]{3,20})$/,
    "Unsupported colour value",
  );

/** Type families the reader's browser always has — no webfont downloads, no CSS injection. */
export const docFonts = ["sans", "serif", "mono", "display", "hand"] as const;
export const docFontSchema = z.enum(docFonts);

/** Entrance animations played when a block scrolls into view (Slides-style motion). */
export const blockAnimations = ["none", "fade", "rise", "slide", "zoom", "flip"] as const;
export const blockAnimationSchema = z.enum(blockAnimations);

/** Page-turn animations, carried by the `pagebreak` that opens the page. */
export const pageTransitions = ["none", "fade", "slide", "push", "flip", "zoom", "reveal"] as const;
export const pageTransitionSchema = z.enum(pageTransitions);

/** Presentation of one block — the "format" half of the Studio's inspector. */
export const blockStyleSchema = z.object({
  align: alignSchema.optional(),
  color: docColorSchema.optional(), // text colour
  background: docColorSchema.optional(), // fill / highlight behind the block
  accent: docColorSchema.optional(), // rule, border & marker colour
  font: docFontSchema.optional(),
  /** Font size in px — headings default to their level when unset. */
  fontSize: z.number().min(8).max(120).optional(),
  lineHeight: z.number().min(1).max(3).optional(),
  letterSpacing: z.number().min(-3).max(20).optional(),
  /** Block width as a percentage of the page (images, media, tables, callouts). */
  width: z.number().int().min(10).max(100).optional(),
  /** Horizontal placement of a block narrower than the page. */
  float: z.enum(["left", "center", "right"]).optional(),
  padding: z.number().int().min(0).max(80).optional(),
  radius: z.number().int().min(0).max(48).optional(),
  border: z.boolean().optional(),
  shadow: z.boolean().optional(),
  uppercase: z.boolean().optional(),
  animation: blockAnimationSchema.optional(),
  /** Space added below the block, in px. */
  spaceAfter: z.number().int().min(0).max(160).optional(),
});
export type BlockStyle = z.infer<typeof blockStyleSchema>;

/** One spreadsheet cell: text plus its own formatting, exactly like a Sheets cell. */
export const tableCellSchema = z.object({
  text: z.string().max(2_000).default(""),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: alignSchema.optional(),
  color: docColorSchema.optional(),
  background: docColorSchema.optional(),
  colSpan: z.number().int().min(1).max(24).optional(),
  rowSpan: z.number().int().min(1).max(60).optional(),
});
export type TableCell = z.infer<typeof tableCellSchema>;

/** Table-wide options — header bands, banding, borders and column widths. */
export const tableOptionsSchema = z.object({
  headerRow: z.boolean().optional(), // default true
  headerColumn: z.boolean().optional(),
  striped: z.boolean().optional(),
  borders: z.enum(["all", "horizontal", "outline", "none"]).optional(),
  compact: z.boolean().optional(),
  /** Percentage width per column; entries may be omitted for "auto". */
  columnWidths: z.array(z.number().int().min(3).max(100)).max(24).optional(),
  caption: z.string().max(200).optional(),
  /** Freeze the header band while the table scrolls sideways. */
  stickyHeader: z.boolean().optional(),
});
export type TableOptions = z.infer<typeof tableOptionsSchema>;

/** An alternate rendition of the same media — the reader's quality selector. */
export const mediaSourceSchema = z.object({
  label: z.string().trim().min(1).max(24), // "1080p", "Low data", …
  url: z.string().url(),
});

/** Playback rules for an audio/video block. */
export const mediaOptionsSchema = z.object({
  autoplay: z.boolean().optional(),
  loop: z.boolean().optional(),
  muted: z.boolean().optional(),
  /**
   * false = the reader may not seek ahead or fast-forward. Used for compliance material
   * that must actually be watched; rewinding stays allowed.
   */
  skippable: z.boolean().optional(), // default true
  /** Offer the 0.5×–2× speed selector. */
  speedControl: z.boolean().optional(), // default true
  defaultSpeed: z.number().min(0.25).max(4).optional(),
  /** Quality ladder — when present the player shows a quality selector. */
  sources: z.array(mediaSourceSchema).max(6).optional(),
  poster: z.string().url().optional(),
  captionsUrl: z.string().url().optional(),
  /** Clip window, in seconds. */
  startAt: z.number().min(0).max(86_400).optional(),
  endAt: z.number().min(0).max(86_400).optional(),
  /** Show the "watched to the end" tick once the reader finishes it. */
  trackCompletion: z.boolean().optional(),
  /** Expose the browser's own download control on the player. */
  download: z.boolean().optional(),
});
export type MediaOptions = z.infer<typeof mediaOptionsSchema>;

/** One column of a `columns` block — a mini rich-text card, optionally with an image. */
export const docColumnSchema = z.object({
  html: z.string().max(20_000).optional(),
  title: z.string().max(200).optional(),
  url: z.string().url().optional(), // image at the top of the column
  /** Share of the row's width; omitted columns split what is left evenly. */
  width: z.number().int().min(10).max(90).optional(),
});
export type DocColumn = z.infer<typeof docColumnSchema>;

/** A checklist entry — text plus an optional pre-tick and helper line. */
export const checklistEntrySchema = z.object({
  text: z.string().max(500),
  checked: z.boolean().optional(),
  hint: z.string().max(200).optional(),
});

/** One collapsible panel — a question, a policy clause, an optional detail. */
export const panelSchema = z.object({
  title: z.string().max(200).default(""),
  html: z.string().max(20_000).optional(),
  /** Open when the reader arrives (otherwise they expand it themselves). */
  open: z.boolean().optional(),
});
export type DocPanel = z.infer<typeof panelSchema>;

/** Framed content from an allow-listed host — see ./embeds. */
export const embedOptionsSchema = z.object({
  /** Height in px when the provider has no natural aspect ratio. */
  height: z.number().int().min(120).max(1600).optional(),
  /** Show the source address under the frame. */
  showSource: z.boolean().optional(),
});
export type EmbedOptions = z.infer<typeof embedOptionsSchema>;

export const authoredBlockTypes = [
  "heading",
  "paragraph",
  "table",
  "media",
  "card", // callout
  "checklist",
  "image",
  "divider",
  "pagebreak", // starts a new page — books, decks & multi-page documents
  "quote",
  "code",
  "columns", // side-by-side sections (site-style layout)
  "spacer",
  "button", // call-to-action link
  "accordion", // collapsible panels — FAQs, policy clauses, optional detail
  "toc", // contents, built from the document's own headings
  "embed", // framed content from an allow-listed host
] as const;

/**
 * Authored (in-app created) document blocks — the Studio's storage format. Rendered by
 * the viewer inside the standardized document frame. Rich text is stored as limited
 * HTML and sanitized (whitelist) server-side on write and again at render time.
 */
export const authoredBlockSchema = z.object({
  type: z.enum(authoredBlockTypes),
  /** heading/paragraph/card/quote/columns: limited HTML; code: plain text */
  html: z.string().max(20_000).optional(),
  level: z.number().int().min(1).max(6).optional(), // heading level
  url: z.string().url().optional(), // media/image src, button href
  mediaKind: z.enum(["audio", "video"]).optional(),
  title: z.string().max(200).optional(), // card/checklist/media/button title
  /** table (v1, still written for compatibility): rows of plain-text cells. */
  rows: z.array(z.array(z.string().max(2_000))).max(200).optional(),
  /** table (v2): the same grid with per-cell formatting. Preferred when present. */
  cells: z.array(z.array(tableCellSchema).max(24)).max(200).optional(),
  table: tableOptionsSchema.optional(),
  items: z.array(z.string().max(500)).max(100).optional(), // checklist entries (v1)
  list: z.array(checklistEntrySchema).max(100).optional(), // checklist entries (v2)
  media: mediaOptionsSchema.optional(),
  columns: z.array(docColumnSchema).max(4).optional(),
  /** accordion: the collapsible panels. */
  panels: z.array(panelSchema).max(30).optional(),
  /** embed: framing options (the address itself is `url`). */
  embed: embedOptionsSchema.optional(),
  /** toc: deepest heading level listed (default 3). */
  depth: z.number().int().min(1).max(6).optional(),
  style: blockStyleSchema.optional(),
  /** pagebreak: how the page it opens arrives. */
  transition: pageTransitionSchema.optional(),
  /** pagebreak: a label for the page in the navigator & printed running head. */
  pageLabel: z.string().max(80).optional(),
  /** card/quote/button: the tone of the surface. */
  variant: z.enum(["neutral", "accent", "info", "success", "warning", "danger"]).optional(),
  /** code: the language shown on the chip (highlighting is not performed). */
  language: z.string().max(24).optional(),
  /** quote: who said it. */
  attribution: z.string().max(160).optional(),
  /** image/media/table: caption printed under the block. */
  caption: z.string().max(300).optional(),
  /** spacer: height in px. */
  size: z.number().int().min(4).max(400).optional(),
});
export type AuthoredBlock = z.infer<typeof authoredBlockSchema>;
export const authoredBlocksSchema = z.array(authoredBlockSchema).min(1).max(400);

/**
 * The document's own look — chosen once and applied to every page, the way a site theme
 * is. Stored alongside the blocks so the reader's viewer renders exactly what the author
 * saw. Every field is optional; unset falls back to the organization's design tokens.
 */
export const documentThemeSchema = z.object({
  /** The named preset the author picked (informational — the values below are authoritative). */
  preset: z.string().max(40).optional(),
  bodyFont: docFontSchema.optional(),
  headingFont: docFontSchema.optional(),
  accent: docColorSchema.optional(),
  /** Page colour. */
  paper: docColorSchema.optional(),
  /** Body text colour. */
  ink: docColorSchema.optional(),
  /** Overall spacing and type scale. */
  density: z.enum(["compact", "normal", "relaxed"]).optional(),
  /** How headings are set. */
  headingStyle: z.enum(["plain", "underlined", "accented", "uppercase"]).optional(),
  /** Page width in rem — narrower reads better, wider fits tables. */
  measure: z.number().int().min(32).max(72).optional(),
});
export type DocumentTheme = z.infer<typeof documentThemeSchema>;

/** What the `authored` storage adapter holds: the blocks plus the document's theme. */
export interface AuthoredDocument {
  blocks: AuthoredBlock[];
  theme?: DocumentTheme;
}

// ── Version control between documents ────────────────────────────────────────
// `version` counts editions of ONE document. This is the other axis: what a brand-new
// document does to the one that already covers the subject. COEXIST leaves both live;
// SUPERSEDE retires the old one, moves its placements onto the new one, and leaves a
// forwarding link so an old code still lands the reader on the current word.

export const replacementModes = ["COEXIST", "SUPERSEDE"] as const;
export const replacementModeSchema = z.enum(replacementModes);
export type ReplacementMode = z.infer<typeof replacementModeSchema>;

export const REPLACEMENT_MODE_TEXT: Record<
  ReplacementMode,
  { label: string; blurb: string }
> = {
  COEXIST: {
    label: "Publish alongside it",
    blurb:
      "Both documents stay live. Use this when the existing one still applies to somebody — a regional variant, an older product line, a different audience.",
  },
  SUPERSEDE: {
    label: "Replace it",
    blurb:
      "The existing document is retired: it leaves the library and every branch it was placed on receives this one instead. Its completion history is kept, and anyone opening the old reference is pointed here.",
  },
};

export const createCourseSchema = z.object({
  roleNodeId: z.string().uuid(), // uploading role — its number goes into the code
  kind: z.enum(["DOCUMENT", "BOOK", "LINK", "AUDIO", "VIDEO", "EXAM"]),
  title: z.string().min(2, "Title is too short").max(120),
  /** Short description — shown in the library and on the course's detail view. */
  description: z.string().min(8, "Describe the course in a sentence or two").max(500),
  /** Whether the course is discoverable in the organization library. */
  inLibrary: z.boolean().default(false),
  /** Dynamic shelf tag ("AI", "Safety", …) — the library groups similar tags together. */
  category: z.string().trim().max(40).optional(),
  /** Page-2 "scope" of the standardized document format. */
  scope: z.string().trim().max(2000).optional(),
  /** Compulsory organization-standard classification. */
  classification: z.enum(["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"], {
    errorMap: () => ({ message: "Pick the document's classification — it is compulsory" }),
  }),
  /** Owner-controlled: may members download the document from the preview? */
  allowDownload: z.boolean().default(false),
  /** LINK/AUDIO/VIDEO hosted elsewhere: external URL. */
  url: z.string().url().optional(),
  /** Files (≤ 10 MB) via the inline adapter — organizations without their own storage. */
  fileBase64: z.string().optional(),
  filename: z.string().max(200).optional(),
  mime: z.string().max(100).optional(),
  /**
   * An object the browser has already uploaded straight into the organization's own
   * storage (docs/structure.md §9.3). Carries no bytes — the upload never touched us.
   */
  storageObjectId: z.string().uuid().optional(),
  /** Studio-authored interactive document. */
  blocks: authoredBlocksSchema.optional(),
  /** Studio-authored MCQ exam (kind = EXAM) — questions plus the paper's rules. */
  exam: examBodySchema.optional(),
  /** The Studio document's theme, stored with the blocks. */
  theme: documentThemeSchema.optional(),
  deadlineDays: z.number().int().positive().max(3650).optional(),
  retakeEveryNDays: z.number().int().positive().max(3650).optional(),
  resetsCompletionOnUpdate: z.boolean().default(false),
  /** Course codes that must be completed first (hard prerequisites). */
  prerequisiteCodes: z.array(z.string()).max(20).default([]),
  /**
   * Version control against what is already on the shelves. When `replacesCourseCode` is
   * given, `replacementMode` decides whether the two coexist or the old one is retired
   * onto this one.
   */
  replacesCourseCode: z.string().trim().max(40).optional(),
  replacementMode: replacementModeSchema.default("COEXIST"),
  /** What this first edition is, in the author's words — opens the edition history. */
  versionNote: z.string().trim().max(500).optional(),
});
// z.input, not z.infer: fields with defaults stay optional for the caller, which is what
// makes adding a new defaulted property a non-breaking change for every publish form.
export type CreateCourseInput = z.input<typeof createCourseSchema>;

export const placeCourseSchema = z.object({
  roleNodeId: z.string().uuid(),
  mandatory: z.boolean(),
  inheritToDescendants: z.boolean(),
  /** Optional per-branch overrides of the course defaults. */
  deadlineDays: z.number().int().positive().max(3650).nullable().optional(),
  retakeEveryNDays: z.number().int().positive().max(3650).nullable().optional(),
});
export type PlaceCourseInput = z.infer<typeof placeCourseSchema>;

// ── Studio drafts (premium) ──────────────────────────────────────────────────
// A draft is the Studio's own work-in-progress record: the blocks plus the publish
// settings, parked on the server so the author can leave and come back from any device.
// It is NOT the member-proposal `Course.draft` flag — nothing is created in the library
// until the author publishes or submits for review.
//
// One shape covers both of the Studio's creation modes: `kind` says which was chosen, and
// the body it wrote lives in `blocks` (a document) or `exam` (an MCQ paper). Everything
// around it — classification, description, library shelf, placement — is identical, which
// is exactly why an exam is authored through the same publish settings a document is.

export const studioDocumentSchema = z.object({
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(500).default(""),
  scope: z.string().trim().max(2_000).default(""),
  category: z.string().trim().max(40).default(""),
  classification: z
    .enum(["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"])
    .nullable()
    .default(null),
  kind: z.enum(["DOCUMENT", "BOOK", "EXAM"]).default("DOCUMENT"),
  inLibrary: z.boolean().default(true),
  mandatory: z.boolean().default(false),
  inherit: z.boolean().default(true),
  resets: z.boolean().default(true),
  // ── Parity with an uploaded document ──────────────────────────────────────
  // Everything below used to be askable only on the upload form, which meant a document
  // written in the Studio could not be given a deadline, a recurrence, a prerequisite or
  // a download permission at all. The two creation routes describe the SAME kind of
  // object, so they carry the same properties (docs/structure.md §3.6).
  /** May readers download it from the viewer? */
  allowDownload: z.boolean().default(false),
  /** Days from placement within which it must be completed. */
  deadlineDays: z.number().int().positive().max(3650).nullable().default(null),
  /** Recurrence: completion expires this many days after it is granted. */
  retakeEveryNDays: z.number().int().positive().max(3650).nullable().default(null),
  /** Course codes that must be completed before this one unlocks. */
  prerequisiteCodes: z.array(z.string().trim().max(40)).max(20).default([]),
  /** Version control: what this replaces on the shelves, and how. */
  replacesCourseCode: z.string().trim().max(40).default(""),
  replacementMode: replacementModeSchema.default("COEXIST"),
  /** What changed in the edition about to be published. */
  versionNote: z.string().trim().max(500).default(""),
  theme: documentThemeSchema.default({}),
  blocks: z.array(authoredBlockSchema).max(400).default([]),
  /** kind = EXAM: the paper being written. Absent on document drafts. */
  exam: examBodySchema.optional(),
});
export type StudioDocument = z.infer<typeof studioDocumentSchema>;

// ── Publish readiness ────────────────────────────────────────────────────────
// One source of truth for "what must be filled in before this can be published, and WHY
// it is compulsory". The Studio's checklist, the upload composer and the properties
// editor all read this, so the rules — and the sentences explaining them — can never
// drift between the three places a document can be created or edited.

export type PublishCheckId =
  | "title"
  | "description"
  | "classification"
  | "content"
  | "shelf"
  | "scope"
  | "marking";

export interface PublishCheck {
  id: PublishCheckId;
  /** The field's name as the author sees it. */
  label: string;
  /** Compulsory checks block publishing; advisory ones are shown as warnings. */
  required: boolean;
  /** Satisfied right now? */
  ok: boolean;
  /** What to do about it — shown next to the highlighted field. */
  fix: string;
  /** WHY the platform insists on it — the tooltip body. */
  why: string;
}

/** The publish-time state a check runs against — both editors and the upload form fill it. */
export interface PublishSubject {
  title: string;
  description: string;
  scope: string;
  category: string;
  classification: Classification | null;
  /** Documents: blocks that survived the empty-block filter. Uploads: 1 when a file or
   *  link is attached. Exams: the question count. */
  contentCount: number;
  /** Exams only — questions whose marking is incomplete (no correct answer, etc.). */
  markingProblems?: string[];
  /** What the content is, for the wording of the "add some content" check. */
  noun?: "document" | "exam" | "upload";
}

const CONTENT_FIX: Record<NonNullable<PublishSubject["noun"]>, string> = {
  document: "Add at least one block with something in it — a heading, a paragraph, a table.",
  exam: "Add at least one question.",
  upload: "Attach a file or paste the address of the material.",
};

/**
 * Every publish rule, evaluated. Callers filter: `.filter(c => c.required && !c.ok)` is
 * what blocks publishing, the rest is advice.
 */
export function publishChecks(subject: PublishSubject): PublishCheck[] {
  const noun = subject.noun ?? "document";
  const checks: PublishCheck[] = [
    {
      id: "title",
      label: "Title",
      required: true,
      ok: subject.title.trim().length >= 2,
      fix: "Give it a title of at least two characters.",
      why: "The title is printed on the standard cover page, listed in the library and quoted in every compliance reminder. An untitled document cannot be found again by the people who have to read it.",
    },
    {
      id: "classification",
      label: "Classification",
      required: true,
      ok: !!subject.classification,
      fix: "Choose Public, Confidential, Private or Secret.",
      why: "Classification is the organization's handling instruction. It prints on the cover, the header strip and the footer of every page, and it decides how the document may be shared or downloaded. Nothing publishes without one — an unclassified document in a compliance vault is a liability.",
    },
    {
      id: "description",
      label: "Description",
      required: true,
      ok: subject.description.trim().length >= 8,
      fix: "Write a sentence or two — at least 8 characters.",
      why: "The description becomes page two of the standard format and the summary line in the library. It is how a member decides whether this is the thing they were looking for before they open it.",
    },
    {
      id: "content",
      label: noun === "upload" ? "File or link" : "Content",
      required: true,
      ok: subject.contentCount > 0,
      fix: CONTENT_FIX[noun],
      why: "A published document reaches real people and may be made mandatory for them. Publishing an empty one puts an unfinishable item on somebody's compliance list.",
    },
    {
      id: "shelf",
      label: "Library shelf",
      required: false,
      ok: subject.category.trim().length > 0,
      fix: "Tag it with a shelf, or pick one of the suggestions.",
      why: "The shelf tag is what groups this with related material in the library. Without one it lands under “Uncategorised”, where nobody browses.",
    },
    {
      id: "scope",
      label: "Scope",
      required: false,
      ok: subject.scope.trim().length > 0,
      fix: "Say who it applies to and what it covers.",
      why: "Scope prints under the description on page two. It is the difference between a reader knowing this applies to them and a reader guessing.",
    },
  ];

  if (noun === "exam") {
    const problems = subject.markingProblems ?? [];
    checks.push({
      id: "marking",
      label: "Marking",
      required: true,
      ok: problems.length === 0,
      fix: problems[0] ?? "Every question needs a correct answer and a mark.",
      why: "The server marks the paper and writes the completion record from it. A question with no correct answer cannot be marked, so the candidate could never pass.",
    });
  }
  return checks;
}

/** The blocking problems, in the order the author should fix them. */
export function publishBlockers(subject: PublishSubject): PublishCheck[] {
  return publishChecks(subject).filter((c) => c.required && !c.ok);
}

export const saveStudioDraftSchema = z.object({
  /** Present when overwriting a draft the author already saved. */
  id: z.string().uuid().optional(),
  roleNodeId: z.string().uuid(),
  document: studioDocumentSchema,
});
export type SaveStudioDraftInput = z.infer<typeof saveStudioDraftSchema>;

/** A saved draft as listed in the Studio's "Your drafts" tray. */
export interface StudioDraftSummary {
  id: string;
  roleNodeId: string;
  roleName: string;
  /** Which Studio mode wrote it — each editor lists only the drafts it can open. */
  kind: StudioDocument["kind"];
  title: string;
  /** Blocks in a document draft; questions in an exam draft. */
  blockCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface StudioDraftView extends StudioDraftSummary {
  document: StudioDocument;
}

export const grantAdminAccessSchema = z.object({
  username: z.string().min(1),
  level: z.enum(["VIEW", "EDIT"]),
  canGrant: z.boolean().default(false),
});
export type GrantAdminAccessInput = z.infer<typeof grantAdminAccessSchema>;

export const updateCourseSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().min(8).max(500).optional(),
  scope: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(40).nullable().optional(),
  classification: z.enum(["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"]).optional(),
  inLibrary: z.boolean().optional(),
  resetsCompletionOnUpdate: z.boolean().optional(),
  allowDownload: z.boolean().optional(),
  /** Course-wide defaults a branch placement may still override. */
  deadlineDays: z.number().int().positive().max(3650).nullable().optional(),
  retakeEveryNDays: z.number().int().positive().max(3650).nullable().optional(),
  /** The full prerequisite set, by code — an empty array clears them. */
  prerequisiteCodes: z.array(z.string().trim().max(40)).max(20).optional(),
  url: z.string().url().optional(),
  fileBase64: z.string().optional(),
  filename: z.string().max(200).optional(),
  mime: z.string().max(100).optional(),
  /** Swap in an object already uploaded to the organization's own storage (§9.3). */
  storageObjectId: z.string().uuid().optional(),
  blocks: authoredBlocksSchema.optional(),
  exam: examBodySchema.optional(),
  theme: documentThemeSchema.optional(),
  /** What changed — recorded against the edition this publish creates. */
  versionNote: z.string().trim().max(500).optional(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

/** One publication in a course's history — GET /courses/:code/editions. */
export interface CourseEditionView {
  version: number;
  /** How the edition is written wherever people see it (v1.0, v2.0 …). */
  label: string;
  note: string | null;
  source: "STUDIO" | "UPLOAD";
  resetCompletions: boolean;
  publishedBy: string;
  publishedAt: string;
  /** True for the edition currently in deployment. */
  current: boolean;
}

/** A course's whole version story: its editions and how it stands against its neighbours. */
export interface CourseHistoryView {
  code: string;
  title: string;
  version: number;
  withdrawn: boolean;
  archived: boolean;
  editions: CourseEditionView[];
  /** Set when this document replaced another one when it was published. */
  supersedes: { code: string; title: string } | null;
  /** Set once a newer document replaced this one — the forwarding pointer. */
  supersededBy: { code: string; title: string } | null;
  supersededAt: string | null;
}

export interface CourseInfo {
  code: string;
  title: string;
  kind: CourseKind;
  version: number;
  deadlineDays: number | null;
  retakeEveryNDays: number | null;
  prerequisiteCodes: string[];
}

/**
 * How a course's version is written wherever people see it. The stored number counts
 * publications (1, 2, 3 …); the label is the edition it names — v1.0, v2.0 — so a reader
 * can tell at a glance that what reaches them today is not what reached them last month.
 * Minor numbers are reserved: every publication is a full edition today.
 */
export function versionLabel(version: number): string {
  return `v${version}.0`;
}

/** A library entry: course metadata plus usage & completion signals for the detail view. */
export interface LibraryCourse {
  code: string;
  title: string;
  kind: CourseKind;
  description: string | null;
  category: string | null;
  classification: Classification;
  archived: boolean;
  /** Which edition is on the shelf — see versionLabel(). */
  version: number;
  uploaderRoleName: string;
  createdAt: string;
  /** How many people completed it (org-wide, across versions). */
  completedCount: number;
  /** Branch names the course is currently placed on. */
  usedIn: string[];
  /** Role-node IDs the course is placed on — used to spotlight them in the constellation. */
  usedInNodeIds: string[];
  /** Average rating (1–5) across reviews, null when unrated. */
  avgRating: number | null;
  ratingCount: number;
  // ── Where the viewer stands with it ───────────────────────────────────────
  // The library used to offer everyone the same "request this for my branch" form, even
  // when the course was already sitting in the reader's own My Learning. These three say
  // whether it already reaches them, so the card can open it instead of asking for it.
  /** Already reaches the signed-in member (placed on one of their branches, or inherited). */
  inMySpace: boolean;
  /** Which of their branches it arrives through. */
  reachesViaRoleNames: string[];
  /** Their completion state, when it reaches them. */
  myStatus: CompletionStatus | "AVAILABLE" | null;
  /** Branches the viewer holds that this course does NOT yet reach — the only ones worth
   *  requesting it for. Empty means there is nothing left to ask for. */
  requestableRoles: { roleNodeId: string; roleName: string; kind: "OWNER" | "MEMBER" }[];
  /** Retired by a newer document — the forwarding pointer shown on the card. */
  supersededByCode: string | null;
}

/** Compliance for ONE course across every branch it reaches — for its managers only. */
export interface CourseComplianceView {
  code: string;
  title: string;
  /** Mandatory on at least one placement. */
  mandatory: boolean;
  total: number;
  /** Completed & still valid. */
  compliant: number;
  usedIn: string[];
  compliantMembers: {
    profileId: string;
    displayName: string;
    username: string;
    viaRoleName: string;
    completedAt: string | null;
  }[];
  nonCompliantMembers: {
    profileId: string;
    displayName: string;
    username: string;
    viaRoleName: string;
    status: CompletionStatus | "AVAILABLE";
    overdue: boolean;
  }[];
}

export const reviewCourseSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().trim().max(1000).optional(),
});
export type ReviewCourseInput = z.infer<typeof reviewCourseSchema>;

export interface CourseReviewView {
  displayName: string;
  username: string;
  rating: number | null;
  comment: string | null;
  updatedAt: string;
}

/** Per-course compliance for a branch: who completed, who is pending/overdue. */
/** Why someone is not compliant — the sentence the compliance window shows a manager. */
export type ComplianceReason =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "OVERDUE"
  | "EXPIRED"
  | "PREREQUISITES"
  | "EXAM_FAILED"
  | "EXAM_ATTEMPTS_EXHAUSTED";

export const COMPLIANCE_REASON_TEXT: Record<ComplianceReason, string> = {
  NOT_STARTED: "Has not opened this yet",
  IN_PROGRESS: "Started, not finished",
  OVERDUE: "Past the deadline",
  EXPIRED: "Completed earlier — the record has since expired and must be redone",
  PREREQUISITES: "Blocked: a prerequisite course is still outstanding",
  EXAM_FAILED: "Sat the exam without reaching the pass mark",
  EXAM_ATTEMPTS_EXHAUSTED:
    "Has used every attempt the exam allows and cannot sit it again until a manager resets it",
};

export interface CompliancePerson {
  profileId: string;
  displayName: string;
  username: string;
  status: CompletionStatus | "AVAILABLE";
  overdue: boolean;
  /** Why they are not compliant, in one machine-readable token. */
  reason: ComplianceReason;
  /** Exams only: how the candidate stands against the attempt allowance. */
  attemptsUsed?: number;
  attemptsAllowed?: number | null;
  bestPercent?: number | null;
  /** True when only a manager's reset can let them try again. */
  resettable?: boolean;
}

export interface ComplianceCourse {
  code: string;
  title: string;
  mandatory: boolean;
  viaRoleName: string;
  /** EXAM courses expose the attempt allowance and the reset action. */
  isExam: boolean;
  total: number;
  compliant: number;
  pending: CompliancePerson[];
}

export interface ComplianceReport {
  roleId: string;
  roleName: string;
  /** Everyone in the branch's subtree the courses reach. */
  peopleCount: number;
  courses: ComplianceCourse[];
}

export interface LearningItem extends CourseInfo {
  mandatory: boolean;
  viaRoleName: string; // which placement reaches this user
  status: CompletionStatus | "AVAILABLE";
  completedAt: string | null;
  validUntil: string | null;
  /** Prerequisite codes not yet completed — non-empty blocks completion. */
  missingPrerequisites: string[];
  overdue: boolean;
  /** Standardized-document metadata for the viewer's cover & header/footer. */
  description: string | null;
  scope: string | null;
  classification: Classification;
  allowDownload: boolean;
  publishedAt: string;
  creatorName: string;
}

export interface MyLearningView {
  orgId: string;
  mandatory: LearningItem[];
  optIn: LearningItem[];
}

export interface CourseAdminView {
  course: CourseInfo & { createdAt: string; resetsCompletionOnUpdate: boolean };
  usage: {
    roleName: string;
    roleNumber: number;
    mandatory: boolean;
    inheritToDescendants: boolean;
  }[];
  access: { username: string; displayName: string; level: "VIEW" | "EDIT"; canGrant: boolean }[];
  myLevel: "VIEW" | "EDIT";
  completions: { total: number; completed: number; expired: number };
}

export interface AppNotification {
  id: string;
  kind: string;
  /** Org the event belongs to — lets the bell deep-link to the right place. */
  orgId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
