"use client";

import type { AuthoredBlock, ExamBody } from "@vault/shared";
import type { StudioMeta } from "./model";

// Where the browser keeps work in progress. Both editors write here on every change, on
// every plan, so a reload or a crash never costs an author their work — parking a draft on
// the SERVER is the separate, paid capability. One module owns the key layout so the
// editors and the "continue a draft" list can never disagree about where to look.

export const documentDraftKey = (orgId: string, roleId: string | null) =>
  `kv.studio.${orgId}.${roleId ?? "none"}`;

export const examDraftKey = (orgId: string, roleId: string) => `kv.studio.exam.${orgId}.${roleId}`;

export interface LocalDraft {
  mode: "document" | "exam";
  title: string;
  /** Blocks in a document, questions in an exam. */
  count: number;
}

const text = (html?: string) => (html ?? "").replace(/<[^>]*>/g, "").trim();

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // a corrupt local copy is simply not offered
  }
}

/**
 * The unfinished work this browser is holding for a branch — only entries worth resuming,
 * so an editor that was opened and abandoned untouched is never offered back.
 */
export function localDraftsFor(orgId: string, roleId: string): LocalDraft[] {
  const found: LocalDraft[] = [];

  const doc = read<{ blocks?: AuthoredBlock[]; meta?: StudioMeta }>(
    documentDraftKey(orgId, roleId),
  );
  if (doc) {
    const blocks = doc.blocks ?? [];
    const written =
      !!doc.meta?.title?.trim() ||
      blocks.some(
        (b) =>
          text(b.html) ||
          b.url ||
          b.title?.trim() ||
          b.cells?.some((row) => row.some((c) => c.text.trim())) ||
          b.list?.some((i) => i.text.trim()),
      );
    if (written) {
      found.push({
        mode: "document",
        title: doc.meta?.title?.trim() || "Untitled document",
        count: blocks.length,
      });
    }
  }

  const exam = read<{ meta?: StudioMeta; exam?: ExamBody }>(examDraftKey(orgId, roleId));
  if (exam?.exam) {
    const questions = exam.exam.questions ?? [];
    const written =
      !!exam.meta?.title?.trim() ||
      !!exam.exam.intro?.trim() ||
      questions.some((q) => q.prompt.trim() || q.options.some((o) => o.text.trim()));
    if (written) {
      found.push({
        mode: "exam",
        title: exam.meta?.title?.trim() || "Untitled exam",
        count: questions.length,
      });
    }
  }

  return found;
}
