"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  AuthoredBlock,
  Classification,
  OrgPlanLimitsView,
  StudioDraftSummary,
  TreeNode,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";
import { courses } from "@/lib/courses-client";
import { studio } from "@/lib/studio-client";
import { DocumentBody, DocumentPages, paginate } from "@/components/DocumentView";
import { Canvas } from "@/components/studio/Canvas";
import { DndProvider, type DragPayload, type DropTarget } from "@/components/studio/dnd";
import { Inspector } from "@/components/studio/Inspector";
import { Ribbon } from "@/components/studio/Ribbon";
import { SideRail } from "@/components/studio/SideRail";
import { DEVICES, starterFor } from "@/components/studio/presets";
import { RichTextProvider } from "@/components/studio/rich";
import {
  convertBlock,
  createBlock,
  documentStats,
  duplicateAt,
  editorPages,
  EMPTY_META,
  insertAt,
  meaningfulBlocks,
  moveBlock,
  movePage,
  starterBlocks,
  stripId,
  withId,
  type BlockType,
  type EditorBlock,
  type StudioMeta,
} from "@/components/studio/model";
import { useOrg } from "@/components/org-context";
import { useDialogs } from "@/components/dialogs";

// ── The Document Studio ──────────────────────────────────────────────────────
// A three-pane editor in the shape people already know: an insert/pages rail on the left,
// a paper canvas in the middle with a formatting ribbon above it, and a block inspector on
// the right. Everything is drag-and-drop, everything is styleable, and the preview and
// present modes render through the very same component the reader's viewer uses.

const CLASS_LABEL: Record<Classification, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};

