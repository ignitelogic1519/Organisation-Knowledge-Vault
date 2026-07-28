"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { TableCell, TableOptions } from "@vault/shared";
import { emptyCell, textToGrid } from "./model";

// The table editor: a real grid, not a text field. Columns and rows are added, removed and
// resized from their headers, a rectangular selection can be formatted in one go, and
// pasting tab- or comma-separated text expands into cells the way a spreadsheet does.

const COLUMN_NAME = (index: number): string => {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
};

interface Selection {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

const normalize = (s: Selection): Selection => ({
  r1: Math.min(s.r1, s.r2),
  c1: Math.min(s.c1, s.c2),
  r2: Math.max(s.r1, s.r2),
  c2: Math.max(s.c1, s.c2),
});

const inSelection = (s: Selection | null, r: number, c: number) =>
  !!s && r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2;

/** Keep the grid rectangular — every operation runs through this. */
function rectangular(grid: TableCell[][]): TableCell[][] {
  const width = Math.max(1, ...grid.map((r) => r.length));
  return grid.map((row) => {
    const next = [...row];
    while (next.length < width) next.push(emptyCell());
    return next;
  });
}

const CELL_COLORS = ["", "#fef3c7", "#dcfce7", "#dbeafe", "#fae8ff", "#fee2e2", "#f1f5f9"];

export function TableEditor({
  cells,
  options,
  onChange,
}: {
  cells: TableCell[][];
  options: TableOptions;
  onChange: (next: { cells: TableCell[][]; table: TableOptions }) => void;
}) {
  const grid = useMemo(() => rectangular(cells.length ? cells : [[emptyCell()]]), [cells]);
  const rows = grid.length;
  const cols = grid[0]?.length ?? 1;
  const [selection, setSelection] = useState<Selection | null>({ r1: 0, c1: 0, r2: 0, c2: 0 });
  const [menu, setMenu] = useState<{ kind: "row" | "col"; index: number } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const push = useCallback(
    (next: TableCell[][], nextOptions?: TableOptions) =>
      onChange({ cells: rectangular(next), table: nextOptions ?? options }),
    [onChange, options],
  );

  const setCell = (r: number, c: number, patch: Partial<TableCell>) => {
    const next = grid.map((row, ri) =>
      row.map((cell, ci) => (ri === r && ci === c ? { ...cell, ...patch } : cell)),
    );
    push(next);
  };

  /** Apply one formatting change to every cell in the current selection. */
  const formatSelection = (patch: Partial<TableCell>) => {
    const s = selection && normalize(selection);
    if (!s) return;
    const next = grid.map((row, r) =>
      row.map((cell, c) => (inSelection(s, r, c) ? { ...cell, ...patch } : cell)),
    );
    push(next);
  };

  const addRow = (at: number) => {
    const next = [...grid];
    next.splice(at, 0, Array.from({ length: cols }, () => emptyCell()));
    push(next);
    setMenu(null);
  };
  const addColumn = (at: number) => {
    push(grid.map((row) => {
      const next = [...row];
      next.splice(at, 0, emptyCell());
      return next;
    }));
    setMenu(null);
  };
  const removeRow = (at: number) => {
    if (rows <= 1) return;
    push(grid.filter((_, r) => r !== at));
    setMenu(null);
  };
  const removeColumn = (at: number) => {
    if (cols <= 1) return;
    const widths = options.columnWidths?.filter((_, c) => c !== at);
    push(
      grid.map((row) => row.filter((_, c) => c !== at)),
      widths ? { ...options, columnWidths: widths } : options,
    );
    setMenu(null);
  };

  const focusCell = (r: number, c: number) => {
    const el = inputs.current[`${r}:${c}`];
    if (el) {
      el.focus();
      el.select();
    }
  };

  /** Spreadsheet paste: a block of tab/comma separated text fills the cells to the right. */
  const onPaste = (e: React.ClipboardEvent, r: number, c: number) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text)) return; // a plain value — let the input handle it
    e.preventDefault();
    const pasted = textToGrid(text);
    const next = grid.map((row) => [...row]);
    pasted.forEach((row, ri) => {
      const target = r + ri;
      while (next.length <= target) next.push(Array.from({ length: cols }, () => emptyCell()));
      row.forEach((cell, ci) => {
        const targetCol = c + ci;
        while (next[target].length <= targetCol) next[target].push(emptyCell());
        next[target][targetCol] = { ...next[target][targetCol], text: cell.text };
      });
    });
    push(next);
  };

  const onCellKey = (e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const nextCol = e.shiftKey ? c - 1 : c + 1;
      if (nextCol >= cols) {
        if (r + 1 >= rows) addRow(rows);
        focusCell(r + 1 >= rows ? rows : r + 1, 0);
      } else if (nextCol < 0) {
        focusCell(Math.max(0, r - 1), cols - 1);
      } else {
        focusCell(r, nextCol);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (r + 1 >= rows) addRow(rows);
      focusCell(Math.min(r + 1, rows), c);
    } else if (e.key === "ArrowDown" && r + 1 < rows) {
      e.preventDefault();
      focusCell(r + 1, c);
    } else if (e.key === "ArrowUp" && r > 0) {
      e.preventDefault();
      focusCell(r - 1, c);
    }
  };

  const headerRow = options.headerRow !== false;
  const anchorCell = selection
    ? grid[normalize(selection).r1]?.[normalize(selection).c1]
    : undefined;
  const selectionSize = selection
    ? (() => {
        const s = normalize(selection);
        return (s.r2 - s.r1 + 1) * (s.c2 - s.c1 + 1);
      })()
    : 0;

  return (
    <div className="sheet-editor" onMouseLeave={() => setMenu(null)}>
      <div className="sheet-toolbar">
        <span className="sheet-dim">
          {rows} × {cols}
          {selectionSize > 1 ? ` · ${selectionSize} cells selected` : ""}
        </span>
        <span className="sheet-tool-sep" />
        <button
          type="button"
          className="sheet-tool"
          data-active={!!anchorCell?.bold}
          title="Bold cells"
          onClick={() => formatSelection({ bold: !anchorCell?.bold })}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          className="sheet-tool"
          data-active={!!anchorCell?.italic}
          title="Italic cells"
          onClick={() => formatSelection({ italic: !anchorCell?.italic })}
        >
          <i>I</i>
        </button>
        <button type="button" className="sheet-tool" title="Align left" onClick={() => formatSelection({ align: "left" })}>
          ⯇
        </button>
        <button type="button" className="sheet-tool" title="Align centre" onClick={() => formatSelection({ align: "center" })}>
          ≡
        </button>
        <button type="button" className="sheet-tool" title="Align right" onClick={() => formatSelection({ align: "right" })}>
          ⯈
        </button>
        <span className="sheet-tool-sep" />
        <span className="sheet-fills">
          {CELL_COLORS.map((c) => (
            <button
              key={c || "none"}
              type="button"
              className="sheet-fill"
              data-none={!c}
              style={{ background: c || undefined }}
              title={c ? `Fill ${c}` : "No fill"}
              onClick={() => formatSelection({ background: c || undefined })}
            />
          ))}
        </span>
        <span className="sheet-tool-sep" />
        <button type="button" className="sheet-tool sheet-tool-wide" onClick={() => addRow(rows)}>
          + Row
        </button>
        <button type="button" className="sheet-tool sheet-tool-wide" onClick={() => addColumn(cols)}>
          + Column
        </button>
      </div>

      <div className="sheet-scroll">
        <table className="sheet-grid">
          <thead>
            <tr>
              <th className="sheet-corner" aria-label="Select all" />
              {grid[0]?.map((_, c) => (
                <th
                  key={c}
                  className="sheet-col-head"
                  data-active={inSelection(selection && normalize(selection), selection ? normalize(selection).r1 : -1, c)}
                  onClick={() => {
                    setSelection({ r1: 0, c1: c, r2: rows - 1, c2: c });
                    setMenu({ kind: "col", index: c });
                  }}
                >
                  {COLUMN_NAME(c)}
                  <span className="sheet-head-caret" aria-hidden>
                    ▾
                  </span>
                  {menu?.kind === "col" && menu.index === c && (
                    <div className="sheet-menu glass-strong" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => addColumn(c)}>
                        Insert column left
                      </button>
                      <button type="button" onClick={() => addColumn(c + 1)}>
                        Insert column right
                      </button>
                      <label className="sheet-menu-field">
                        <span>Width %</span>
                        <input
                          type="number"
                          min={3}
                          max={100}
                          value={options.columnWidths?.[c] ?? ""}
                          onChange={(e) => {
                            const widths = [...(options.columnWidths ?? [])];
                            while (widths.length < cols) widths.push(0);
                            widths[c] = Number(e.target.value) || 0;
                            push(grid, { ...options, columnWidths: widths.map((w) => w || 0).filter(() => true) });
                          }}
                        />
                      </label>
                      <button type="button" className="sheet-menu-danger" onClick={() => removeColumn(c)}>
                        Delete column
                      </button>
                    </div>
                  )}
                </th>
              ))}
              <th className="sheet-add-col">
                <button type="button" title="Add column" onClick={() => addColumn(cols)}>
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} data-header={headerRow && r === 0}>
                <th
                  className="sheet-row-head"
                  onClick={() => {
                    setSelection({ r1: r, c1: 0, r2: r, c2: cols - 1 });
                    setMenu({ kind: "row", index: r });
                  }}
                >
                  {r + 1}
                  {menu?.kind === "row" && menu.index === r && (
                    <div className="sheet-menu glass-strong" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => addRow(r)}>
                        Insert row above
                      </button>
                      <button type="button" onClick={() => addRow(r + 1)}>
                        Insert row below
                      </button>
                      <button type="button" className="sheet-menu-danger" onClick={() => removeRow(r)}>
                        Delete row
                      </button>
                    </div>
                  )}
                </th>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className="sheet-cell"
                    data-selected={inSelection(selection && normalize(selection), r, c)}
                    style={{ background: cell.background }}
                  >
                    <input
                      ref={(el) => {
                        inputs.current[`${r}:${c}`] = el;
                      }}
                      value={cell.text}
                      style={{
                        fontWeight: cell.bold ? 700 : undefined,
                        fontStyle: cell.italic ? "italic" : undefined,
                        textAlign: cell.align,
                        color: cell.color,
                      }}
                      onChange={(e) => setCell(r, c, { text: e.target.value })}
                      onFocus={() => setSelection({ r1: r, c1: c, r2: r, c2: c })}
                      onMouseDown={(e) => {
                        if (e.shiftKey && selection) {
                          e.preventDefault();
                          setSelection({ ...selection, r2: r, c2: c });
                        }
                      }}
                      onPaste={(e) => onPaste(e, r, c)}
                      onKeyDown={(e) => onCellKey(e, r, c)}
                      aria-label={`Row ${r + 1} column ${COLUMN_NAME(c)}`}
                    />
                  </td>
                ))}
                <td className="sheet-spacer-cell" />
              </tr>
            ))}
            <tr>
              <th className="sheet-add-row">
                <button type="button" title="Add row" onClick={() => addRow(rows)}>
                  +
                </button>
              </th>
              <td colSpan={cols + 1} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="sheet-options">
        <label className="sheet-opt">
          <input
            type="checkbox"
            checked={options.headerRow !== false}
            onChange={(e) => push(grid, { ...options, headerRow: e.target.checked })}
          />
          <span>Header row</span>
        </label>
        <label className="sheet-opt">
          <input
            type="checkbox"
            checked={!!options.headerColumn}
            onChange={(e) => push(grid, { ...options, headerColumn: e.target.checked })}
          />
          <span>Header column</span>
        </label>
        <label className="sheet-opt">
          <input
            type="checkbox"
            checked={!!options.striped}
            onChange={(e) => push(grid, { ...options, striped: e.target.checked })}
          />
          <span>Banded rows</span>
        </label>
        <label className="sheet-opt">
          <input
            type="checkbox"
            checked={!!options.compact}
            onChange={(e) => push(grid, { ...options, compact: e.target.checked })}
          />
          <span>Compact</span>
        </label>
        <label className="sheet-opt">
          <input
            type="checkbox"
            checked={!!options.stickyHeader}
            onChange={(e) => push(grid, { ...options, stickyHeader: e.target.checked })}
          />
          <span>Freeze header</span>
        </label>
        <label className="sheet-opt sheet-opt-select">
          <span>Borders</span>
          <select
            value={options.borders ?? "all"}
            onChange={(e) => push(grid, { ...options, borders: e.target.value as TableOptions["borders"] })}
          >
            <option value="all">All</option>
            <option value="horizontal">Horizontal</option>
            <option value="outline">Outline</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="sheet-opt sheet-opt-grow">
          <span>Caption</span>
          <input
            value={options.caption ?? ""}
            maxLength={200}
            placeholder="Table 1 — quarterly targets"
            onChange={(e) => push(grid, { ...options, caption: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
