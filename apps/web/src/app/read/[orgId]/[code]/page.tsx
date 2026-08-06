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

// The reader: one document, the whole screen, and nothing else on the page — no navigation
// bar, no mailbox, no sidebar. It renders the SAME viewer the in-app reader uses, so every
// option (cover pages that turn, fullscreen, download, related documents, mark complete,
// rate & review) is here too; it simply has the whole window to work in.
//
// On a desktop browser it arrives as a window of its own. On a phone, and inside the Android
// shell — a single WebView with no tab strip and no second window — it opens in the same view
// instead, which is why it always draws its OWN tabs: one back to the page it was opened
// from (`?from=`), one for the document. Opened by openInWindow() in lib/reader-window.ts.

type Item = ViewerItem;

/** Which page the reader came from, and what to call it on the tab. */
function backTarget(from: string | null, orgId: string): { href: string; label: string } {
  // Only a path within this app is ever followed — a `from` from anywhere else is ignored.
  const safe = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const href = safe ?? `/orgs/${orgId}/learning`;
  if (href.includes("/library")) return { href, label: "Library" };
  if (href.includes("/requests")) return { href, label: "Requests" };
  if (href.includes("/learning")) return { href, label: "My Learning" };
  if (href.includes("/compliance")) return { href, label: "Compliance" };
  return { href, label: "Back to the app" };
}

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

  const back = backTarget(params.get("from"), orgId);

  // Leaving the reader means whatever leaving means here: a window this script opened gets
  // closed; a view that IS the app (a phone, the Android shell, or an address typed by hand)
  // goes back to the page the document was opened from. A ✕ that does nothing is not an
  // option on a device with no tabs to escape to.
  const leave = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.close();
      // close() is refused in some embedders; only navigate if we are still here.
      window.setTimeout(() => {
        if (!window.closed) router.replace(back.href);
      }, 200);
      return;
    }
    router.replace(back.href);
  }, [router, back.href]);

  if (error) {
    return (
      <main className="reader-window-empty">
        <div className="empty-card glass">
          <h2>This document didn&apos;t open</h2>
          <p className="auth-sub">{error}</p>
          <button className="btn btn-quiet btn-small" onClick={leave}>
            ← {back.label}
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
      backTab={{ label: back.label, onGo: leave }}
      onClose={leave}
      onChanged={() => void load()}
      onOpenRelated={(related) =>
        router.push(
          `/read/${orgId}/${related}?${new URLSearchParams({
            ...(previewMode ? { mode: "preview" } : {}),
            from: back.href,
          }).toString()}`,
        )
      }
    />
  );
}