interface Doc {
  blocks: EditorBlock[];
  meta: StudioMeta;
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ minHeight: "12rem" }} />}>
      <RichTextProvider>
        <StudioInner />
      </RichTextProvider>
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
  // Every branch the user owns — publish rights are computed from the tree itself,
  // robustly, rather than trusting a single per-node flag.
  const [ownedPaths, setOwnedPaths] = useState<string[]>([]);
  const [doc, setDoc] = useState<Doc>({ blocks: starterBlocks(), meta: EMPTY_META });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview" | "present">("edit");
  const [railTab, setRailTab] = useState<"insert" | "pages" | "drafts">("insert");
  const [inspectorTab, setInspectorTab] = useState<"format" | "document">("format");
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState<null | "publish" | "draft">(null);
  const [restored, setRestored] = useState(false);
  const [limits, setLimits] = useState<OrgPlanLimitsView | null>(null);
  const [drafts, setDrafts] = useState<StudioDraftSummary[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [device, setDevice] = useState("desktop");
  const [activePage, setActivePage] = useState(0);

  const docRef = useRef<Doc>(doc);
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const lastHistoryPush = useRef(0);
  const [, bumpHistory] = useState(0);
  const blockEls = useRef<Record<string, HTMLElement | null>>({});
  const draftKey = `kv.studio.${org.id}.${roleId ?? "none"}`;

  // ── Document state with undo history ───────────────────────────────────────
  const commit = useCallback((updater: (d: Doc) => Doc) => {
    const previous = docRef.current;
    const next = updater(previous);
    if (next === previous) return;
    const now = Date.now();
    if (now - lastHistoryPush.current > 500) {
      lastHistoryPush.current = now;
      past.current = [...past.current.slice(-59), previous];
      future.current = [];
      bumpHistory((n) => n + 1);
    }
    docRef.current = next;
    setDoc(next);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current = [docRef.current, ...future.current].slice(0, 60);
    docRef.current = previous;
    setDoc(previous);
    lastHistoryPush.current = 0;
    bumpHistory((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.shift();
    if (!next) return;
    past.current = [...past.current, docRef.current];
    docRef.current = next;
    setDoc(next);
    bumpHistory((n) => n + 1);
  }, []);

  const setBlocks = useCallback(
    (updater: (blocks: EditorBlock[]) => EditorBlock[]) =>
      commit((d) => ({ ...d, blocks: updater(d.blocks) })),
    [commit],
  );
  const setMeta = useCallback(
    (meta: StudioMeta) => commit((d) => ({ ...d, meta })),
    [commit],
  );

  // ── Loading ────────────────────────────────────────────────────────────────
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

  const reloadPlan = useCallback(() => {
    studio.limits(org.id).then(setLimits).catch(() => undefined);
    studio
      .drafts(org.id)
      .then((r) => setDrafts(r.drafts))
      .catch(() => setDrafts([]));
  }, [org.id]);

  useEffect(reloadPlan, [reloadPlan]);

  useEffect(() => {
    courses
      .suggestCategory(org.id, "", "")
      .then((r) => setCategories(r.categories))
      .catch(() => undefined);
  }, [org.id]);

  // Local recovery: the browser always keeps the work in progress, on every plan, so a
  // reload or a crash never costs the author their document.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { blocks?: AuthoredBlock[]; meta?: StudioMeta };
        const next: Doc = {
          blocks: parsed.blocks?.length ? parsed.blocks.map(withId) : starterBlocks(),
          meta: { ...EMPTY_META, ...(parsed.meta ?? {}) },
        };
        docRef.current = next;
        setDoc(next);
      }
    } catch {
      /* ignore a corrupt local copy */
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ blocks: doc.blocks.map(stripId), meta: doc.meta }),
        );
      } catch {
        /* storage full — the server draft (premium) is the durable path */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [doc, restored, draftKey]);

  // ── Rights ─────────────────────────────────────────────────────────────────
  const ownsHereOrAbove =
    !!node && ownedPaths.some((p) => node.path === p || node.path.startsWith(`${p}.`));
  const canPublish = isSupremeOwner || ownsHereOrAbove || !!node?.my.canPublishContent;
  const canPropose = !!node?.my.canProposeContent;
  const canProceed = node && (canPublish || canPropose);
  const needsReview = !canPublish && canPropose;

  const selected = doc.blocks.find((b) => b._id === selectedId) ?? null;
  const pages = useMemo(() => editorPages(doc.blocks), [doc.blocks]);
  const stats = useMemo(() => documentStats(doc.blocks), [doc.blocks]);
  const published = useMemo(() => meaningfulBlocks(doc.blocks), [doc.blocks]);
  const quotaFull = limits?.documents.remaining === 0;

  // ── Block operations ───────────────────────────────────────────────────────
  const insertBlock = useCallback(
    (type: BlockType, at?: number, options?: { rows?: number; cols?: number }) => {
      const block = createBlock(type, options);
      setBlocks((blocks) => insertAt(blocks, block, at));
      setSelectedId(block._id);
      setInspectorTab("format");
    },
    [setBlocks],
  );

  const updateBlock = useCallback(
    (next: EditorBlock) => setBlocks((blocks) => blocks.map((b) => (b._id === next._id ? next : b))),
    [setBlocks],
  );

  const patchSelected = useCallback(
    (patch: Partial<EditorBlock>) => {
      if (!selected) return;
      updateBlock({ ...selected, ...patch } as EditorBlock);
    },
    [selected, updateBlock],
  );

  /** A document nobody has typed into yet — the moment to offer a starting point. */
  const untouched =
    !doc.meta.title.trim() &&
    doc.blocks.length <= 2 &&
    doc.blocks.every((b) => !(b.html ?? "").replace(/<[^>]*>/g, "").trim());

  const useTemplate = useCallback(
    (key: string) => {
      const { blocks, theme } = starterFor(key);
      commit((d) => ({
        ...d,
        blocks,
        meta: { ...d.meta, theme: theme ?? d.meta.theme },
      }));
      setSelectedId(blocks[0]?._id ?? null);
    },
    [commit],
  );

  const removeBlock = (id: string) => {
    setBlocks((blocks) => blocks.filter((b) => b._id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────
  // One handler for every kind of drag the editor supports; the engine in
  // components/studio/dnd.tsx works the same on mouse, pen and touch.
  const handleDrop = useCallback(
    (payload: DragPayload, target: DropTarget | null) => {
      if (!target) return; // released outside a drop zone — nothing moves
      if (payload.kind === "new") {
        insertBlock(payload.blockType as BlockType, target.index);
      } else if (payload.kind === "move") {
        setBlocks((blocks) => moveBlock(blocks, payload.index, target.index));
      } else if (payload.kind === "page") {
        setBlocks((blocks) => movePage(blocks, payload.index, target.index));
      }
    },
    [insertBlock, setBlocks],
  );

  // ── Pages ──────────────────────────────────────────────────────────────────
  const goToPage = (index: number) => {
    setActivePage(index);
    const first = pages[index]?.blockIds[0];
    const el = first ? blockEls.current[first] : null;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const addPage = () => {
    const block = createBlock("pagebreak");
    setBlocks((blocks) => [...blocks, block, createBlock("heading")]);
    setSelectedId(block._id);
  };

  const removePage = (index: number) => {
    const page = pages[index];
    if (page?.breakAt == null) return;
    setBlocks((blocks) => blocks.filter((_, i) => i !== page.breakAt));
  };

  const setPageTransition = (index: number, transition: string) => {
    const page = pages[index];
    if (page?.breakAt == null) return;
    setBlocks((blocks) =>
      blocks.map((b, i) =>
        i === page.breakAt ? ({ ...b, transition } as EditorBlock) : b,
      ),
    );
  };

  // ── Premium gate ───────────────────────────────────────────────────────────
  const premiumNotice = (what: string) =>
    dialogs.alert({
      title: "Premium capability",
      tone: "info",
      message: (
        <>
          <p>
            {what} is part of the premium plan. This organization is currently running on the{" "}
            <strong>free demo structure</strong>.
          </p>
          <p>
            Please contact your main administrator so they can arrange an upgrade with the
            Knowledge Base team. Once the premium plan is active, the capability is enabled for
            everyone in this organization.
          </p>
          <p className="auth-sub">
            Your work is not lost — this browser keeps the document while you continue writing,
            and you can publish it at any time.
          </p>
        </>
      ),
    });

  const saveDraft = async () => {
    if (!node) return;
    if (!limits?.draftsEnabled) {
      await premiumNotice("Saving a document as a draft");
      return;
    }
    setBusy("draft");
    try {
      const saved = await studio.saveDraft(org.id, {
        id: draftId ?? undefined,
        roleNodeId: node.id,
        document: {
          ...doc.meta,
          title: doc.meta.title.trim() || "Untitled document",
          blocks: doc.blocks.map(stripId),
        },
      });
      setDraftId(saved.id);
      setSavedAt(new Date().toLocaleTimeString());
      reloadPlan();
      dialogs.toast("Draft saved — reopen it from the Drafts tab on any device.", "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) await premiumNotice("Saving a document as a draft");
      else dialogs.toast(err instanceof ApiError ? err.message : "Could not save the draft", "danger");
    } finally {
      setBusy(null);
    }
  };

  const openDraft = async (id: string) => {
    try {
      const loaded = await studio.draft(org.id, id);
      const { blocks, ...meta } = loaded.document;
      const next: Doc = {
        blocks: blocks.length ? blocks.map(withId) : starterBlocks(),
        meta: { ...EMPTY_META, ...meta },
      };
      past.current = [];
      future.current = [];
      docRef.current = next;
      setDoc(next);
      setDraftId(id);
      setSelectedId(null);
      dialogs.toast("Draft opened.", "success");
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not open the draft", "danger");
    }
  };

  const deleteDraft = async (id: string) => {
    const ok = await dialogs.confirm({
      title: "Delete this draft?",
      message: "The saved copy is removed. Anything currently open in the editor stays open.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await studio.deleteDraft(org.id, id);
      if (draftId === id) setDraftId(null);
      reloadPlan();
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not delete the draft", "danger");
    }
  };

  const newDocument = async () => {
    const ok = await dialogs.confirm({
      title: "Start a new document?",
      message: "The page is cleared. Save the current document as a draft first if you need it.",
      confirmLabel: "Start new",
    });
    if (!ok) return;
    const next: Doc = { blocks: starterBlocks(), meta: EMPTY_META };
    past.current = [];
    future.current = [];
    docRef.current = next;
    setDoc(next);
    setDraftId(null);
    setSelectedId(null);
  };

  // ── Publish ────────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!node) return;
    const { meta } = doc;
    if (meta.title.trim().length < 2) {
      dialogs.toast("Give the document a title.", "danger");
      setInspectorTab("document");
      return;
    }
    if (!meta.classification) {
      dialogs.toast("Classification is compulsory.", "danger");
      setInspectorTab("document");
      return;
    }
    if (meta.description.trim().length < 8) {
      dialogs.toast("Add a short description — it becomes the document's description page.", "danger");
      setInspectorTab("document");
      return;
    }
    if (published.length === 0) {
      dialogs.toast("Add some content before publishing.", "danger");
      return;
    }
    if (quotaFull) {
      await dialogs.alert({
        title: "Document allowance reached",
        tone: "info",
        message: (
          <>
            <p>
              This organization has used all{" "}
              <strong>{limits?.documents.limit} custom documents</strong> included in its current
              plan.
            </p>
            <p>
              Please ask your main administrator to arrange a premium plan with the Knowledge Base
              team, or free up capacity by deleting documents that are no longer required.
            </p>
          </>
        ),
      });
      return;
    }

    setBusy("publish");
    try {
      const created = await courses.create(org.id, {
        roleNodeId: node.id,
        kind: meta.kind,
        title: meta.title.trim(),
        description: meta.description.trim(),
        scope: meta.scope.trim() || undefined,
        classification: meta.classification,
        allowDownload: false,
        inLibrary: meta.inLibrary,
        category: meta.category.trim() || undefined,
        blocks: published,
        theme: meta.theme,
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
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      if (draftId) await studio.deleteDraft(org.id, draftId).catch(() => undefined);
      router.push(created.draft ? `/orgs/${org.id}/requests` : `/orgs/${org.id}`);
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Publish failed", "danger");
    } finally {
      setBusy(null);
    }
  };

  // ── Shortcuts ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) {
        if (e.key === "Escape" && mode !== "edit") setMode("edit");
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "s") {
        e.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Guards ─────────────────────────────────────────────────────────────────
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

  const previewPages = paginate(published);

  return (
    <DndProvider onDrop={handleDrop}>
    <div className="studio-shell" data-mode={mode}>
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="studio-topbar glass">
        <div className="studio-topbar-main">
          <button className="btn btn-quiet btn-small" onClick={() => router.back()}>
            ← Back
          </button>
          <div className="studio-title-wrap">
            <input
              className="studio-title-input"
              placeholder="Untitled document"
              value={doc.meta.title}
              maxLength={120}
              onChange={(e) => setMeta({ ...doc.meta, title: e.target.value })}
            />
            <span className="studio-title-sub">
              {node.name}
              {doc.meta.classification ? ` · ${CLASS_LABEL[doc.meta.classification]}` : ""}
              {savedAt ? ` · draft saved ${savedAt}` : ""}
            </span>
          </div>
          {needsReview && <span className="badge">needs manager review</span>}
        </div>
        <div className="studio-topbar-actions">
          <div className="studio-mode-switch" role="tablist" aria-label="Studio mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              data-active={mode === "edit"}
              onClick={() => setMode("edit")}
            >
              ✎ Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preview"}
              data-active={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              👁 Preview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "present"}
              data-active={mode === "present"}
              onClick={() => setMode("present")}
            >
              ▷ Present
            </button>
          </div>
          <button
            className="btn btn-quiet btn-small"
            disabled={busy !== null}
            data-locked={!limits?.draftsEnabled}
            title={
              limits?.draftsEnabled
                ? "Park this document on the server (Ctrl+S)"
                : "Premium plans can park a document as a draft"
            }
            onClick={saveDraft}
          >
            {busy === "draft" ? "Saving…" : limits?.draftsEnabled ? "🖫 Save draft" : "🔒 Save draft"}
          </button>
          <button className="btn btn-primary btn-small" disabled={busy !== null} onClick={publish}>
            {busy === "publish" ? "Working…" : needsReview ? "Submit for review" : "Publish"}
          </button>
        </div>
      </div>

      {mode === "edit" && (
        <>
          <Ribbon
            selected={selected}
            onPatch={patchSelected}
            onInsert={(type) => insertBlock(type)}
            onUndo={undo}
            onRedo={redo}
            canUndo={past.current.length > 0}
            canRedo={future.current.length > 0}
            zoom={zoom}
            onZoom={setZoom}
          />

          <div className="studio-workspace">
            <SideRail
              tab={railTab}
              onTab={setRailTab}
              onInsert={(type) => insertBlock(type)}
              onInsertTable={(rows, cols) => insertBlock("table", undefined, { rows, cols })}
              pages={pages}
              activePage={activePage}
              onGoToPage={goToPage}
              onAddPage={addPage}
              onRemovePage={removePage}
              onPageTransition={setPageTransition}
              drafts={drafts}
              draftsEnabled={!!limits?.draftsEnabled}
              currentDraftId={draftId}
              onOpenDraft={openDraft}
              onDeleteDraft={deleteDraft}
              onNewDocument={newDocument}
            />

            <Canvas
              blocks={doc.blocks}
              theme={doc.meta.theme}
              orgName={org.name}
              title={doc.meta.title}
              zoom={zoom}
              selectedId={selectedId}
              blockEls={blockEls}
              showTemplates={untouched}
              onSelect={setSelectedId}
              onChange={updateBlock}
              onRemove={removeBlock}
              onDuplicate={(index) => setBlocks((blocks) => duplicateAt(blocks, index))}
              onMove={(index, delta) =>
                setBlocks((blocks) => moveBlock(blocks, index, delta < 0 ? index - 1 : index + 2))
              }
              onConvert={(id, to) =>
                setBlocks((blocks) => blocks.map((b) => (b._id === id ? convertBlock(b, to) : b)))
              }
              onInsertAfter={(index) => insertBlock("paragraph", index + 1)}
              onInsert={(type) => insertBlock(type)}
              onAddPage={addPage}
              onUseTemplate={useTemplate}
            />

            <Inspector
              tab={inspectorTab}
              onTab={setInspectorTab}
              block={selected}
              onBlockChange={updateBlock}
              meta={doc.meta}
              onMeta={setMeta}
              limits={limits}
              categories={categories}
              needsReview={needsReview}
            />
          </div>

          <div className="studio-status glass">
            <span>
              {stats.words} words · {stats.blocks} blocks · {stats.pages}{" "}
              {stats.pages === 1 ? "page" : "pages"} · ~{stats.minutes} min read
            </span>
            <span className="studio-status-right">
              {limits && limits.documents.limit != null && (
                <span data-full={quotaFull}>
                  {limits.documents.used} / {limits.documents.limit} custom documents used
                </span>
              )}
              <span>Saved in this browser</span>
            </span>
          </div>
        </>
      )}

      {mode === "preview" && (
        <div className="studio-preview">
          <div className="studio-device-bar">
            {DEVICES.map((d) => (
              <button
                key={d.key}
                type="button"
                data-active={device === d.key}
                onClick={() => setDevice(d.key)}
                title={`Preview at ${d.label.toLowerCase()} width`}
              >
                <span aria-hidden>{d.icon}</span> {d.label}
              </button>
            ))}
          </div>
          <div className={`doc-headerbar class-strip-${doc.meta.classification ?? "CONFIDENTIAL"}`}>
            <span className="doc-org">{org.name}</span>
            <span className="doc-class">
              {doc.meta.classification ? CLASS_LABEL[doc.meta.classification] : "—"}
            </span>
            <span className="doc-ver">draft</span>
          </div>
          <div
            className="studio-device-stage"
            style={{ maxWidth: DEVICES.find((d) => d.key === device)?.width ?? undefined }}
          >
          <article className="doc-sheet studio-preview-cover">
            <span className="doc-cover-org">{org.name}</span>
            <h1 className="doc-cover-title">{doc.meta.title || "Untitled document"}</h1>
            <p className="auth-sub">{doc.meta.description || "No description yet."}</p>
            {doc.meta.scope && <p className="auth-sub">Scope: {doc.meta.scope}</p>}
          </article>
          <DocumentBody blocks={published} theme={doc.meta.theme} />
          </div>
        </div>
      )}

      {mode === "present" && (
        <div className="studio-present">
          <div className="studio-present-bar">
            <span>
              {doc.meta.title || "Untitled document"} · {previewPages.length}{" "}
              {previewPages.length === 1 ? "page" : "pages"}
            </span>
            <button className="btn btn-quiet btn-small" onClick={() => setMode("edit")}>
              ✕ Exit (Esc)
            </button>
          </div>
          {previewPages.length ? (
            <DocumentPages pages={previewPages} theme={doc.meta.theme} className="studio-present-stage" />
          ) : (
            <p className="auth-sub studio-empty">Nothing to present yet — add some content.</p>
          )}
        </div>
      )}
    </div>
    </DndProvider>
  );
}
