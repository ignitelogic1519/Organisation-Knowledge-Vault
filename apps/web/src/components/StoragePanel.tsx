"use client";

import { useCallback, useEffect, useState } from "react";
import type { StorageConfigInput, StorageView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { storageApi } from "@/lib/storage-client";
import { useDialogs } from "./dialogs";
import { StorageSetupFields, emptyStorageConfig } from "./StorageSetupFields";

// The organization's storage settings (docs/structure.md §9.3, §9.8, §9.12): where its
// documents live, whether we can reach it, how much is stored, and what is still waiting
// to move off our database.
//
// Connecting or reconfiguring is Supreme-gated — it decides where the organization's
// documents live, which is the same class of decision as owner management and deletion.

function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megs = bytes / (1024 * 1024);
  return megs >= 1024 ? `${(megs / 1024).toFixed(1)} GB` : `${Math.round(megs)} MB`;
}

export function StoragePanel({
  orgId,
  supremeToken,
  onNeedSupreme,
}: {
  orgId: string;
  /** A live Supreme token, when the owner has already unlocked the gate. */
  supremeToken: string | null;
  /** Ask the surrounding page to prompt for the Supreme password. */
  onNeedSupreme: () => void;
}) {
  const dialogs = useDialogs();
  const [view, setView] = useState<StorageView | null>(null);
  const [editing, setEditing] = useState(false);
  const [config, setConfig] = useState<StorageConfigInput>(emptyStorageConfig);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    storageApi
      .get(orgId)
      .then(setView)
      .catch(() => setView(null));
  }, [orgId]);
  useEffect(() => load(), [load]);

  async function save() {
    if (!supremeToken) {
      onNeedSupreme();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await storageApi.connect(orgId, config, supremeToken);
      dialogs.toast("Storage connected.", "success");
      setEditing(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the storage settings");
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    setBusy(true);
    try {
      const result = await storageApi.check(orgId);
      dialogs.toast(
        result.status === "ACTIVE"
          ? "Your storage is reachable."
          : `Still unreachable — ${result.error ?? "no detail given"}`,
        result.status === "ACTIVE" ? "success" : "danger",
      );
      load();
    } finally {
      setBusy(false);
    }
  }

  async function migrate() {
    setBusy(true);
    try {
      const result = await storageApi.migrate(orgId);
      dialogs.toast(
        result.remaining === 0
          ? `Moved ${result.moved} — everything is now on your storage.`
          : `Moved ${result.moved}; ${result.remaining} still to go. Run it again to continue.`,
        "success",
      );
      load();
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Migration failed", "danger");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <div className="skeleton" style={{ height: 120 }} />;

  if (editing || !view.configured) {
    return (
      <section className="panel storage-panel">
        <h3>{view.configured ? "Reconfigure storage" : "Connect your storage"}</h3>
        <p className="muted">
          Knowledge Vault keeps your structure, people and records. Your documents live on
          storage you own — the space is yours, the cost is yours, and you can take
          everything with you at any time.
        </p>
        <StorageSetupFields
          value={config}
          onChange={setConfig}
          webOrigin={typeof window === "undefined" ? "" : window.location.origin}
          // Fixed at activation: changing it re-encrypts everything already stored.
          showEncryptionChoice={!view.configured}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="row-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save storage settings"}
          </button>
          {view.configured && (
            <button className="btn" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
        {!supremeToken && (
          <p className="muted">
            Saving this needs your Supreme password — the same gate as owner changes.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="panel storage-panel">
      <h3>Storage</h3>

      {view.status === "DEGRADED" && (
        <div className="warn-box" style={{ marginTop: 0 }}>
          <strong>We cannot reach your storage right now.</strong>
          <p>
            Your documents are safe and unchanged — they are on your own storage, and this is
            a connection problem, not a loss. New uploads are paused, and deadline reminders
            are paused too so nobody is marked late for something they could not open.
          </p>
          {view.lastError && <p className="muted">{view.lastError}</p>}
        </div>
      )}

      <dl className="kv-list">
        <dt>Status</dt>
        <dd>
          {view.status === "ACTIVE" ? "✓ Connected" : "⚠ Unreachable"}
          {view.lastCheckAt && (
            <span className="muted"> · checked {new Date(view.lastCheckAt).toLocaleString()}</span>
          )}
        </dd>
        <dt>Address</dt>
        <dd>
          {view.endpoint}
          <span className="muted"> · bucket {view.bucket}</span>
        </dd>
        <dt>Documents</dt>
        <dd>
          {view.objectCount} object{view.objectCount === 1 ? "" : "s"} · {mb(view.bytesUsed)}
        </dd>
        <dt>Encryption</dt>
        <dd>
          {view.encryption === "ENCRYPTED"
            ? "Encrypted — unreadable from the storage itself"
            : "Readable files"}
        </dd>
      </dl>

      {view.pendingMigration > 0 && (
        <div className="info-box">
          <strong>
            {view.pendingMigration} document{view.pendingMigration === 1 ? "" : "s"} still on
            our servers.
          </strong>
          <p>
            These were uploaded before you connected your storage. Moving them copies each one
            across, checks it arrived intact, and only then removes our copy.
          </p>
          <button className="btn" onClick={migrate} disabled={busy}>
            {busy ? "Moving…" : "Move them to my storage"}
          </button>
        </div>
      )}

      <div className="row-actions">
        <button className="btn" onClick={recheck} disabled={busy}>
          Check connection
        </button>
        <button
          className="btn"
          onClick={() => {
            setConfig({ ...emptyStorageConfig, encryption: view.encryption ?? "ENCRYPTED" });
            setEditing(true);
          }}
        >
          Reconfigure
        </button>
      </div>
    </section>
  );
}
