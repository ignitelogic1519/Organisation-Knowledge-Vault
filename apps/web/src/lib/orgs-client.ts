"use client";

import type { OrgDetail, OrgSummary, SupremeSession } from "@vault/shared";
import { api } from "./auth-client";

export const orgs = {
  list: () => api<OrgSummary[]>("/orgs"),
  get: (id: string) => api<OrgDetail>(`/orgs/${id}`),
  create: (input: {
    name: string;
    ownerRoleName: string;
    supremePassword: string;
    acknowledgedUnrecoverable: true;
  }) => api<OrgSummary>("/orgs", { method: "POST", body: JSON.stringify(input) }),
  supremeVerify: (id: string, password: string) =>
    api<SupremeSession>(`/orgs/${id}/supreme/verify`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  addOwner: (id: string, email: string, supremeToken: string) =>
    api<{ ok: boolean }>(`/orgs/${id}/owners`, {
      method: "POST",
      headers: { "x-supreme-token": supremeToken },
      body: JSON.stringify({ email }),
    }),
  removeOwner: (id: string, profileId: string, supremeToken: string) =>
    api<{ ok: boolean }>(`/orgs/${id}/owners/${profileId}`, {
      method: "DELETE",
      headers: { "x-supreme-token": supremeToken },
    }),
};
