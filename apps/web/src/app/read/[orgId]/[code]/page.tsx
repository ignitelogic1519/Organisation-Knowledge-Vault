"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ApiError, hasSession } from "@/lib/auth-client";
import { courses } from "@/lib/courses-client";
import { orgs } from "@/lib/orgs-client";
import type { ViewerItem } from "@/components/CourseViewer";

// Loaded in the browser only: the viewer reaches PDF.js, which needs DOM globals that do
// not exist while this page is rendered on the server. Every other route reaches the viewer
// behind a shell that renders nothing until it has data, so only this one has to say it.
const CourseViewer = dynamic(
  () => import("@/components/CourseViewer").then((m) => m.CourseViewer),
  { ssr: false, loading: () => <div className="skeleton" style={{ position: "fixed", inset: 0 }} /> },
);

// The reader window: one document, a window of its own, and nothing else on the page —
// no navigation bar, no mailbox, no sidebar. It renders the SAME viewer the in-app reader
// uses, so every option (cover pages that turn, fullscreen, download, related documents,
// mark complete, rate & review) is here too; it simply has the whole window to work in.
// Opened by openInWindow() in components/CourseViewer.tsx.

type Item = ViewerItem;

export default function ReaderWindowPage() {
  const { orgId, code } = useParams<{ orgId: string; code: string }>();
  const params = useSearchParams();
  const router = useRouter();
  // ?mode=preview — reviewing a document rather than studying it: no completion, no review.
  const previewMode = params.get("mode") === "preview";
  const [orgName, setOrgName] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  // A document nobody assigned to this reader (a draft under review, a library browse) has
  // nothing to complete, so the study actions stay off for it as well.
  const [assigned, setAssigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const org = await orgs.get(orgId);
      setOrgName(org.name);
      const mine = await courses.myLearning(orgId).catch(() => null);
      const mineItem = mine
        ? [...mine.mandatory, ...mine.optIn].find((i) => i.code === code)
        : undefined;
      if (mineItem) {
        setAssigned(true);
        setItem(mineItem);
        return;
      }
      const c = await courses.info(code);
      setAssigned(false);
      setItem({
        code: c.code,
        title: c.title,
        kind: c.kind,
        version: c.version,
        status: "AVAILABLE",
        mandatory: false,
        missingPrerequisites: [],
        prerequisiteCodes: c.prerequisiteCodes,
        viaRoleName: "",
        description: c.description,
        scope: c.scope,
        classification: c.classification,
        allowDownload: c.allowDownload,
        publishedAt: c.publishedAt,
        creatorName: c.creatorName,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open this document");
    }
  }, [orgId, code]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [load, router]);

  // The window's own title, so a reader with several documents open can tell them apart
  // from the taskbar.
  useEffect(() => {
    if (item) document.title = `${item.title} · Knowledge Vault`;
  }, [item]);

  // Closing the reader closes its window. If this page was reached by typing the address
  // (a window the script never opened, which close() may not touch), fall back to the
  // organization's learning list rather than leaving a dead ✕.
  const close = useCallback(() => {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) router.replace(`/orgs/${orgId}/learning`);
    }, 200);
  }, [orgId, router]);

  if (error) {
    return (
      <main className="reader-window-empty">
        <div className="empty-card glass">
          <h2>This document didn&apos;t open</h2>
          <p className="auth-sub">{error}</p>
          <button className="btn btn-quiet btn-small" onClick={close}>
            Close this window
          </button>
        </div>
      </main>
    );
  }

  if (!item) return <div className="skeleton" style={{ position: "fixed", inset: 0 }} />;

  return (
    <CourseViewer
      standalone
      item={item}
      orgName={orgName}
      readOnly={previewMode || !assigned}
      onClose={close}
      onChanged={() => void load()}
      onOpenRelated={(related) => router.push(`/read/${orgId}/${related}`)}
    />
  );
}
