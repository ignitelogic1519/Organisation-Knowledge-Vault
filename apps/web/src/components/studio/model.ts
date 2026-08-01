"use client";

import type { AuthoredBlock, StudioDocument, TableCell } from "@vault/shared";

// The Studio's editing model: an id-stamped block list plus the pure helpers the editor
// works with (insert, move, duplicate, convert, table maths). Nothing here touches React
// or the DOM, so the reducer-ish operations stay easy to reason about.

export type BlockType = AuthoredBlock["type"];

/** A block while it is being edited — the stored shape plus a stable local id. */
export type EditorBlock = AuthoredBlock & { _id: string };

let sequence = 0;
export const newId = () => `b${Date.now().toString(36)}${(sequence++).toString(36)}`;

export const withId = (block: AuthoredBlock): EditorBlock => ({ ...block, _id: newId() });
export const stripId = ({ _id, ...block }: EditorBlock): AuthoredBlock => block;

export interface PaletteItem {
  type: BlockType;
  label: string;
  icon: string;
  hint: string;
  group: "Text" | "Data" | "Media" | "Layout";
}

export const PALETTE: PaletteItem[] = [
  { type: "heading", label: "Heading", icon: "H", hint: "Section title", group: "Text" },
  { type: "paragraph", label: "Text", icon: "¶", hint: "Rich paragraph", group: "Text" },
  { type: "checklist", label: "Checklist", icon: "☑", hint: "Steps to tick off", group: "Text" },
  { type: "card", label: "Callout", icon: "▤", hint: "Highlighted note", group: "Text" },
  { type: "quote", label: "Quote", icon: "❝", hint: "Pull quote with source", group: "Text" },
  { type: "code", label: "Code", icon: "‹›", hint: "Monospaced snippet", group: "Text" },
  { type: "table", label: "Table", icon: "▦", hint: "Edit rows & columns like a sheet", group: "Data" },
  { type: "toc", label: "Contents", icon: "☰", hint: "Built from your headings", group: "Data" },
  { type: "accordion", label: "Collapsible", icon: "⌄", hint: "Expandable panels & FAQs", group: "Data" },
  { type: "image", label: "Image", icon: "🖼", hint: "Picture with caption", group: "Media" },
  { type: "media", label: "Audio / video", icon: "▶", hint: "Player with speed & quality", group: "Media" },
  { type: "embed", label: "Embed", icon: "⧉", hint: "YouTube, Drive, Docs, Forms, Maps", group: "Media" },
  { type: "button", label: "Button", icon: "⬒", hint: "Call-to-action link", group: "Layout" },
  { type: "columns", label: "Columns", icon: "▥", hint: "Side-by-side sections", group: "Layout" },
  { type: "divider", label: "Divider", icon: "—", hint: "Section break", group: "Layout" },
  { type: "spacer", label: "Spacer", icon: "↕", hint: "Breathing room", group: "Layout" },
  { type: "pagebreak", label: "New page", icon: "⤓", hint: "Page turn with animation", group: "Layout" },
];

export const BLOCK_LABEL: Record<BlockType, string> = PALETTE.reduce(
  (acc, p) => ({ ...acc, [p.type]: p.label }),
  {} as Record<BlockType, string>,
);

export const emptyCell = (text = ""): TableCell => ({ text });

export const makeGrid = (rows: number, cols: number, header = true): TableCell[][] =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      header && r === 0 ? { text: `Column ${c + 1}`, bold: true } : emptyCell(),
    ),
  );

