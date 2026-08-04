"use client";

import { createContext, useContext } from "react";
import type { OrgDetail } from "@vault/shared";

// Shared by every page under /orgs/[id] — the layout fetches the org once and the
// Overview / Constellation / Admin tabs consume it here.

export interface OrgContextValue {
  org: OrgDetail;
  reload: () => void;
  /** True when the signed-in profile holds an OWNER placement anywhere in this org. */
  isAdmin: boolean;
  /** True when they own the Supreme (root) role specifically. */
  isSupremeOwner: boolean;
}

export const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside /orgs/[id] pages");
  return ctx;
}

/**
 * The organization when one is in scope, or null. Used by chrome that renders both
 * inside and outside an organization — breadcrumbs, for one — where the strict `useOrg`
 * would throw on every public page.
 */
export function useOrgOptional(): OrgContextValue | null {
  return useContext(OrgContext);
}
