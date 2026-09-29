"use client";

import { useCallback, useEffect, useState } from "react";
import type { GdriveStorageConfigInput, S3StorageConfigInput, StorageView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { storageApi } from "@/lib/storage-client";
import { useDialogs } from "./dialogs";
import { StorageSetupFields, emptyStorageConfig } from "./StorageSetupFields";
import { GoogleDriveSetup } from "./GoogleDriveSetup";

// The organization's storage settings (docs/structure.md §9.3, §9.8, §9.12, §9.16): where
// its documents live, whether we can reach it, how much is stored, and what is still
// waiting to move off our database.
//
// Connecting or reconfiguring is Supreme-gated — it decides where the organization's
// documents live, which is the same class of decision as owner management and deletion.

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const megs = bytes / (1024 * 1024);
  if (megs < 1024) return `${Math.round(megs)} MB`;
  const gigs = megs / 1024;
  return gigs >= 1024 ? `${(gigs / 1024).toFixed(1)} TB` : `${gigs.toFixed(1)} GB`;
}

/** Why storage is degraded, in the words an owner can act on. */
const DEGRADED_WHY: Record<string, string> = {
  AUTH_REVOKED:
    "Knowledge Vault's access to the Google account was removed or has expired. Reconnect it below with the same account.",
  PERMISSION: "The connected account is no longer allowed to write to the Knowledge Vault folder.",
  ROOT_MISSING: "The Knowledge Vault folder is missing from the Drive. If it was deleted, restore it from Google Drive's trash.",
  QUOTA_FULL: "The storage is full. Free some space or add storage to the account.",
  UNREACHABLE: "The storage has not answered for a while.",
  KEY: "The platform key that opens this connection is missing. Contact the Knowledge Base team.",
};

type Backend = "s3" | "gdrive";