/** A brand-new block of the given type, pre-filled so the canvas is never blank. */
export function createBlock(type: BlockType, options?: { rows?: number; cols?: number }): EditorBlock {
  switch (type) {
    case "heading":
      return withId({ type, level: 2, html: "", style: { align: "left" } });
    case "paragraph":
      return withId({ type, html: "" });
    case "card":
      return withId({ type, title: "Note", html: "", variant: "info" });
    case "quote":
      return withId({ type, html: "", attribution: "", variant: "accent" });
    case "code":
      return withId({ type, html: "", language: "text" });
    case "checklist":
      return withId({ type, list: [{ text: "First step", checked: false }] });
    case "table":
      return withId({
        type,
        cells: makeGrid(options?.rows ?? 3, options?.cols ?? 3),
        table: { headerRow: true, striped: true, borders: "all", stickyHeader: true },
      });
    case "image":
      return withId({ type, style: { width: 80, float: "center" } });
    case "media":
      return withId({
        type,
        mediaKind: "video",
        media: { skippable: true, speedControl: true, defaultSpeed: 1, sources: [] },
        style: { width: 100 },
      });
    case "button":
      return withId({ type, title: "Read the policy", variant: "accent", style: { align: "left" } });
    case "columns":
      return withId({
        type,
        columns: [
          { title: "First", html: "" },
          { title: "Second", html: "" },
        ],
      });
    case "accordion":
      return withId({
        type,
        panels: [
          { title: "What does this cover?", html: "", open: true },
          { title: "Who does it apply to?", html: "", open: false },
        ],
      });
    case "toc":
      return withId({ type, title: "Contents", depth: 3 });
    case "embed":
      return withId({ type, embed: { height: 480, showSource: false }, style: { width: 100 } });
    case "spacer":
      return withId({ type, size: 32 });
    case "pagebreak":
      return withId({ type, transition: "slide", pageLabel: "" });
    case "divider":
    default:
      return withId({ type: "divider" });
  }
}

/** Types a block can be turned into without losing its text. */
export const CONVERTIBLE: Record<string, BlockType[]> = {
  heading: ["paragraph", "quote", "card"],
  paragraph: ["heading", "quote", "card", "code", "checklist", "table", "accordion"],
  quote: ["paragraph", "heading", "card"],
  card: ["paragraph", "quote", "heading"],
  code: ["paragraph"],
  checklist: ["paragraph", "table", "accordion"],
  table: ["checklist"],
  accordion: ["checklist", "paragraph"],
};

const stripTags = (html: string) =>
  html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Split pasted/typed text into a grid — tabs or commas make columns, lines make rows. */
export function textToGrid(text: string): TableCell[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : lines.some((l) => l.includes(",")) ? "," : "|";
  const grid = lines.map((line) => line.split(delimiter).map((cell) => emptyCell(cell.trim())));
  const width = Math.max(1, ...grid.map((r) => r.length));
  return grid.map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push(emptyCell());
    return padded;
  });
}

/** Convert a block to another type, carrying its content across as best it can. */
export function convertBlock(block: EditorBlock, to: BlockType): EditorBlock {
  const text = block.type === "table"
    ? (block.cells ?? []).map((r) => r.map((c) => c.text).join(" · ")).join("\n")
    : block.type === "checklist"
      ? (block.list ?? []).map((i) => i.text).join("\n")
      : block.type === "accordion"
        ? (block.panels ?? []).map((p) => p.title).join("\n")
        : stripTags(block.html ?? "");
  const base = createBlock(to);
  switch (to) {
    case "checklist":
      return {
        ...base,
        _id: block._id,
        list: text.split("\n").filter(Boolean).map((t) => ({ text: t.slice(0, 500), checked: false })),
      };
    case "table":
      return { ...base, _id: block._id, cells: textToGrid(text || "Column 1\tColumn 2") };
    case "accordion":
      return {
        ...base,
        _id: block._id,
        panels: text
          .split("\n")
          .filter(Boolean)
          .map((t, i) => ({ title: t.slice(0, 200), html: "", open: i === 0 })),
      };
    case "code":
      return { ...base, _id: block._id, html: text };
    case "heading":
      return { ...base, _id: block._id, level: block.level ?? 2, html: block.html ?? escapeHtml(text) };
    default:
      return { ...base, _id: block._id, html: block.html ?? escapeHtml(text), title: block.title };
  }
}

// ── List operations ──────────────────────────────────────────────────────────

export function insertAt(blocks: EditorBlock[], block: EditorBlock, index?: number): EditorBlock[] {
  const next = [...blocks];
  next.splice(index ?? next.length, 0, block);
  return next;
}

export function moveBlock(blocks: EditorBlock[], from: number, to: number): EditorBlock[] {
  if (from === to || from < 0 || from >= blocks.length) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(from < to ? to - 1 : to, 0, moved);
  return next;
}

export function duplicateAt(blocks: EditorBlock[], index: number): EditorBlock[] {
  const source = blocks[index];
  if (!source) return blocks;
  return insertAt(blocks, { ...structuredClone(stripId(source)), _id: newId() }, index + 1);
}

/** Group blocks into pages for the navigator (a pagebreak opens the next page). */
export interface EditorPage {
  index: number; // page number, 0-based
  label: string;
  transition: string;
  /** Index of the pagebreak block that opens this page (null for the first page). */
  breakAt: number | null;
  blockIds: string[];
}

