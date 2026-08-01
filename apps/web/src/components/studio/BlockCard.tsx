"use client";

import { useState } from "react";
import { resolveEmbed, EMBED_HELP } from "@vault/shared";
import { blockStyleToCss, DocumentEmbed, DocumentMedia, FONT_STACKS } from "../DocumentView";
import { grip, useDnd } from "./dnd";
import { RichText } from "./rich";
import { TableEditor } from "./TableEditor";
import {
  BLOCK_LABEL,
  CONVERTIBLE,
  type BlockType,
  type EditorBlock,
} from "./model";

// One block on the canvas: a card that shows the block roughly as it will print, with a
// hover rail for reordering, duplicating, converting and deleting it. Editing happens in
// place — there is no separate "form" for the content, only for its settings.

const TRANSITIONS = ["none", "fade", "slide", "push", "flip", "zoom", "reveal"] as const;

type ChecklistEntry = NonNullable<EditorBlock["list"]>[number];

function Field({
  label,
  children,
  grow,
}: {
  label: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <label className="studio-field" data-grow={!!grow}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function BlockBody({
  block,
  onChange,
  onInsertAfter,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
  onInsertAfter: () => void;
}) {
  const css = blockStyleToCss(block.style);
  const patch = (p: Partial<EditorBlock>) => onChange({ ...block, ...p } as EditorBlock);

  switch (block.type) {
    case "heading": {
      const level = block.level ?? 2;
      return (
        <RichText
          html={block.html ?? ""}
          onChange={(html) => patch({ html })}
          placeholder={level === 1 ? "Document title…" : "Section heading…"}
          className={`studio-heading-area studio-h${level}`}
          style={{ ...css, fontFamily: block.style?.font ? FONT_STACKS[block.style.font] : undefined }}
          singleLine
          onEnterBelow={onInsertAfter}
        />
      );
    }
    case "paragraph":
      return (
        <RichText
          html={block.html ?? ""}
          onChange={(html) => patch({ html })}
          placeholder="Write here — select any text and use the ribbon above to format it."
          style={css}
        />
      );
    case "card":
      return (
        <div className={`studio-callout doc-tone-${block.variant ?? "info"}`} style={css}>
          <div className="studio-inline-row">
            <input
              className="studio-input studio-input-title"
              placeholder="Callout title"
              value={block.title ?? ""}
              maxLength={200}
              onChange={(e) => patch({ title: e.target.value })}
            />
            <select
              className="studio-select"
              value={block.variant ?? "info"}
              onChange={(e) => patch({ variant: e.target.value as EditorBlock["variant"] })}
            >
              <option value="info">Information</option>
              <option value="success">Positive</option>
              <option value="warning">Caution</option>
              <option value="danger">Critical</option>
              <option value="accent">Accent</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <RichText
            html={block.html ?? ""}
            onChange={(html) => patch({ html })}
            placeholder="What should stand out here?"
          />
        </div>
      );
    case "quote":
      return (
        <div className="studio-quote" style={css}>
          <RichText
            html={block.html ?? ""}
            onChange={(html) => patch({ html })}
            placeholder="The quotation…"
          />
          <input
            className="studio-input studio-input-quiet"
            placeholder="Attribution (person, policy, standard)"
            value={block.attribution ?? ""}
            maxLength={160}
            onChange={(e) => patch({ attribution: e.target.value })}
          />
        </div>
      );
    case "code":
      return (
        <div className="studio-code">
          <input
            className="studio-input studio-input-quiet studio-code-lang"
            placeholder="Language label (bash, json, …)"
            value={block.language ?? ""}
            maxLength={24}
            onChange={(e) => patch({ language: e.target.value })}
          />
          <textarea
            className="studio-input studio-code-area"
            rows={Math.min(18, Math.max(4, (block.html ?? "").split("\n").length + 1))}
            spellCheck={false}
            placeholder="Paste the snippet — it is stored and shown exactly as typed."
            value={block.html ?? ""}
            onChange={(e) => patch({ html: e.target.value })}
          />
        </div>
      );
    case "checklist": {
      const list: ChecklistEntry[] = block.list?.length
        ? block.list
        : (block.items ?? []).map((text) => ({ text }));
      const setList = (next: ChecklistEntry[]) => patch({ list: next, items: undefined });
      return (
        <div className="studio-checklist" style={css}>
          {list.map((item, i) => (
            <div className="studio-check-row" key={i}>
              <input
                type="checkbox"
                checked={!!item.checked}
                title="Pre-ticked for the reader"
                onChange={(e) =>
                  setList(list.map((x, xi) => (xi === i ? { ...x, checked: e.target.checked } : x)))
                }
              />
              <input
                className="studio-input"
                value={item.text}
                maxLength={500}
                placeholder="Step to complete"
                onChange={(e) =>
                  setList(list.map((x, xi) => (xi === i ? { ...x, text: e.target.value } : x)))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = [...list];
                    next.splice(i + 1, 0, { text: "", checked: false });
                    setList(next);
                  }
                  if (e.key === "Backspace" && !item.text && list.length > 1) {
                    e.preventDefault();
                    setList(list.filter((_, xi) => xi !== i));
                  }
                }}
              />
              <input
                className="studio-input studio-input-quiet studio-check-hint"
                value={item.hint ?? ""}
                maxLength={200}
                placeholder="Hint (optional)"
                onChange={(e) =>
                  setList(list.map((x, xi) => (xi === i ? { ...x, hint: e.target.value } : x)))
                }
              />
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove step"
                onClick={() => setList(list.filter((_, xi) => xi !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => setList([...list, { text: "", checked: false }])}
          >
            + Add step
          </button>
        </div>
      );
    }
    case "table":
      return (
        <TableEditor
          cells={block.cells ?? (block.rows ?? []).map((r) => r.map((text) => ({ text })))}
          options={block.table ?? { headerRow: true }}
          onChange={({ cells, table }) =>
            // `rows` is kept in step so an older viewer still renders the table
            patch({ cells, table, rows: cells.map((r) => r.map((c) => c.text)) })
          }
        />
      );
    case "image":
      return (
        <div className="studio-media-edit">
          <div className="studio-inline-row">
            <input
              className="studio-input"
              type="url"
              placeholder="https://… image address"
              value={block.url ?? ""}
              onChange={(e) => patch({ url: e.target.value })}
            />
            <input
              className="studio-input studio-input-quiet"
              placeholder="Caption"
              maxLength={300}
              value={block.caption ?? ""}
              onChange={(e) => patch({ caption: e.target.value })}
            />
          </div>
          {block.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="studio-media-preview" src={block.url} alt={block.caption ?? ""} style={css} />
          ) : (
            <p className="studio-drop-hint">Paste an image address to preview it here.</p>
          )}
        </div>
      );
    case "media":
      return (
        <div className="studio-media-edit">
          <div className="studio-inline-row">
            <select
              className="studio-select"
              value={block.mediaKind ?? "video"}
              onChange={(e) => patch({ mediaKind: e.target.value as "audio" | "video" })}
            >
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
            <input
              className="studio-input"
              type="url"
              placeholder="https://… media address"
              value={block.url ?? ""}
              onChange={(e) => patch({ url: e.target.value })}
            />
          </div>
          {block.url ? (
            <DocumentMedia
              url={block.url}
              kind={block.mediaKind === "audio" ? "audio" : "video"}
              options={block.media}
              caption={block.caption}
              style={block.style}
            />
          ) : (
            <p className="studio-drop-hint">
              Add the media address — playback speed, quality ladder and skip rules are set in
              the panel on the right.
            </p>
          )}
        </div>
      );
    case "button":
      return (
        <div className="studio-inline-row" style={{ textAlign: block.style?.align }}>
          <input
            className="studio-input studio-input-title"
            placeholder="Button label"
            maxLength={200}
            value={block.title ?? ""}
            onChange={(e) => patch({ title: e.target.value })}
          />
          <input
            className="studio-input"
            type="url"
            placeholder="https://… destination"
            value={block.url ?? ""}
            onChange={(e) => patch({ url: e.target.value })}
          />
          <select
            className="studio-select"
            value={block.variant ?? "accent"}
            onChange={(e) => patch({ variant: e.target.value as EditorBlock["variant"] })}
          >
            <option value="accent">Solid</option>
            <option value="neutral">Quiet</option>
            <option value="info">Information</option>
            <option value="success">Positive</option>
            <option value="warning">Caution</option>
            <option value="danger">Critical</option>
          </select>
        </div>
      );
    case "columns": {
      const columns = block.columns ?? [];
      const setColumns = (next: typeof columns) => patch({ columns: next });
      /** Drag the divider between two columns to rebalance their widths. */
      const startResize = (e: React.PointerEvent, i: number) => {
        e.preventDefault();
        const row = (e.currentTarget as HTMLElement).closest(".studio-columns") as HTMLElement | null;
        if (!row) return;
        const total = row.getBoundingClientRect().width;
        const even = Math.round(100 / columns.length);
        const left = columns[i]?.width ?? even;
        const right = columns[i + 1]?.width ?? even;
        const startX = e.clientX;
        const move = (ev: PointerEvent) => {
          const delta = Math.round(((ev.clientX - startX) / total) * 100);
          const nextLeft = Math.min(90, Math.max(10, left + delta));
          const nextRight = Math.min(90, Math.max(10, right - delta));
          setColumns(
            columns.map((c, ci) =>
              ci === i ? { ...c, width: nextLeft } : ci === i + 1 ? { ...c, width: nextRight } : c,
            ),
          );
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      };
      return (
        <div className="studio-columns" data-count={columns.length}>
          {columns.map((col, i) => (
            <div
              className="studio-column"
              key={i}
              style={col.width ? { flex: `0 0 calc(${col.width}% - 0.6rem)` } : undefined}
            >
              <div className="studio-column-head">
                <input
                  className="studio-input studio-input-quiet"
                  placeholder={`Column ${i + 1} title`}
                  value={col.title ?? ""}
                  maxLength={200}
                  onChange={(e) =>
                    setColumns(columns.map((c, ci) => (ci === i ? { ...c, title: e.target.value } : c)))
                  }
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove column"
                  disabled={columns.length <= 1}
                  onClick={() => setColumns(columns.filter((_, ci) => ci !== i))}
                >
                  ✕
                </button>
              </div>
              <input
                className="studio-input studio-input-quiet"
                type="url"
                placeholder="Image address (optional)"
                value={col.url ?? ""}
                onChange={(e) =>
                  setColumns(columns.map((c, ci) => (ci === i ? { ...c, url: e.target.value || undefined } : c)))
                }
              />
              <RichText
                html={col.html ?? ""}
                onChange={(html) => setColumns(columns.map((c, ci) => (ci === i ? { ...c, html } : c)))}
                placeholder="Column text…"
              />
              {i < columns.length - 1 && (
                <span
                  className="studio-column-resize"
                  title="Drag to rebalance the columns"
                  onPointerDown={(e) => startResize(e, i)}
                />
              )}
            </div>
          ))}
          {columns.length < 4 && (
            <button
              type="button"
              className="studio-column-add"
              onClick={() => setColumns([...columns, { title: "", html: "" }])}
            >
              + Column
            </button>
          )}
        </div>
      );
    }
    case "accordion": {
      const panels = block.panels ?? [];
      const setPanels = (next: typeof panels) => patch({ panels: next });
      return (
        <div className="studio-accordion" style={css}>
          {panels.map((panel, i) => (
            <div className="studio-panel" key={i}>
              <div className="studio-panel-head">
                <span className="studio-panel-caret" aria-hidden>
                  ▸
                </span>
                <input
                  className="studio-input studio-input-title"
                  placeholder={`Question or clause ${i + 1}`}
                  value={panel.title}
                  maxLength={200}
                  onChange={(e) =>
                    setPanels(panels.map((p, pi) => (pi === i ? { ...p, title: e.target.value } : p)))
                  }
                />
                <label className="studio-panel-open" title="Open when the reader arrives">
                  <input
                    type="checkbox"
                    checked={!!panel.open}
                    onChange={(e) =>
                      setPanels(panels.map((p, pi) => (pi === i ? { ...p, open: e.target.checked } : p)))
                    }
                  />
                  <span>open</span>
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove panel"
                  onClick={() => setPanels(panels.filter((_, pi) => pi !== i))}
                >
                  ✕
                </button>
              </div>
              <RichText
                html={panel.html ?? ""}
                onChange={(html) => setPanels(panels.map((p, pi) => (pi === i ? { ...p, html } : p)))}
                placeholder="The answer, shown when the reader expands this…"
              />
            </div>
          ))}
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => setPanels([...panels, { title: "", html: "", open: false }])}
          >
            + Add panel
          </button>
        </div>
      );
    }
    case "toc":
      return (
        <div className="studio-toc-edit" style={css}>
          <span className="studio-toc-mark">☰ Contents</span>
          <p className="auth-sub">
            Built automatically from this document&apos;s headings when a reader opens it.
          </p>
          <Field label="Include down to">
            <select
              className="studio-select"
              value={block.depth ?? 3}
              onChange={(e) => patch({ depth: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  Level {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Heading">
            <input
              className="studio-input studio-input-quiet"
              placeholder="Contents"
              maxLength={200}
              value={block.title ?? ""}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
        </div>
      );
    case "embed": {
      const resolved = block.url ? resolveEmbed(block.url) : null;
      return (
        <div className="studio-media-edit">
          <div className="studio-inline-row">
            <input
              className="studio-input"
              type="url"
              placeholder="Paste a YouTube, Drive, Docs, Forms, Maps or Calendar link"
              value={block.url ?? ""}
              onChange={(e) => patch({ url: e.target.value })}
            />
            <input
              className="studio-input studio-input-quiet"
              placeholder="Caption"
              maxLength={300}
              value={block.caption ?? ""}
              onChange={(e) => patch({ caption: e.target.value })}
            />
          </div>
          {resolved ? (
            <DocumentEmbed url={block.url ?? ""} options={block.embed} caption={block.caption} style={block.style} />
          ) : (
            <p className="studio-drop-hint" data-error={!!block.url}>
              {block.url ? `That address can't be embedded. ${EMBED_HELP}` : EMBED_HELP}
            </p>
          )}
        </div>
      );
    }
    case "spacer":
      return (
        <div className="studio-spacer-edit" style={{ height: `${block.size ?? 32}px` }}>
          <input
            type="range"
            min={4}
            max={200}
            value={block.size ?? 32}
            aria-label="Spacer height"
            onChange={(e) => patch({ size: Number(e.target.value) })}
          />
          <span className="auth-sub">{block.size ?? 32}px</span>
        </div>
      );
    case "pagebreak":
      return (
        <div className="studio-pagebreak">
          <span className="studio-pagebreak-mark">⤓ New page</span>
          <Field label="Page name">
            <input
              className="studio-input studio-input-quiet"
              placeholder="e.g. Appendix A"
              maxLength={80}
              value={block.pageLabel ?? ""}
              onChange={(e) => patch({ pageLabel: e.target.value })}
            />
          </Field>
          <Field label="Turn animation">
            <select
              className="studio-select"
              value={block.transition ?? "slide"}
              onChange={(e) => patch({ transition: e.target.value as EditorBlock["transition"] })}
            >
              {TRANSITIONS.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      );
    case "divider":
      return <hr className="doc-divider" style={css} />;
    default:
      return null;
  }
}

export function BlockCard({
  block,
  index,
  total,
  selected,
  onSelect,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  onConvert,
  onInsertAfter,
  dragging,
}: {
  block: EditorBlock;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: EditorBlock) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
  onConvert: (to: BlockType) => void;
  onInsertAfter: () => void;
  dragging: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dnd = useDnd();
  const conversions = CONVERTIBLE[block.type] ?? [];
  const label = BLOCK_LABEL[block.type] ?? block.type;
  const holdProps = grip(dnd, { kind: "move", zone: "canvas", id: block._id, index, label });

  return (
    <div
      className="studio-block"
      data-selected={selected}
      data-dragging={dragging}
      data-type={block.type}
      onMouseDown={onSelect}
      onFocusCapture={onSelect}
    >
      {/* The whole left edge is the grab area — a full-height strip, not a 12px dot. */}
      <div className="studio-block-grip" title={`Drag to move this ${label.toLowerCase()}`} {...holdProps}>
        <span className="studio-grip-dots" aria-hidden>
          ⠿
        </span>
        <span className="studio-block-kind">{label}</span>
      </div>

      <div className="studio-block-tools">
        <button
          type="button"
          className="icon-btn studio-tool-grab"
          title="Drag to move"
          aria-label="Drag to move this block"
          {...holdProps}
        >
          ⠿
        </button>
        <button type="button" className="icon-btn" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Move down"
          disabled={index >= total - 1}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
        <button type="button" className="icon-btn" title="Duplicate" onClick={onDuplicate}>
          ⧉
        </button>
        {conversions.length > 0 && (
          <div className="studio-tool-anchor">
            <button
              type="button"
              className="icon-btn"
              title="Turn into…"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ⇄
            </button>
            {menuOpen && (
              <div className="studio-convert-menu glass-strong">
                <span className="studio-convert-title">Turn into</span>
                {conversions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onConvert(t);
                      setMenuOpen(false);
                    }}
                  >
                    {BLOCK_LABEL[t] ?? t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button type="button" className="icon-btn icon-btn-danger" title="Delete block" onClick={onRemove}>
          ✕
        </button>
      </div>

      <div className="studio-block-content">
        <BlockBody block={block} onChange={onChange} onInsertAfter={onInsertAfter} />
      </div>
    </div>
  );
}
