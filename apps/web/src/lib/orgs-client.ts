"use client";

import type {
  AddPersonInput,
  CreateRequestInput,
  DecideRequestInput,
  OrgDetail,
  OrgSummary,
  RequestsOverview,
  StructureView,
  SupremeSession,
} from "@vault/shared";
import { api } from "./auth-client";

export const orgs = {
  list: () => api<OrgSummary[]>("/orgs"),
  listDeleted: () =>
    api<{ id: string; name: string; orgNumber: number; deletedAt: string; purgeAt: string }[]>(
      "/orgs/deleted",
    ),
  undelete: (id: string, password: string) =>
    api<{ ok: boolean }>(`/orgs/${id}/undelete`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
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
  addOwner: (id: string, username: string, supremeToken: string) =>
    api<{ ok: boolean }>(`/orgs/${id}/owners`, {
      method: "POST",
      headers: { "x-supreme-token": supremeToken },
      body: JSON.stringify({ username }),
    }),
  removeOwner: (id: string, profileId: string, supremeToken: string) =>
    api<{ ok: boolean }>(`/orgs/${id}/owners/${profileId}`, {
      method: "DELETE",
      headers: { "x-supreme-token": supremeToken },
    }),
};

export const roles = {
  structure: (orgId: string) => api<StructureView>(`/orgs/${orgId}/structure`),
  createSubRole: (roleId: string, name: string, isPublic = true) =>
    api<{ id: string }>(`/roles/${roleId}/children`, {
      method: "POST",
      body: JSON.stringify({ name, isPublic }),
    }),
  addPerson: (roleId: string, input: AddPersonInput) =>
    api<{ ok: boolean; invited: boolean }>(`/roles/${roleId}/people`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  removePerson: (roleId: string, profileId: string) =>
    api<{ ok: boolean }>(`/roles/${roleId}/people/${profileId}`, { method: "DELETE" }),
  setPublic: (roleId: string, isPublic: boolean) =>
    api<{ ok: boolean }>(`/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify({ isPublic }),
    }),
  setPersonFlags: (
    roleId: string,
    profileId: string,
    flags: { canCreateSubgroups?: boolean; canAddCoOwners?: boolean },
  ) =>
    api<{ ok: boolean }>(`/roles/${roleId}/people/${profileId}`, {
      method: "PATCH",
      body: JSON.stringify(flags),
    }),
  deleteRole: (roleId: string) => api<{ ok: boolean }>(`/roles/${roleId}`, { method: "DELETE" }),
};

export const requests = {
  overview: (orgId: string) => api<RequestsOverview>(`/orgs/${orgId}/requests`),
  create: (orgId: string, input: CreateRequestInput) =>
    api<{ ok: boolean; id: string }>(`/orgs/${orgId}/requests`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  decide: (requestId: string, input: DecideRequestInput) =>
    api<{ ok: boolean; status: string }>(`/requests/${requestId}/decide`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  withdraw: (requestId: string) =>
    api<{ ok: boolean }>(`/requests/${requestId}`, { method: "DELETE" }),
};