export function editorPages(blocks: EditorBlock[]): EditorPage[] {
  const pages: EditorPage[] = [
    { index: 0, label: "Page 1", transition: "none", breakAt: null, blockIds: [] },
  ];
  blocks.forEach((b, i) => {
    if (b.type === "pagebreak") {
      pages.push({
        index: pages.length,
        label: b.pageLabel?.trim() || `Page ${pages.length + 1}`,
        transition: b.transition ?? "none",
        breakAt: i,
        blockIds: [],
      });
    } else {
      pages[pages.length - 1].blockIds.push(b._id);
    }
  });
  return pages;
}

/**
 * Move a whole page (its break plus everything up to the next break) to another position.
 * Page 0 has no break of its own, so it can't be moved — the rail only offers a grip on
 * pages that start with a break.
 */
export function movePage(blocks: EditorBlock[], from: number, to: number): EditorBlock[] {
  const pages = editorPages(blocks);
  const source = pages[from];
  if (!source || source.breakAt == null || from === to) return blocks;
  const end = pages[from + 1]?.breakAt ?? blocks.length;
  const slice = blocks.slice(source.breakAt, end);
  const rest = [...blocks.slice(0, source.breakAt), ...blocks.slice(end)];

  // Where does the destination page begin, once the moved slice is out of the way?
  const target = pages[to];
  let at: number;
  if (!target) at = rest.length;
  else if (target.breakAt == null) at = 0; // dropped above page 1 — not allowed, clamp below it
  else at = target.breakAt > source.breakAt ? target.breakAt - slice.length : target.breakAt;
  if (at <= 0) at = pages[1]?.breakAt ?? rest.length; // never before the first page's content

  return [...rest.slice(0, at), ...slice, ...rest.slice(at)];
}

/** Blocks worth publishing — empties are dropped so a stray card never ships. */
export function meaningfulBlocks(blocks: EditorBlock[]): AuthoredBlock[] {
  return blocks.map(stripId).filter((b) => {
    switch (b.type) {
      case "divider":
      case "spacer":
      case "pagebreak":
        return true;
      case "table":
        return (b.cells?.some((r) => r.some((c) => c.text.trim())) ?? false) || !!b.rows?.length;
      case "checklist":
        return (b.list?.some((i) => i.text.trim()) ?? false) || !!b.items?.length;
      case "image":
      case "media":
      case "button":
      case "embed":
        return !!b.url;
      case "toc":
        return true;
      case "accordion":
        return (b.panels ?? []).some((p) => p.title.trim() || stripTags(p.html ?? "").trim());
      case "columns":
        return (b.columns ?? []).some((c) => stripTags(c.html ?? "").trim() || c.title?.trim() || c.url);
      default:
        return !!stripTags(b.html ?? "").trim();
    }
  });
}

/** Reading statistics shown in the status bar. */
export function documentStats(blocks: EditorBlock[]) {
  let words = 0;
  for (const b of blocks) {
    const text =
      b.type === "table"
        ? (b.cells ?? []).flat().map((c) => c.text).join(" ")
        : b.type === "checklist"
          ? (b.list ?? []).map((i) => i.text).join(" ")
          : [
              stripTags(b.html ?? ""),
              b.title ?? "",
              (b.columns ?? []).map((c) => stripTags(c.html ?? "")).join(" "),
              (b.panels ?? []).map((p) => `${p.title} ${stripTags(p.html ?? "")}`).join(" "),
            ].join(" ");
    words += text.split(/\s+/).filter(Boolean).length;
  }
  return {
    words,
    blocks: blocks.length,
    pages: editorPages(blocks).length,
    minutes: Math.max(1, Math.round(words / 220)),
  };
}

/** The publish/draft metadata the Studio edits alongside the blocks. */
export type StudioMeta = Omit<StudioDocument, "blocks">;

export const EMPTY_META: StudioMeta = {
  title: "",
  description: "",
  scope: "",
  category: "",
  classification: null,
  kind: "DOCUMENT",
  inLibrary: true,
  mandatory: false,
  inherit: true,
  resets: true,
  theme: {},
};

/** The starter document a fresh Studio session opens with. */
export function starterBlocks(): EditorBlock[] {
  return [
    withId({ type: "heading", level: 1, html: "", style: { align: "left" } }),
    withId({ type: "paragraph", html: "" }),
  ];
}
