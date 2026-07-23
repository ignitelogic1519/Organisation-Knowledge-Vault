"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthoredBlock, Classification, TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";
import { courses } from "@/lib/courses-client";
import { AuthoredBlockView } from "@/components/CourseViewer";
import { useOrg } from "@/components/org-context";
import { useDialogs } from "@/components/dialogs";

// The Document Studio: a visual, drag-and-drop document builder. A palette of blocks on
// the left, a canvas of draggable cards in the middle, and a live Preview that renders the
// finished document in the organization's standard frame. Owners publish directly; members
// with the content-creation grant submit a draft for manager review.

type Block = AuthoredBlock & { _id: number };
let nextId = 1;
const mk = (b: AuthoredBlock): Block => ({ ...b, _id: nextId++ });

const CLASSES: Classification[] = ["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"];
const CLASS_LABEL: Record<Classification, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};

const PALETTE: { type: AuthoredBlock["type"]; label: string; icon: string; hint: string }[] = [
  { type: "heading", label: "Heading", icon: "H", hint: "Section title" },
  { type: "paragraph", label: "Text", icon: "¶", hint: "Rich paragraph" },
  { type: "table", label: "Table", icon: "▦", hint: "Rows & columns" },
  { type: "checklist", label: "Checklist", icon: "☑", hint: "Steps to tick" },
  { type: "card", label: "Callout", icon: "▤", hint: "Highlighted note" },
  { type: "image", label: "Image", icon: "🖼", hint: "Picture by URL" },
  { type: "media", label: "Media", icon: "▶", hint: "Audio or video" },
  { type: "divider", label: "Divider", icon: "—", hint: "Section break" },
];

function RichArea({
  html,
  onChange,
  placeholder,
}: {
  html: string;
  onChange: (html: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cmd = (c: string) => {
    document.execCommand(c);
    if (ref.current) onChange(ref.current.innerHTML);
  };
  return (
    <div className="studio-rich">
      <div className="studio-rich-tools">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("bold")}>
          <b>B</b>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("italic")}>
          <i>I</i>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("underline")}>
          <u>U</u>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertUnorderedList")}>
          •
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertOrderedList")}>
          1.
        </button>
      </div>
      <div
        ref={ref}
        className="studio-rich-area"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
      />
    </div>
  );
}

function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="studio-block-body">
          <select
            className="studio-input"
            value={block.level ?? 2}
            onChange={(e) => onChange({ ...block, level: Number(e.target.value) })}
          >
            <option value={1}>Heading 1</option>
            <option value={2}>Heading 2</option>
            <option value={3}>Heading 3</option>
          </select>
          <RichArea html={block.html ?? ""} onChange={(html) => onChange({ ...block, html })} placeholder="Heading text…" />
        </div>
      );
    case "paragraph":
    case "card":
      return (
        <div className="studio-block-body">
          {block.type === "card" && (
            <input
              className="studio-input"
              placeholder="Callout title (optional)"
              value={block.title ?? ""}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
            />
          )}
          <RichArea
            html={block.html ?? ""}
            onChange={(html) => onChange({ ...block, html })}
            placeholder={block.type === "card" ? "Callout text…" : "Write a paragraph…"}
          />
        </div>
      );
    case "checklist":
      return (
        <div className="studio-block-body">
          <textarea
            className="studio-input"
            rows={4}
            placeholder="One item per line"
            value={(block.items ?? []).join("\n")}
            onChange={(e) => onChange({ ...block, items: e.target.value.split("\n").filter(Boolean) })}
          />
        </div>
      );
    case "table":
      return (
        <div className="studio-block-body">
          <textarea
            className="studio-input"
            rows={4}
            placeholder={"First row is the header. Cells split by | , rows by new lines.\nName | Role | Owner\nHR | Manager | Yes"}
            value={(block.rows ?? []).map((r) => r.join(" | ")).join("\n")}
            onChange={(e) =>
              onChange({
                ...block,
                rows: e.target.value
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((l) => l.split("|").map((c) => c.trim())),
              })
            }
          />
        </div>
      );
    case "image":
    case "media":
      return (
        <div className="studio-block-body">
          {block.type === "media" && (
            <select
              className="studio-input"
              value={block.mediaKind ?? "video"}
              onChange={(e) => onChange({ ...block, mediaKind: e.target.value as "audio" | "video" })}
            >
              <option value="video">Video</option>
              <option value="audio">Audio</option>
            </select>
          )}
          <input
            className="studio-input"
            type="url"
            placeholder="https://… (media URL)"
            value={block.url ?? ""}
            onChange={(e) => onChange({ ...block, url: e.target.value })}
          />
        </div>
      );
    case "divider":
      return <hr className="doc-divider" />;
    default:
      return null;
  }
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ minHeight: "12rem" }} />}>
      <StudioInner />
    </Suspense>
  );
}