export function StoragePanel({
  orgId,
  supremeToken,
  onNeedSupreme,
}: {
  orgId: string;
  /** A live Supreme token, when the owner has already unlocked the gate. */
  supremeToken: string | null;
  /** Prompt for the Supreme password and resolve with a token, or null if refused. */
  onNeedSupreme: () => Promise<string | null>;
}) {
  const dialogs = useDialogs();
  const [view, setView] = useState<StorageView | null>(null);
  const [editing, setEditing] = useState(false);
  const [backend, setBackend] = useState<Backend>("s3");
  const [config, setConfig] = useState<S3StorageConfigInput>(emptyStorageConfig);
  const [gdrive, setGdrive] = useState<GdriveStorageConfigInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same gate as organization creation: settings nobody has reached are not saved. Here it
  // matters more, not less — pointing a live organization at unreachable storage stops
  // every upload it already depends on. The setup fieldsets clear this on any edit.
  const [tested, setTested] = useState(false);

  const load = useCallback(() => {
    storageApi
      .get(orgId)
      .then(setView)
      .catch(() => setView(null));
  }, [orgId]);
  useEffect(() => load(), [load]);

  async function save() {
    // Unlock first if needed, then carry straight on. Returning here and making the
    // owner press Save a second time reads like the button did nothing.
    const token = supremeToken ?? (await onNeedSupreme());
    if (!token) return; // cancelled or refused — the gate has already explained why

    const payload = backend === "gdrive" ? gdrive : config;
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      await storageApi.connect(orgId, payload, token);
      dialogs.toast(backend === "gdrive" ? "Google Drive connected." : "Storage connected.", "success");
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

  async function revokeLinks() {
    const ok = await dialogs.confirm({
      title: "Close every open document link?",
      message:
        "Anyone with a document open, or an upload in progress, will have to reopen it or start again. Use this if you think a link has been shared with someone who should not have it.",
      confirmLabel: "Close the links",
    });
    if (!ok) return;
    const token = supremeToken ?? (await onNeedSupreme());
    if (!token) return;
    setBusy(true);
    try {
      await storageApi.revokeTickets(orgId, token);
      dialogs.toast("Every open document link was closed.", "success");
    } catch (err) {
      dialogs.toast(err instanceof ApiError ? err.message : "Could not close the links", "danger");
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
    const reconnectingDrive = view.configured && view.adapter === "gdrive";
    const chosen: Backend = reconnectingDrive ? "gdrive" : view.configured ? "s3" : backend;
    return (
      <section className="panel storage-panel">
        <h3>
          {reconnectingDrive
            ? "Reconnect Google Drive"
            : view.configured
              ? "Reconfigure storage"
              : "Connect your storage"}
        </h3>
        <p className="muted">
          Knowledge Vault keeps your structure, people and records. Your documents live on
          storage you own — the space is yours, the cost is yours, and you can take
          everything with you at any time.
        </p>
        {!view.configured && (
          <div className="mode-choice">
            <label className="ack-row">
              <input
                type="radio"
                name="storageBackend"
                checked={backend === "s3"}
                onChange={() => {
                  setBackend("s3");
                  setTested(false);
                }}
              />
              <span>
                <strong>NAS — your own storage.</strong> An S3-compatible server on hardware you own.
              </span>
            </label>
            <label className="ack-row">
              <input
                type="radio"
                name="storageBackend"
                checked={backend === "gdrive"}
                onChange={() => {
                  setBackend("gdrive");
                  setTested(false);
                }}
              />
              <span>
                <strong>Google Drive.</strong> A folder in your Google Drive — personal or Workspace.
              </span>
            </label>
          </div>
        )}
        {chosen === "gdrive" ? (
          <GoogleDriveSetup
            intent={view.configured ? "reconnect" : "create"}
            orgId={orgId}
            onChange={setGdrive}
            onTested={setTested}
            showEncryptionChoice={!view.configured}
            requiredAccount={reconnectingDrive ? view.gdrive?.accountEmail : null}
          />
        ) : (
          <StorageSetupFields
            value={config}
            onChange={setConfig}
            onTested={setTested}
            webOrigin={typeof window === "undefined" ? "" : window.location.origin}
            // Fixed at activation: changing it re-encrypts everything already stored.
            showEncryptionChoice={!view.configured}
          />
        )}
        {error && <p className="form-error">{error}</p>}
        {!tested && (
          <p className="insp-warn">
            Run “Test connection” above first. Saving settings we have never reached would
            stop every upload this organization makes.
          </p>
        )}
        <div className="row-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy || !tested}>
            {busy ? "Saving…" : chosen === "gdrive" ? "Save Google Drive" : "Save storage settings"}
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

  const drive = view.adapter === "gdrive" ? view.gdrive : null;
  const usage = view.streamUsage;
  return (
    <section className="panel storage-panel">
      <h3>Storage{drive ? " — Google Drive" : ""}</h3>

      {view.status === "DEGRADED" && (
        <div className="warn-box" style={{ marginTop: 0 }}>
          <strong>We cannot reach your storage right now.</strong>
          <p>
            Your documents are safe and unchanged — they are on your own storage, and this is
            a connection problem, not a loss. New uploads are paused, and deadline reminders
            are paused too so nobody is marked late for something they could not open.
          </p>
          {view.degradedReason && DEGRADED_WHY[view.degradedReason] && <p>{DEGRADED_WHY[view.degradedReason]}</p>}
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
        {drive ? (
          <>
            <dt>Google account</dt>
            <dd>
              {drive.accountEmail}
              {drive.hostedDomain && <span className="muted"> · Workspace ({drive.hostedDomain})</span>}
            </dd>
            <dt>Folder</dt>
            <dd>
              {drive.folderUrl ? (
                <a href={drive.folderUrl} target="_blank" rel="noopener noreferrer">
                  Open in Google Drive ↗
                </a>
              ) : (
                "—"
              )}
            </dd>
            {drive.quotaLimitBytes !== null && drive.quotaUsedBytes !== null && (
              <>
                <dt>Drive space</dt>
                <dd>
                  {size(drive.quotaUsedBytes)} of {size(drive.quotaLimitBytes)} used
                  <span className="muted"> · shared with the account&rsquo;s Gmail and Photos</span>
                </dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>Address</dt>
            <dd>
              {view.endpoint}
              <span className="muted"> · bucket {view.bucket}</span>
            </dd>
          </>
        )}
        <dt>Documents</dt>
        <dd>
          {view.objectCount} object{view.objectCount === 1 ? "" : "s"} · {size(view.bytesUsed)}
        </dd>
        {usage && (
          <>
            <dt>Streaming this month</dt>
            <dd>
              {size(usage.bytes)} of {size(usage.limitBytes)}
              <span className="muted">
                {" "}
                · pauses at the allowance until the 1st, and is never billed
              </span>
              <meter
                className="stream-meter"
                min={0}
                max={usage.limitBytes}
                low={usage.limitBytes * 0.6}
                high={usage.limitBytes * 0.9}
                optimum={0}
                value={Math.min(usage.bytes, usage.limitBytes)}
              />
            </dd>
          </>
        )}
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
            setGdrive(null);
            setTested(false);
            setEditing(true);
          }}
        >
          {drive ? "Reconnect Google" : "Reconfigure"}
        </button>
        {drive && (
          <button className="btn btn-quiet" onClick={revokeLinks} disabled={busy}>
            Close open document links
          </button>
        )}
      </div>
    </section>
  );
}
