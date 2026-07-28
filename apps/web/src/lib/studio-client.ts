"use client";

import type {
  OrgPlanLimitsView,
  SaveStudioDraftInput,
  StudioDraftSummary,
  StudioDraftView,
} from "@vault/shared";
import { api } from "./auth-client";

// Document Studio API: the organization's plan allowances and the premium draft store.

export const studio = {
  /** What the org's plan allows and how much is already spent. */
  limits: (orgId: string) => api<OrgPlanLimitsView>(`/orgs/${orgId}/plan-limits`),
  drafts: (orgId: string) =>
    api<{ drafts: StudioDraftSummary[]; enabled: boolean }>(`/orgs/${orgId}/studio-drafts`),
  draft: (orgId: string, draftId: string) =>
    api<StudioDraftView>(`/orgs/${orgId}/studio-drafts/${draftId}`),
  saveDraft: (orgId: string, input: SaveStudioDraftInput) =>
    api<StudioDraftView>(`/orgs/${orgId}/studio-drafts`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteDraft: (orgId: string, draftId: string) =>
    api<{ ok: boolean }>(`/orgs/${orgId}/studio-drafts/${draftId}`, { method: "DELETE" }),
};
