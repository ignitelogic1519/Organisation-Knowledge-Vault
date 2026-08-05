"use client";

import { useMemo, useRef } from "react";
import type { DocumentTheme } from "@vault/shared";
import { themeToCss } from "../DocumentView";
import { BlockCard } from "./BlockCard";
import { useDnd, useDropZone } from "./dnd";
import { TEMPLATES } from "./presets";
import type { BlockType, EditorBlock } from "./model";

// The paper. It owns the canvas drop zone, so the insertion line is computed from the
// block cards themselves — which means dropping lands exactly where the line was drawn.

export function Canvas({
  blocks,
  theme,
  orgName,
  title,
  zoom,
  selectedId,
  blockEls,
  showTemplates,
  onSelect,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  onConvert,
  onInsertAfter,
  onInsert,
  onAddPage,
  onUseTemplate,
}: {
  blocks: EditorBlock[];
  theme?: DocumentTheme;
  orgName: string;
  title: string;
  zoom: number;
  selectedId: string | null;
  blockEls: React.RefObject<Record<string, HTMLElement | null>>;
  /** True while the document is still untouched — offer a starting point. */
  showTemplates: boolean;
  onSelect: (id: string | null) => void;
  onChange: (block: EditorBlock) => void;
  onRemove: (id: string) => void;
  onDuplicate: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onConvert: (id: string, to: BlockType) => void;
  onInsertAfter: (index: number) => void;
  onInsert: (type: BlockType) => void;
  onAddPage: () => void;
  onUseTemplate: (key: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { drag } = useDnd();
  const order = useMemo(() => blocks.map((b) => b._id), [blocks]);
  const dropIndex = useDropZone({ zone: "canvas", zoneRef: canvasRef, itemEls: blockEls, order });
  const draggingId = drag?.payload.kind === "move" ? drag.payload.id : null;

  return (
    // `data-check`: where the publish checklist scrolls to for the "content" item.
    <div className="studio-canvas" ref={canvasRef} data-check="content" data-dropping={dropIndex !== null}>
      <div
        className="studio-canvas-sheet"
        data-density={theme?.density ?? "normal"}
        data-headings={theme?.headingStyle ?? "plain"}
        style={{ zoom: `${zoom}%`, ...themeToCss(theme) } as React.CSSProperties}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        <div className="studio-canvas-cover">
          <span className="doc-cover-org">{orgName}</span>
          <h1>{title || "Untitled document"}</h1>
          <p className="auth-sub">
            Cover, classification header and footer are added automatically when this document
            is published.
          </p>
        </div>

        {showTemplates && (
          <div className="studio-templates">
            <h3>Start from a template</h3>
            <p className="auth-sub">Each one is a real document you edit — nothing is locked.</p>
            <div className="studio-template-grid">
              {TEMPLATES.map((t) => (
                <button key={t.key} type="button" className="studio-template" onClick={() => onUseTemplate(t.key)}>
                  <span className="studio-template-icon" aria-hidden>
                    {t.icon}
                  </span>
                  <span className="studio-template-name">{t.name}</span>
                  <span className="studio-template-blurb">{t.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {blocks.length === 0 && !showTemplates && (
          <p className="auth-sub studio-empty">
            Drag a block from the left, or click one to add it here.
          </p>
        )}

        {blocks.map((block, index) => (
          <div
            key={block._id}
            className="studio-block-slot"
            ref={(el) => {
              blockEls.current[block._id] = el;
            }}
          >
            {dropIndex === index && <div className="studio-drop-line" aria-hidden />}
            <BlockCard
              block={block}
              index={index}
              total={blocks.length}
              selected={selectedId === block._id}
              dragging={draggingId === block._id}
              onSelect={() => onSelect(block._id)}
              onChange={onChange}
              onRemove={() => onRemove(block._id)}
              onDuplicate={() => onDuplicate(index)}
              onMove={(delta) => onMove(index, delta)}
              onConvert={(to) => onConvert(block._id, to)}
              onInsertAfter={() => onInsertAfter(index)}
            />
          </div>
        ))}
        {dropIndex === blocks.length && <div className="studio-drop-line" aria-hidden />}

        <div className="studio-add-row">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onInsert("paragraph")}>
            + Text
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onInsert("heading")}>
            + Heading
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onInsert("table")}>
            + Table
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => onInsert("accordion")}>
            + Collapsible
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={onAddPage}>
            + Page
          </button>
        </div>
      </div>
    </div>
  );
}
