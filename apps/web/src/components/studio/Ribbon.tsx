"use client";

import { useEffect, useRef, useState } from "react";
import type { BlockAlign } from "@vault/shared";
import { FONT_STACKS } from "../DocumentView";
import { useRichText } from "./rich";
import type { BlockType, EditorBlock } from "./model";

// The formatting ribbon — one bar that drives whichever block has the caret, plus the
// block-level controls (alignment, spacing) that apply to the selected card.

const FONT_CHOICES: { key: keyof typeof FONT_STACKS; label: string }[] = [
  { key: "sans", label: "Sans" },
  { key: "serif", label: "Serif" },
  { key: "mono", label: "Mono" },
  { key: "display", label: "Display" },
  { key: "hand", label: "Handwriting" },
];

const SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

const SWATCHES = [
  "#000000", "#3c4257", "#6b7280", "#9ca3af", "#d1d5db", "#ffffff",
  "#b91c1c", "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d",
  "#16a34a", "#059669", "#0d9488", "#0891b2", "#0284c7", "#2563eb",
  "#4f46e5", "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#e11d48",
];

const HIGHLIGHTS = [
  "transparent", "#fef08a", "#fde68a", "#bbf7d0", "#bfdbfe", "#e9d5ff",
  "#fecaca", "#fbcfe8", "#c7d2fe", "#a7f3d0", "#fed7aa", "#e5e7eb",
];

function Swatches({
  colors,
  onPick,
  onClose,
  title,
}: {
  colors: string[];
  onPick: (color: string) => void;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div className="studio-swatches glass-strong" ref={ref} onMouseDown={(e) => e.preventDefault()}>
      <span className="studio-swatch-title">{title}</span>
      <div className="studio-swatch-grid">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            className="studio-swatch"
            data-none={c === "transparent"}
            style={{ background: c }}
            title={c}
            onClick={() => {
              onPick(c);
              onClose();
            }}
          />
        ))}
      </div>
      <label className="studio-swatch-custom">
        <span>Custom</span>
        <input type="color" onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

