"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthoredBlock, Classification, TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";
import { courses } from "@/lib/courses-client";
import { useOrg } from "@/components/org-context";
import { useDialogs } from "@/components/dialogs";

// The Document Studio: a node owner authors a full interactive document — headings,
// rich text, tables, checklists, cards, images, audio/video — and publishes it as a
// course with the organization's standard cover, classification and versioning. This is
// the "create from scratch" counterpart to uploading a file.

type Block = AuthoredBlock & { _id: number };
let nextId = 1;
const mk = (b: AuthoredBlock): Block => ({ ...b, _id: nextId++ });

const CLASSES: Classification[] = ["PUBLIC", "CONFIDENTIAL", "PRIVATE", "SECRET"];

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
        <button type="button" onClick={() => cmd("bold")} title="Bold">
          <b>B</b>
        </button>
        <button type="button" onClick={() => cmd("italic")} title="Italic">
          <i>I</i>
        </button>
        <button type="button" onClick={() => cmd("underline")} title="Underline">
          <u>U</u>
        </button>
        <button type="button" onClick={() => cmd("insertUnorderedList")} title="Bullet list">
          •
        </button>
        <button type="button" onClick={() => cmd("insertOrderedList")} title="Numbered list">
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

function BlockEditor({
  block,
  onChange,
}: {
  block: Block;
  onChange: (b: Block) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="studio-block-body">
          <select
            value={block.level ?? 2}
            onChange={(e) => onChange({ ...block, level: Number(e.target.value) })}
          >
            <option value={1}>Heading 1</option>
            <option value={2}>Heading 2</option>
            <option value={3}>Heading 3</option>
          </select>
          <RichArea
            html={block.html ?? ""}
            onChange={(html) => onChange({ ...block, html })}
            placeholder="Heading text…"
          />
        </div>
      );
    case "paragraph":
    case "card":
      return (
        <div className="studio-block-body">
          {block.type === "card" && (
            <input
              className="studio-input"
              placeholder="Card title (optional)"
              value={block.title ?? ""}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
            />
          )}
          <RichArea
            html={block.html ?? ""}
            onChange={(html) => onChange({ ...block, html })}
            placeholder={block.type === "card" ? "Card content…" : "Write a paragraph…"}
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
            onChange={(e) =>
              onChange({ ...block, items: e.target.value.split("\n").map((s) => s).filter(Boolean) })
            }
          />
        </div>
      );
    case "table":
      return (
        <div className="studio-block-body">
          <textarea
            className="studio-input"
            rows={4}
            placeholder={"First row is the header. Cells separated by | , rows by new lines.\nName | Role | Owner\nHR | Manager | Yes"}
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

const BLOCK_TYPES: { type: AuthoredBlock["type"]; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "paragraph", label: "Text" },
  { type: "table", label: "Table" },
  { type: "checklist", label: "Checklist" },
  { type: "card", label: "Card" },
  { type: "image", label: "Image" },
  { type: "media", label: "Audio / Video" },
  { type: "divider", label: "Divider" },
];

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ minHeight: "12rem" }} />}>
      <StudioInner />
    </Suspense>
  );
}