function StudioInner() {
  const { org, isSupremeOwner } = useOrg();
  const router = useRouter();
  const dialogs = useDialogs();
  const params = useSearchParams();
  const roleId = params.get("role");

  const [node, setNode] = useState<TreeNode | null>(null);
  // Every branch the user owns — used to compute publish rights from the tree itself,
  // robustly, rather than trusting a single per-node flag.
  const [ownedPaths, setOwnedPaths] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([
    mk({ type: "heading", level: 1, html: "" }),
    mk({ type: "paragraph", html: "" }),
  ]);
  const [meta, setMeta] = useState({
    title: "",
    classification: "" as "" | Classification,
    category: "",
    description: "",
    scope: "",
    inLibrary: true,
    mandatory: false,
    inherit: true,
    resets: true,
  });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    if (!roleId) return;
    roles
      .structure(org.id)
      .then((v) => {
        setNode(v.nodes.find((n) => n.id === roleId) ?? null);
        setOwnedPaths(v.nodes.filter((n) => n.my.kinds.includes("OWNER")).map((n) => n.path));
      })
      .catch(() => setNode(null));
  }, [org.id, roleId]);

  const update = useCallback((id: number, b: Block) => {
    setBlocks((prev) => prev.map((x) => (x._id === id ? b : x)));
  }, []);
  const remove = (id: number) => setBlocks((prev) => prev.filter((x) => x._id !== id));
  const add = (type: AuthoredBlock["type"], at?: number) =>
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(at ?? next.length, 0, mk({ type }));
      return next;
    });

  // Drag-to-reorder within the canvas
  const onDragStart = (i: number) => (dragIndex.current = i);
  const onDropAt = (i: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === i) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(from < i ? i - 1 : i, 0, moved);
      return next;
    });
  };

  // The root Owner (CEO) and any owner of this branch or a level above may publish
  // directly. Compute it from the tree so a missing/stale per-node flag can't wrongly
  // block someone who clearly governs the node.
  const ownsHereOrAbove =
    !!node && ownedPaths.some((p) => node.path === p || node.path.startsWith(`${p}.`));
  const canPublish = isSupremeOwner || ownsHereOrAbove || !!node?.my.canPublishContent;
  const canPropose = !!node?.my.canProposeContent;
  const canProceed = node && (canPublish || canPropose);
  const needsReview = !canPublish && canPropose;

  const cleanBlocks = (): AuthoredBlock[] =>
    blocks
      .map(({ _id, ...b }) => b)
      .filter(
        (b) =>
          (b.html && b.html.replace(/<[^>]*>/g, "").trim()) ||
          b.url ||
          (b.rows && b.rows.length) ||
          (b.items && b.items.length) ||
          b.type === "divider",
      );

  const publish = async () => {
    if (!node) return;
    if (!meta.title.trim() || meta.title.trim().length < 2) {
      dialogs.toast("Give the document a title.", "danger");
      return;
    }
    if (!meta.classification) {
      dialogs.toast("Classification is compulsory.", "danger");
      return;
    }
    if (meta.description.trim().length < 8) {
      dialogs.toast("Add a short description (cover page).", "danger");
      return;
    }
    const body = cleanBlocks();
    if (body.length === 0) {
      dialogs.toast("Add some content before publishing.", "danger");
      return;
    }
    setBusy(true);
    try {
      const created = await courses.create(org.id, {
        roleNodeId: node.id,
        kind: "DOCUMENT",
        title: meta.title.trim(),
        description: meta.description.trim(),
        scope: meta.scope.trim() || undefined,
        classification: meta.classification,
        allowDownload: false,
        inLibrary: meta.inLibrary,
        category: meta.category.trim() || undefined,
        blocks: body,
        resetsCompletionOnUpdate: meta.resets,
        prerequisiteCodes: [],
      });
      // Owners place immediately; a member's draft is placed by the reviewer on approval
      if (!created.draft) {
        await courses.place(created.code, {
          roleNodeId: node.id,
          mandatory: meta.mandatory,
          inheritToDescendants: meta.inherit,
        });
        dialogs.toast(`Published ${created.code} to ${node.name}.`, "success");
      } else {
        dialogs.toast("Sent to your branch manager for review.", "success");
      }
      router.push(created.draft ? `/orgs/${org.id}/requests` : `/orgs/${org.id}`);
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Publish failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  if (!roleId) {
    return (
      <div className="empty-card glass">
        <h2>Studio</h2>
        <p className="auth-sub">
          Open the Studio from a branch — its panel has a “Create in Studio” button.
        </p>
      </div>
    );
  }
  if (!node) return <div className="skeleton" style={{ minHeight: "12rem" }} />;
  if (!canProceed) {
    return (
      <div className="empty-card glass">
        <h2>Studio</h2>
        <p className="auth-sub">
          You don&apos;t have content-creation rights on <strong>{node.name}</strong>. An owner
          of this branch (or the level above) can grant you content rights from the People
          panel, or create the document themselves.
        </p>
      </div>
    );
  }

  return (
    <div className="studio-shell">
      <div className="studio-topbar glass">
        <div className="studio-topbar-main">
          <button className="btn btn-quiet btn-small" onClick={() => router.back()}>
            ← Back
          </button>
          <input
            className="studio-title-input"
            placeholder="Untitled document"
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          />
          {needsReview && <span className="badge">draft · needs review</span>}
        </div>
        <div className="studio-topbar-actions">
          <button
            className={mode === "preview" ? "btn btn-primary btn-small" : "btn btn-quiet btn-small"}
            onClick={() => setMode(mode === "preview" ? "edit" : "preview")}
          >
            {mode === "preview" ? "✎ Edit" : "👁 Preview"}
          </button>
          <button className="btn btn-primary btn-small" disabled={busy} onClick={publish}>
            {busy ? "Working…" : needsReview ? "Submit for review" : "Publish"}
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="studio-preview">
          <div className="doc-headerbar class-strip-CONFIDENTIAL">
            <span className="doc-org">{org.name}</span>
            <span className="doc-class">{meta.classification ? CLASS_LABEL[meta.classification] : "—"}</span>
            <span className="doc-ver">draft</span>
          </div>
          <div className="doc-authored" style={{ position: "static" }}>
            <article className="doc-sheet">
              <section className="doc-cover" style={{ minHeight: "auto", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
                <span className="doc-cover-org">{org.name}</span>
                <h1 className="doc-cover-title">{meta.title || "Untitled document"}</h1>
                <p className="auth-sub">{meta.description || "No description yet."}</p>
                {meta.scope && <p className="auth-sub">Scope: {meta.scope}</p>}
              </section>
              {cleanBlocks().map((b, i) => (
                <AuthoredBlockView key={i} block={b} />
              ))}
            </article>
          </div>
        </div>
      ) : (
        <div className="studio-workspace">
          <aside className="studio-palette glass">
            <h3 className="learning-h">Blocks</h3>
            <p className="auth-sub" style={{ fontSize: "0.75rem" }}>
              Click to add, or drag onto the page.
            </p>
            {PALETTE.map((p) => (
              <button
                key={p.type}
                className="studio-palette-item"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("new-block", p.type)}
                onClick={() => add(p.type)}
              >
                <span className="studio-palette-icon">{p.icon}</span>
                <span>
                  <span className="studio-palette-label">{p.label}</span>
                  <span className="studio-palette-hint">{p.hint}</span>
                </span>
              </button>
            ))}

            <h3 className="learning-h">Details</h3>
            <label className="field">
              <span>Classification*</span>
              <select
                value={meta.classification}
                onChange={(e) => setMeta({ ...meta, classification: e.target.value as Classification })}
              >
                <option value="">Choose…</option>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {CLASS_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Shelf (category)</span>
              <input value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} maxLength={40} />
            </label>
            <label className="field">
              <span>Description* (cover)</span>
              <textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={500} />
            </label>
            <label className="field">
              <span>Scope (cover)</span>
              <textarea rows={2} value={meta.scope} onChange={(e) => setMeta({ ...meta, scope: e.target.value })} maxLength={2000} />
            </label>
            <label className="ack-row">
              <input type="checkbox" checked={meta.inLibrary} onChange={(e) => setMeta({ ...meta, inLibrary: e.target.checked })} />
              <span>Publish to library</span>
            </label>
            {!needsReview && (
              <>
                <label className="ack-row">
                  <input type="checkbox" checked={meta.mandatory} onChange={(e) => setMeta({ ...meta, mandatory: e.target.checked })} />
                  <span>Mandatory</span>
                </label>
                <label className="ack-row">
                  <input type="checkbox" checked={meta.inherit} onChange={(e) => setMeta({ ...meta, inherit: e.target.checked })} />
                  <span>Inherit to lower branches</span>
                </label>
              </>
            )}
          </aside>

          <div
            className="studio-canvas"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("new-block") || dragIndex.current !== null)
                e.preventDefault();
            }}
            onDrop={(e) => {
              const nb = e.dataTransfer.getData("new-block");
              if (nb) add(nb as AuthoredBlock["type"]);
            }}
          >
            <div className="studio-canvas-sheet">
              <div className="studio-canvas-cover">
                <span className="doc-cover-org">{org.name}</span>
                <h1>{meta.title || "Untitled document"}</h1>
                <p className="auth-sub">Cover, header &amp; footer are added automatically on publish.</p>
              </div>

              {blocks.length === 0 && (
                <p className="auth-sub studio-empty">Drag a block here, or pick one from the left.</p>
              )}

              {blocks.map((b, i) => (
                <div
                  key={b._id}
                  className="studio-block"
                  onDragOver={(e) => {
                    if (dragIndex.current !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (dragIndex.current !== null) {
                      e.stopPropagation();
                      onDropAt(i);
                    }
                  }}
                >
                  <div className="studio-block-bar">
                    <span
                      className="studio-drag-handle"
                      draggable
                      onDragStart={() => onDragStart(i)}
                      title="Drag to reorder"
                    >
                      ⠿
                    </span>
                    <span className="badge">{b.type}</span>
                    <span className="studio-block-actions">
                      <button type="button" className="icon-btn" onClick={() => remove(b._id)} aria-label="Delete block">
                        ✕
                      </button>
                    </span>
                  </div>
                  <BlockEditor block={b} onChange={(nb) => update(b._id, nb)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