function Tool({
  label,
  title,
  onClick,
  active,
  disabled,
  wide,
}: {
  label: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className="studio-tool"
      data-active={!!active}
      data-wide={!!wide}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function Ribbon({
  selected,
  onPatch,
  onInsert,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  zoom,
  onZoom,
}: {
  selected: EditorBlock | null;
  onPatch: (patch: Partial<EditorBlock>) => void;
  onInsert: (type: BlockType) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onZoom: (z: number) => void;
}) {
  const rich = useRichText();
  const [palette, setPalette] = useState<"text" | "highlight" | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");

  const style = selected?.style ?? {};
  const patchStyle = (patch: Record<string, unknown>) =>
    onPatch({ style: { ...style, ...patch } });

  /** Type controls apply to the selection when the caret is in text, else to the block. */
  const setFont = (font: keyof typeof FONT_STACKS) => {
    if (rich.focused) rich.applyStyle("font-family", FONT_STACKS[font]);
    else patchStyle({ font });
  };
  const setSize = (px: number) => {
    if (rich.focused) rich.applyStyle("font-size", `${px}px`);
    else patchStyle({ fontSize: px });
  };
  const setColor = (color: string) => {
    if (rich.focused) rich.applyStyle("color", color);
    else patchStyle({ color });
  };
  const setHighlight = (color: string) => {
    if (rich.focused) rich.applyStyle("background-color", color);
    else patchStyle({ background: color });
  };
  const setAlign = (align: BlockAlign) => {
    patchStyle({ align });
    const command = { left: "justifyLeft", center: "justifyCenter", right: "justifyRight", justify: "justifyFull" }[align];
    if (rich.focused) rich.exec(command);
  };

  return (
    <div className="studio-ribbon glass">
      <div className="studio-ribbon-group">
        <Tool label="↶" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo} />
        <Tool label="↷" title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo} />
      </div>

      <div className="studio-ribbon-group">
        <select
          className="studio-select"
          title="Paragraph style"
          value={selected?.type === "heading" ? `h${selected.level ?? 2}` : selected?.type === "paragraph" ? "p" : ""}
          disabled={!selected || !["heading", "paragraph"].includes(selected.type)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") onPatch({ type: "paragraph", level: undefined } as Partial<EditorBlock>);
            else onPatch({ type: "heading", level: Number(v.slice(1)) } as Partial<EditorBlock>);
          }}
        >
          <option value="">—</option>
          <option value="p">Normal text</option>
          <option value="h1">Title</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="h4">Minor heading</option>
        </select>
        <select
          className="studio-select"
          title="Font"
          value={style.font ?? "sans"}
          onChange={(e) => setFont(e.target.value as keyof typeof FONT_STACKS)}
        >
          {FONT_CHOICES.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="studio-select studio-select-narrow"
          title="Font size"
          value={style.fontSize ?? 16}
          onChange={(e) => setSize(Number(e.target.value))}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="studio-ribbon-group">
        <Tool label={<b>B</b>} title="Bold (Ctrl+B)" active={rich.state.bold} onClick={() => rich.exec("bold")} />
        <Tool label={<i>I</i>} title="Italic (Ctrl+I)" active={rich.state.italic} onClick={() => rich.exec("italic")} />
        <Tool label={<u>U</u>} title="Underline (Ctrl+U)" active={rich.state.underline} onClick={() => rich.exec("underline")} />
        <Tool label={<s>S</s>} title="Strikethrough" active={rich.state.strike} onClick={() => rich.exec("strikeThrough")} />
        <div className="studio-tool-anchor">
          <Tool
            label={<span className="studio-tool-color" style={{ borderBottomColor: style.color ?? "var(--text)" }}>A</span>}
            title="Text colour"
            onClick={() => setPalette(palette === "text" ? null : "text")}
          />
          {palette === "text" && (
            <Swatches title="Text colour" colors={SWATCHES} onPick={setColor} onClose={() => setPalette(null)} />
          )}
        </div>
        <div className="studio-tool-anchor">
          <Tool
            label={<span className="studio-tool-color" style={{ borderBottomColor: style.background ?? "#fef08a" }}>▨</span>}
            title="Highlight"
            onClick={() => setPalette(palette === "highlight" ? null : "highlight")}
          />
          {palette === "highlight" && (
            <Swatches title="Highlight" colors={HIGHLIGHTS} onPick={setHighlight} onClose={() => setPalette(null)} />
          )}
        </div>
      </div>

      <div className="studio-ribbon-group">
        <Tool label="⯇" title="Align left" active={style.align === "left"} onClick={() => setAlign("left")} />
        <Tool label="≡" title="Align centre" active={style.align === "center"} onClick={() => setAlign("center")} />
        <Tool label="⯈" title="Align right" active={style.align === "right"} onClick={() => setAlign("right")} />
        <Tool label="☰" title="Justify" active={style.align === "justify"} onClick={() => setAlign("justify")} />
      </div>

      <div className="studio-ribbon-group">
        <Tool label="•" title="Bulleted list" active={rich.state.bullets} onClick={() => rich.exec("insertUnorderedList")} />
        <Tool label="1." title="Numbered list" active={rich.state.numbers} onClick={() => rich.exec("insertOrderedList")} />
        <Tool label="⇤" title="Decrease indent" onClick={() => rich.exec("outdent")} />
        <Tool label="⇥" title="Increase indent" onClick={() => rich.exec("indent")} />
      </div>

      <div className="studio-ribbon-group">
        <div className="studio-tool-anchor">
          <Tool label="🔗" title="Insert link" active={rich.state.link} onClick={() => setLinkOpen((v) => !v)} />
          {linkOpen && (
            <form
              className="studio-link-pop glass-strong"
              onMouseDown={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (/^https?:\/\/\S+$/i.test(linkUrl)) rich.exec("createLink", linkUrl);
                setLinkOpen(false);
              }}
            >
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                aria-label="Link address"
              />
              <button className="btn btn-primary btn-small" type="submit">
                Link
              </button>
              <button
                className="btn btn-quiet btn-small"
                type="button"
                onClick={() => {
                  rich.exec("unlink");
                  setLinkOpen(false);
                }}
              >
                Remove
              </button>
            </form>
          )}
        </div>
        <Tool label="⌫ᶠ" title="Clear formatting" onClick={rich.clearFormatting} />
      </div>

      <div className="studio-ribbon-group">
        <Tool label="▦" title="Insert table" onClick={() => onInsert("table")} />
        <Tool label="🖼" title="Insert image" onClick={() => onInsert("image")} />
        <Tool label="▶" title="Insert audio or video" onClick={() => onInsert("media")} />
        <Tool label="⤓" title="Insert page break" onClick={() => onInsert("pagebreak")} />
      </div>

      <div className="studio-ribbon-group studio-ribbon-end">
        <select
          className="studio-select studio-select-narrow"
          title="Zoom"
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
        >
          {[70, 85, 100, 115, 130, 150].map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
