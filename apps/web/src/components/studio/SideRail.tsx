"use client";

import { useRef, useState } from "react";
import type { StudioDraftSummary } from "@vault/shared";
import { DraftsTray } from "./DraftsTray";
import { grip, useDnd, useDropZone } from "./dnd";
import { PALETTE, type BlockType, type EditorPage } from "./model";

// The left rail: what you can add (Insert), how the document is paginated (Pages), and the
// drafts parked on the server (Drafts). Palette entries are draggable onto the canvas and
// clickable for "append at the end".

const GROUPS: ("Text" | "Data" | "Media" | "Layout")[] = ["Text", "Data", "Media", "Layout"];

/** Google-Docs-style size picker: hover the grid, click to insert that many rows/columns. */
function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ r: 0, c: 0 });
  return (
    <div className="studio-table-picker">
      <div className="studio-table-grid" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
        {Array.from({ length: 6 }).map((_, r) =>
          Array.from({ length: 6 }).map((__, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              data-on={r < hover.r && c < hover.c}
              onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
              onClick={() => onPick(r + 1, c + 1)}
              aria-label={`${r + 1} by ${c + 1} table`}
            />
          )),
        )}
      </div>
      <span className="auth-sub">
        {hover.r ? `${hover.r} × ${hover.c} table` : "Pick a size"}
      </span>
    </div>
  );
}

export function SideRail({
  tab,
  onTab,
  onInsert,
  onInsertTable,
  pages,
  activePage,
  onGoToPage,
  onAddPage,
  onRemovePage,
  onPageTransition,
  drafts,
  draftsEnabled,
  currentDraftId,
  onOpenDraft,
  onDeleteDraft,
  onNewDocument,
}: {
  tab: "insert" | "pages" | "drafts";
  onTab: (t: "insert" | "pages" | "drafts") => void;
  onInsert: (type: BlockType) => void;
  onInsertTable: (rows: number, cols: number) => void;
  pages: EditorPage[];
  activePage: number;
  onGoToPage: (index: number) => void;
  onAddPage: () => void;
  onRemovePage: (index: number) => void;
  onPageTransition: (index: number, transition: string) => void;
  drafts: StudioDraftSummary[];
  draftsEnabled: boolean;
  currentDraftId: string | null;
  onOpenDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  onNewDocument: () => void;
}) {
  const dnd = useDnd();
  const railRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Record<string, HTMLElement | null>>({});
  const pageDrop = useDropZone({
    zone: "pages",
    zoneRef: railRef,
    itemEls: pageEls,
    order: pages.map((p) => String(p.index)),
  });

  return (
    <aside className="studio-rail glass" ref={railRef}>
      <div className="studio-rail-tabs">
        <button type="button" data-active={tab === "insert"} onClick={() => onTab("insert")}>
          Insert
        </button>
        <button type="button" data-active={tab === "pages"} onClick={() => onTab("pages")}>
          Pages
        </button>
        <button type="button" data-active={tab === "drafts"} onClick={() => onTab("drafts")}>
          Drafts
        </button>
      </div>

      {tab === "insert" && (
        <div className="studio-rail-body">
          <p className="studio-rail-hint">Click to append, or drag onto the page.</p>
          {GROUPS.map((group) => (
            <section key={group} className="studio-palette-group">
              <h4>{group}</h4>
              {PALETTE.filter((p) => p.group === group).map((p) => (
                <button
                  key={p.type}
                  type="button"
                  className="studio-palette-item"
                  title={`Click to add, or drag onto the page — ${p.hint}`}
                  {...grip(dnd, { kind: "new", zone: "canvas", blockType: p.type, label: p.label })}
                  onClick={() => {
                    // A press that turned into a drag must not also insert at the end
                    if (dnd.justDragged()) return;
                    onInsert(p.type);
                  }}
                >
                  <span className="studio-palette-icon" aria-hidden>
                    {p.icon}
                  </span>
                  <span className="studio-palette-text">
                    <span className="studio-palette-label">{p.label}</span>
                    <span className="studio-palette-hint">{p.hint}</span>
                  </span>
                </button>
              ))}
              {group === "Data" && <TablePicker onPick={onInsertTable} />}
            </section>
          ))}
        </div>
      )}

      {tab === "pages" && (
        <div className="studio-rail-body">
          <p className="studio-rail-hint">
            Every page break starts a new page. Readers turn pages with ← → in the viewer.
          </p>
          {pages.map((page) => (
            <div
              key={page.index}
              className="studio-page-card"
              data-active={page.index === activePage}
              ref={(el) => {
                pageEls.current[String(page.index)] = el;
              }}
            >
              {pageDrop === page.index && <span className="studio-drop-line" aria-hidden />}
              <button
                type="button"
                className="studio-page-open"
                {...(page.breakAt !== null
                  ? grip(dnd, { kind: "page", zone: "pages", index: page.index, label: page.label })
                  : {})}
                onClick={() => {
                  if (dnd.justDragged()) return;
                  onGoToPage(page.index);
                }}
              >
                <span className="studio-page-no">{page.index + 1}</span>
                <span className="studio-page-name">{page.label}</span>
                <span className="studio-page-count">{page.blockIds.length} blocks</span>
              </button>
              {page.breakAt !== null && (
                <div className="studio-page-controls">
                  <select
                    value={page.transition}
                    aria-label={`Page ${page.index + 1} turn animation`}
                    onChange={(e) => onPageTransition(page.index, e.target.value)}
                  >
                    {["none", "fade", "slide", "push", "flip", "zoom", "reveal"].map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Remove this page break"
                    onClick={() => onRemovePage(page.index)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
          {pageDrop === pages.length && <span className="studio-drop-line" aria-hidden />}
          <button type="button" className="btn btn-quiet btn-small" onClick={onAddPage}>
            + Add page
          </button>
        </div>
      )}

      {tab === "drafts" && (
        <DraftsTray
          drafts={drafts}
          draftsEnabled={draftsEnabled}
          currentDraftId={currentDraftId}
          onOpenDraft={onOpenDraft}
          onDeleteDraft={onDeleteDraft}
          onNew={onNewDocument}
          noun="document"
          countLabel="block"
        />
      )}
    </aside>
  );
}
