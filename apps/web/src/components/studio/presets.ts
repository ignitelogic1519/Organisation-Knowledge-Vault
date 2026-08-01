"use client";

import type { DocumentTheme } from "@vault/shared";
import { createBlock, withId, type EditorBlock } from "./model";

// Themes and starter templates — the two things that let an author open the Studio and
// have a presentable document in seconds instead of a blank page.

export interface ThemePreset {
  key: string;
  name: string;
  blurb: string;
  theme: DocumentTheme;
}

/**
 * A theme sets the whole document at once, the way a site theme does: type pairing,
 * accent, paper, measure and how headings are set. Stored with the document, so the
 * reader sees exactly what the author chose.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "vault",
    name: "Vault",
    blurb: "The organization's own palette",
    theme: { preset: "vault", bodyFont: "sans", headingFont: "sans", density: "normal", headingStyle: "plain", measure: 46 },
  },
  {
    key: "policy",
    name: "Policy",
    blurb: "Serif body, ruled headings — formal documents",
    theme: {
      preset: "policy",
      bodyFont: "serif",
      headingFont: "sans",
      accent: "#1f3a8a",
      density: "relaxed",
      headingStyle: "underlined",
      measure: 44,
    },
  },
  {
    key: "handbook",
    name: "Handbook",
    blurb: "Warm and roomy — onboarding & guides",
    theme: {
      preset: "handbook",
      bodyFont: "sans",
      headingFont: "display",
      accent: "#b45309",
      paper: "#fffdf7",
      ink: "#2b2418",
      density: "relaxed",
      headingStyle: "accented",
      measure: 42,
    },
  },
  {
    key: "technical",
    name: "Technical",
    blurb: "Tight, mono headings — runbooks & specs",
    theme: {
      preset: "technical",
      bodyFont: "sans",
      headingFont: "mono",
      accent: "#0f766e",
      density: "compact",
      headingStyle: "uppercase",
      measure: 52,
    },
  },
  {
    key: "briefing",
    name: "Briefing",
    blurb: "High contrast, wide measure — decks & reports",
    theme: {
      preset: "briefing",
      bodyFont: "sans",
      headingFont: "display",
      accent: "#7c3aed",
      density: "normal",
      headingStyle: "accented",
      measure: 58,
    },
  },
];

export interface Template {
  key: string;
  name: string;
  icon: string;
  blurb: string;
  theme?: DocumentTheme;
  build: () => EditorBlock[];
}

const heading = (html: string, level = 2): EditorBlock =>
  withId({ type: "heading", level, html, style: { align: "left" } });
const text = (html: string): EditorBlock => withId({ type: "paragraph", html });

/** Starter documents — the author edits rather than stares at an empty page. */
export const TEMPLATES: Template[] = [
  {
    key: "blank",
    name: "Blank",
    icon: "▢",
    blurb: "Start from nothing",
    build: () => [heading("", 1), text("")],
  },
  {
    key: "policy",
    name: "Policy",
    icon: "§",
    blurb: "Purpose, scope, rules, exceptions",
    theme: THEME_PRESETS[1].theme,
    build: () => [
      heading("Policy title", 1),
      withId({ type: "toc", title: "Contents", depth: 3 }),
      heading("Purpose"),
      text("Why this policy exists and what it protects."),
      heading("Who it applies to"),
      text("Every colleague in the branches this document reaches."),
      heading("The rules"),
      withId({
        type: "checklist",
        list: [
          { text: "Rule one", checked: false },
          { text: "Rule two", checked: false },
        ],
      }),
      withId({
        type: "card",
        variant: "warning",
        title: "Exceptions",
        html: "How to request an exception, and who decides.",
      }),
      heading("Questions"),
      withId({
        type: "accordion",
        panels: [
          { title: "Who owns this policy?", html: "", open: true },
          { title: "How often is it reviewed?", html: "", open: false },
        ],
      }),
    ],
  },
  {
    key: "sop",
    name: "Procedure",
    icon: "☑",
    blurb: "Step-by-step with a checklist and a table",
    theme: THEME_PRESETS[3].theme,
    build: () => [
      heading("Procedure name", 1),
      withId({ type: "card", variant: "info", title: "Before you start", html: "What you need to hand." }),
      heading("Steps"),
      withId({
        type: "checklist",
        list: [
          { text: "First step", checked: false, hint: "What \u201Cdone\u201D looks like" },
          { text: "Second step", checked: false },
          { text: "Third step", checked: false },
        ],
      }),
      heading("Who does what"),
      withId({
        type: "table",
        cells: [
          [{ text: "Step", bold: true }, { text: "Owner", bold: true }, { text: "Evidence", bold: true }],
          [{ text: "" }, { text: "" }, { text: "" }],
          [{ text: "" }, { text: "" }, { text: "" }],
        ],
        table: { headerRow: true, striped: true, borders: "all", stickyHeader: true },
      }),
    ],
  },
  {
    key: "handbook",
    name: "Handbook",
    icon: "📕",
    blurb: "Multi-page book with contents and pages",
    theme: THEME_PRESETS[2].theme,
    build: () => [
      heading("Handbook title", 1),
      text("A sentence about who this is for."),
      withId({ type: "toc", title: "In this handbook", depth: 2 }),
      withId({ type: "pagebreak", transition: "slide", pageLabel: "Welcome" }),
      heading("Welcome", 1),
      text("Set the tone here."),
      withId({ type: "pagebreak", transition: "slide", pageLabel: "How we work" }),
      heading("How we work", 1),
      withId({
        type: "columns",
        columns: [
          { title: "Ways of working", html: "" },
          { title: "Where to ask", html: "" },
        ],
      }),
    ],
  },
  {
    key: "training",
    name: "Training",
    icon: "▶",
    blurb: "Video that must be watched, then a check",
    build: () => [
      heading("Training title", 1),
      text("What you will know by the end."),
      withId({
        type: "media",
        mediaKind: "video",
        media: { skippable: false, speedControl: true, defaultSpeed: 1, trackCompletion: true, sources: [] },
        style: { width: 100 },
        caption: "Watch this in full",
      }),
      heading("Check your understanding"),
      withId({
        type: "accordion",
        panels: [
          { title: "Question 1", html: "The answer.", open: false },
          { title: "Question 2", html: "The answer.", open: false },
        ],
      }),
    ],
  },
  {
    key: "announcement",
    name: "Announcement",
    icon: "📣",
    blurb: "Short, with a call to action",
    theme: THEME_PRESETS[4].theme,
    build: () => [
      heading("What's changing", 1),
      withId({ type: "card", variant: "accent", title: "In one line", html: "The headline." }),
      heading("What it means for you"),
      withId({
        type: "columns",
        columns: [
          { title: "Before", html: "" },
          { title: "After", html: "" },
        ],
      }),
      heading("What to do next"),
      withId({ type: "button", title: "Open the details", variant: "accent", style: { align: "left" } }),
    ],
  },
];

/** Device widths for the preview switcher. */
export const DEVICES = [
  { key: "desktop", label: "Desktop", icon: "🖥", width: null as number | null },
  { key: "tablet", label: "Tablet", icon: "▭", width: 820 },
  { key: "phone", label: "Phone", icon: "▯", width: 420 },
];

export const starterFor = (key: string): { blocks: EditorBlock[]; theme?: DocumentTheme } => {
  const template = TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
  return { blocks: template.build(), theme: template.theme };
};

export const blankStarter = (): EditorBlock[] => [createBlock("heading"), createBlock("paragraph")];
