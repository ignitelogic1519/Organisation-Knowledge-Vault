import type { Classification, CourseKind } from "@vault/shared";

/**
 * How a document's kind and classification are written for people.
 *
 * These strings were copied into three screens before this module existed, which is how
 * the library came to say "Document" where the constellation drawer said "document". One
 * register, one place to change it.
 */

export const KIND_LABELS: Record<CourseKind, string> = {
  DOCUMENT: "Document",
  BOOK: "Book",
  EXAM: "Exam",
  LINK: "Link",
  AUDIO: "Audio",
  VIDEO: "Video",
};

export const CLASS_LABELS: Record<Classification, string> = {
  PUBLIC: "Public",
  CONFIDENTIAL: "Confidential",
  PRIVATE: "Private",
  SECRET: "Secret",
};

/** A kind that came back from the API as a plain string — never crash on an unknown one. */
export const kindLabel = (kind: string): string =>
  KIND_LABELS[kind as CourseKind] ?? kind.toLowerCase();

export const classLabel = (c: string): string =>
  CLASS_LABELS[c as Classification] ?? c.toLowerCase();

/** The shelf a document with no category tag stands on. */
export const UNSHELVED = "Uncategorised";
