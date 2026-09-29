"use client";

import type {
  GdriveConnectionView,
  StorageConfigInput,
  StorageTestResult,
  StorageView,
  UploadTicket,
} from "@vault/shared";
import { api } from "./auth-client";
import { uploadToOrgStorage, uploadViaGateway } from "./storage-crypto";

// Client for the storage settings screens and the direct-to-storage upload path
// (docs/structure.md §9.3).

export const storageApi = {
  /** The storage panel: status, usage, and what is still waiting to migrate. */
  get: (orgId: string) => api<StorageView>(`/orgs/${orgId}/storage`),

  /** Test a configuration without saving it — the setup form's Test button. */
  test: (config: StorageConfigInput) =>
    api<StorageTestResult>("/storage/test", {
      method: "POST",
      body: JSON.stringify(config),
    }),

  /** Connect or reconfigure. Supreme-gated: pass the token from the Supreme prompt. */
  connect: (orgId: string, config: StorageConfigInput, supremeToken: string) =>
    api<{ ok: boolean; status: string; encryption: string }>(`/orgs/${orgId}/storage`, {
      method: "POST",
      body: JSON.stringify(config),
      headers: { "x-supreme-token": supremeToken },
    }),

  /** Replace the access key without touching the rest of the configuration. */
  replaceCredentials: (
    orgId: string,
    credentials: { accessKeyId: string; secretAccessKey: string },
    supremeToken: string,
  ) =>
    api<{ ok: boolean }>(`/orgs/${orgId}/storage/credentials`, {
      method: "PUT",
      body: JSON.stringify(credentials),
      headers: { "x-supreme-token": supremeToken },
    }),

  /** Re-run the health check now rather than waiting for the nightly sweep. */
  check: (orgId: string) =>
    api<{ status: string; error: string | null }>(`/orgs/${orgId}/storage/check`, {
      method: "POST",
      body: "{}",
    }),

  /** Stop every outstanding streaming ticket at once. Supreme-gated. */
  revokeTickets: (orgId: string, supremeToken: string) =>
    api<{ ok: boolean }>(`/orgs/${orgId}/storage/revoke-tickets`, {
      method: "POST",
      body: "{}",
      headers: { "x-supreme-token": supremeToken },
    }),

  // ── Google Drive (§9.16) ──────────────────────────────────────────────────
  /** Whether this platform has a Google sign-in client at all. */
  googleStatus: () => api<{ configured: boolean; gatewayExternal: boolean }>("/storage/google/status"),
  /** The URL that starts a Google sign-in, opened in a pop-up. */
  googleAuthorize: (intent: "create" | "reconnect", orgId?: string) =>
    api<{ url: string }>("/storage/google/authorize", {
      method: "POST",
      body: JSON.stringify({ intent, ...(orgId ? { orgId } : {}) }),
    }),
  /** A completed sign-in waiting to be used. */
  googleConnection: (id: string) => api<GdriveConnectionView>(`/storage/google/connections/${id}`),
  /** Abandon a sign-in: its test folder is removed and Google forgets the grant. */
  cancelGoogleConnection: (id: string) =>
    api<{ ok: boolean }>(`/storage/google/connections/${id}`, { method: "DELETE" }),

  /** Move files still held in our database onto the organization's storage (§9.12). */
  migrate: (orgId: string) =>
    api<{ moved: number; remaining: number; errors: string[] }>(
      `/orgs/${orgId}/storage/migrate`,
      { method: "POST", body: "{}" },
    ),
};

/**
 * Upload a file to the organization's own storage and return the id to attach to a
 * course. The bytes go straight from this browser to their storage — our API issues the
 * signed link and records the result, and never sees the file.
 */
export async function uploadFile(
  orgId: string,
  file: File,
  onProgress?: (stage: "preparing" | "encrypting" | "uploading" | "finishing", fraction?: number) => void,
): Promise<{ storageObjectId: string }> {
  onProgress?.("preparing");
  const ticket = await api<UploadTicket>(`/orgs/${orgId}/storage/upload-url`, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      mime: file.type || "application/octet-stream",
      bytes: file.size,
    }),
  });

  const commit = async (payload: object) => {
    onProgress?.("finishing");
    return api<{ storageObjectId: string; objectKey: string }>(`/orgs/${orgId}/storage/commit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };
  // Google Drive: through the streaming gateway, in resumable chunks.
  if (ticket.transport === "gateway") {
    return uploadViaGateway(file, ticket, commit, (stage, fraction) => onProgress?.(stage, fraction));
  }

  onProgress?.(ticket.encrypted ? "encrypting" : "uploading");
  return uploadToOrgStorage(file, ticket, async (payload) => {
    onProgress?.("finishing");
    return api<{ storageObjectId: string; objectKey: string }>(
      `/orgs/${orgId}/storage/commit`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  });
}

/** What an upload is doing, in words — with a percentage once there is one to give. */
export function uploadStageLabel(
  stage: "preparing" | "encrypting" | "uploading" | "finishing",
  fraction?: number,
): string {
  const pct = typeof fraction === "number" ? ` ${Math.min(100, Math.round(fraction * 100))}%` : "";
  switch (stage) {
    case "encrypting":
      return `Encrypting in this browser…${pct}`;
    case "uploading":
      return `Uploading to your storage…${pct}`;
    case "finishing":
      return "Finishing…";
    default:
      return `Preparing…${pct}`;
  }
}