function StudioInner() {
  const { org } = useOrg();
  const router = useRouter();
  const dialogs = useDialogs();
  const params = useSearchParams();
  const roleId = params.get("role");

  const [node, setNode] = useState<TreeNode | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([
    mk({ type: "heading", level: 1, html: "" }),
    mk({ type: "paragraph", html: "" }),
  ]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!roleId) return;
    roles
      .structure(org.id)
      .then((v) => setNode(v.nodes.find((n) => n.id === roleId) ?? null))
      .catch(() => setNode(null));
  }, [org.id, roleId]);

  const update = useCallback((id: number, b: Block) => {
    setBlocks((prev) => prev.map((x) => (x._id === id ? b : x)));
  }, []);
  const move = (id: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((x) => x._id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };
  const remove = (id: number) => setBlocks((prev) => prev.filter((x) => x._id !== id));
  const add = (type: AuthoredBlock["type"]) => setBlocks((prev) => [...prev, mk({ type })]);

  if (!roleId || (node === null && roleId)) {
    return (
      <div className="empty-card glass">
        <h2>Studio</h2>
        <p className="auth-sub">
          Open the Studio from a branch you own — its Courses panel has a “Create in Studio”
          button.
        </p>
      </div>
    );
  }
  if (!node) return <div className="skeleton" style={{ minHeight: "12rem" }} />;

  return (
    <div className="panel glass panel-wide studio">
      <div className="studio-head">
        <div>
          <h2>Document Studio</h2>
          <p className="auth-sub">
            Authoring for <strong>{node.name}</strong> — publishes with the organization&apos;s
            standard cover, classification and versioning.
          </p>
        </div>
        <button className="btn btn-quiet btn-small" onClick={() => router.back()}>
          ← Back
        </button>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const clean: AuthoredBlock[] = blocks.map(({ _id, ...b }) => b);
          const meaningful = clean.filter(
            (b) =>
              (b.html && b.html.replace(/<[^>]*>/g, "").trim()) ||
              b.url ||
              (b.rows && b.rows.length) ||
              (b.items && b.items.length) ||
              b.type === "divider",
          );
          if (meaningful.length === 0) {
            dialogs.toast("Add some content before publishing.", "danger");
            return;
          }
          const d = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const created = await courses.create(org.id, {
              roleNodeId: node.id,
              kind: "DOCUMENT",
              title: String(d.get("title")),
              description: String(d.get("description")),
              scope: String(d.get("scope") || "") || undefined,
              classification: d.get("classification") as Classification,
              allowDownload: false, // authored docs aren't file downloads
              inLibrary: d.get("inLibrary") === "on",
              category: String(d.get("category") || "").trim() || undefined,
              blocks: meaningful,
              resetsCompletionOnUpdate: d.get("resets") === "on",
              prerequisiteCodes: [],
            });
            await courses.place(created.code, {
              roleNodeId: node.id,
              mandatory: d.get("mandatory") === "on",
              inheritToDescendants: d.get("inherit") === "on",
            });
            dialogs.toast(`Published ${created.code} to ${node.name}.`, "success");
            router.push(`/orgs/${org.id}`);
          } catch (err) {
            dialogs.toast(err instanceof ApiError ? err.message : "Publish failed", "danger");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="studio-meta">
          <label className="field">
            <span>Title</span>
            <input name="title" required minLength={2} placeholder="Document title" />
          </label>
          <label className="field">
            <span>Classification (compulsory)</span>
            <select name="classification" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c[0] + c.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Library shelf (category)</span>
            <input name="category" maxLength={40} placeholder="AI, Safety, Onboarding…" />
          </label>
          <label className="field studio-meta-wide">
            <span>Description (cover page 2)</span>
            <textarea name="description" required minLength={8} maxLength={500} rows={2} />
          </label>
          <label className="field studio-meta-wide">
            <span>Scope (cover page 2)</span>
            <textarea name="scope" maxLength={2000} rows={2} />
          </label>
        </div>

        <h3 className="learning-h">Document body</h3>
        <div className="studio-blocks">
          {blocks.map((b, i) => (
            <div key={b._id} className="studio-block">
              <div className="studio-block-bar">
                <span className="badge">{b.type}</span>
                <span className="studio-block-actions">
                  <button type="button" className="icon-btn" onClick={() => move(b._id, -1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" className="icon-btn" onClick={() => move(b._id, 1)} disabled={i === blocks.length - 1} aria-label="Move down">
                    ↓
                  </button>
                  <button type="button" className="icon-btn" onClick={() => remove(b._id)} aria-label="Delete block">
                    ✕
                  </button>
                </span>
              </div>
              <BlockEditor block={b} onChange={(nb) => update(b._id, nb)} />
            </div>
          ))}
        </div>

        <div className="studio-add">
          <span className="auth-sub">Add block:</span>
          {BLOCK_TYPES.map((t) => (
            <button key={t.type} type="button" className="btn btn-quiet btn-small" onClick={() => add(t.type)}>
              + {t.label}
            </button>
          ))}
        </div>

        <div className="studio-publish">
          <label className="ack-row">
            <input type="checkbox" name="inLibrary" defaultChecked />
            <span>Publish to library</span>
          </label>
          <label className="ack-row">
            <input type="checkbox" name="mandatory" />
            <span>Mandatory</span>
          </label>
          <label className="ack-row">
            <input type="checkbox" name="inherit" defaultChecked />
            <span>Inherit to lower branches</span>
          </label>
          <label className="ack-row">
            <input type="checkbox" name="resets" defaultChecked />
            <span>New versions reset completion</span>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Publishing…" : "Publish document"}
          </button>
        </div>
      </form>
    </div>
  );
}
