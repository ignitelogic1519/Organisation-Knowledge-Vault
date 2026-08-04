"use client";

import type {
  StorageConfigInput,
  StorageTestResult,
  StorageView,
  UploadTicket,
} from "@vault/shared";
import { api } from "./auth-client";
import { uploadToOrgStorage } from "./storage-crypto";

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
  onProgress?: (stage: "preparing" | "encrypting" | "uploading" | "finishing") => void,
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

  onProgress?.(ticket.encrypted ? "encrypting" : "uploading");
  return uploadToOrgStorage(file, ticket, async (payload) => {
    onProgress?.("finishing");
    return api<{ storageObjectId: string; objectKey: string }>(
      `/orgs/${orgId}/storage/commit`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  });
}
