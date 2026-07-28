"use client";

import { useState } from "react";
import type { StudioDraftSummary } from "@vault/shared";
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
  return (
    <aside className="studio-rail glass">
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
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-studio-block", p.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onInsert(p.type)}
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
            <div key={page.index} className="studio-page-card" data-active={page.index === activePage}>
              <button type="button" className="studio-page-open" onClick={() => onGoToPage(page.index)}>
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
          <button type="button" className="btn btn-quiet btn-small" onClick={onAddPage}>
            + Add page
          </button>
        </div>
      )}

      {tab === "drafts" && (
        <div className="studio-rail-body">
          {!draftsEnabled && (
            <p className="studio-premium-note">
              <strong>Premium capability.</strong> Documents in progress can be parked on the
              server and reopened from any device on a premium plan. On the free demo
              structure your work is still kept in this browser while you write.
            </p>
          )}
          {draftsEnabled && drafts.length === 0 && (
            <p className="studio-rail-hint">
              No drafts yet. Use <strong>Save draft</strong> to park this document and come back
              to it later.
            </p>
          )}
          {drafts.map((d) => (
            <div key={d.id} className="studio-draft-card" data-active={d.id === currentDraftId}>
              <button type="button" className="studio-draft-open" onClick={() => onOpenDraft(d.id)}>
                <span className="studio-draft-title">{d.title}</span>
                <span className="studio-draft-meta">
                  {d.roleName} · {d.blockCount} blocks · {new Date(d.updatedAt).toLocaleString()}
                </span>
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                title="Delete draft"
                onClick={() => onDeleteDraft(d.id)}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-quiet btn-small" onClick={onNewDocument}>
            ✎ Start a new document
          </button>
        </div>
      )}
    </aside>
  );
}
