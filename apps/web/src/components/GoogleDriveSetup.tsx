"use client";

import { useEffect, useRef, useState } from "react";
import type {
  EncryptionPosture,
  GdriveConnectionView,
  GdriveStorageConfigInput,
  StorageTestResult,
} from "@vault/shared";
import { storageApi } from "@/lib/storage-client";
import { ApiError } from "@/lib/auth-client";
import { connectGoogle, type GoogleConnectHandle } from "@/lib/google-connect";

// The Google Drive setup fieldset (docs/structure.md §9.16), shared by organization
// creation and the storage settings panel, so both ask the same questions in the same
// words and run the same connection test.
//
// Nothing secret is typed here. The owner signs in with Google in a pop-up; what comes
// back is a connection id that only they can use, for an hour. The grant it names can
// reach only the files Knowledge Vault itself creates in their Drive.

export function GoogleDriveSetup({
  intent,
  orgId,
  onChange,
  onTested,
  showEncryptionChoice = true,
  requiredAccount,
}: {
  intent: "create" | "reconnect";
  orgId?: string;
  /** The config to save, or null while it is not complete. */
  onChange: (config: GdriveStorageConfigInput | null) => void;
  /** Whether the current connection has passed its test. Any change retracts it. */
  onTested?: (passed: boolean) => void;
  /** Hidden when reconnecting: the posture is fixed once storage is active (§9.5). */
  showEncryptionChoice?: boolean;
  /** Reconnecting must use the account that already holds the files. */
  requiredAccount?: string | null;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  // Set when we could not ask at all — a different problem from "not switched on", and
  // saying the wrong one sends people looking in the wrong place.
  const [statusError, setStatusError] = useState<string | null>(null);
  const [connection, setConnection] = useState<GdriveConnectionView | null>(null);
  const [connecting, setConnecting] = useState<GoogleConnectHandle | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [encryption, setEncryption] = useState<EncryptionPosture>("ENCRYPTED");
  const [ack, setAck] = useState(false);
  const [test, setTest] = useState<StorageTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const connectionRef = useRef<string | null>(null);

  const checkStatus = () => {
    setStatusError(null);
    setConfigured(null);
    storageApi
      .googleStatus()
      .then((s) => {
        setConfigured(s.configured);
        setMissing(s.missing ?? []);
        setRedirectUri(s.redirectUri ?? null);
      })
      .catch((err: unknown) => {
        setStatusError(
          err instanceof ApiError && err.status === 404
            ? "Knowledge Vault's server is still running a version without Google Drive. Its update may still be deploying — try again in a few minutes."
            : "Knowledge Vault's server did not answer. It may be starting up — try again in a moment.",
        );
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(checkStatus, []);

  // Tell the surrounding form what would be saved, and retract any test result the
  // moment something it depended on changes.
  useEffect(() => {
    setTest(null);
    onTested?.(false);
    onChange(
      connection
        ? { adapter: "gdrive", connectionId: connection.connectionId, encryption, acknowledgedPersonalOwnership: ack }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, encryption, ack]);

  // A sign-in that is abandoned by leaving the page is revoked rather than left waiting.
  useEffect(() => {
    connectionRef.current = connection?.connectionId ?? null;
  }, [connection]);

  const wrongAccount =
    !!connection && !!requiredAccount && connection.accountEmail.toLowerCase() !== requiredAccount.toLowerCase();

  function start() {
    setConnectError(null);
    const handle = connectGoogle(intent, orgId);
    setConnecting(handle);
    handle.result
      .then((c) => {
        if (connection && connection.connectionId !== c.connectionId) {
          void storageApi.cancelGoogleConnection(connection.connectionId).catch(() => {});
        }
        setConnection(c);
      })
      .catch((err: unknown) => setConnectError(err instanceof Error ? err.message : "Google sign-in failed."))
      .finally(() => setConnecting(null));
  }

  function forget() {
    if (connection) void storageApi.cancelGoogleConnection(connection.connectionId).catch(() => {});
    setConnection(null);
    setAck(false);
  }

  async function runTest() {
    if (!connection) return;
    setTest(null);
    onTested?.(false);
    setTesting(true);
    try {
      const result = await storageApi.test({
        adapter: "gdrive",
        connectionId: connection.connectionId,
        encryption,
        acknowledgedPersonalOwnership: ack,
      });
      setTest(result);
      onTested?.(result.ok && ack && !wrongAccount);
    } catch (err) {
      setTest({ ok: false, steps: [], error: err instanceof Error ? err.message : "Could not run the test" });
    } finally {
      setTesting(false);
    }
  }

  if (statusError) {
    return (
      <div className="warn-box">
        <strong>We could not check whether Google Drive is available.</strong>
        <p>{statusError}</p>
        <button type="button" className="btn btn-small" onClick={checkStatus}>
          Try again
        </button>
      </div>
    );
  }

  if (configured === false) {
    return (
      <div className="info-box">
        <strong>Google Drive is not switched on for this Knowledge Vault yet.</strong>
        <p>
          The platform needs its own Google sign-in client before any organization can connect a
          Drive. Ask the Knowledge Base team — it is a one-time setup on their side.
        </p>
        {missing.length > 0 && (
          <details className="gdrive-missing">
            <summary>For the Knowledge Base team</summary>
            <p>
              Set {missing.length === 1 ? "this setting" : "these settings"} on the API service
              (Render → Environment), then redeploy:
            </p>
            <ul>
              {missing.map((m) => (
                <li key={m}>
                  <code>{m}</code>
                </li>
              ))}
            </ul>
            {redirectUri && (
              <p>
                The Google OAuth client&rsquo;s authorized redirect URI must be exactly{" "}
                <code>{redirectUri}</code>.
              </p>
            )}
            <p>
              Step by step: <code>docs/storage-setup-guide.md</code>, Part 4.2.
            </p>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="storage-setup gdrive-setup">
      <p className="muted">
        Your documents go into a folder called <strong>Knowledge Vault</strong> in your Google Drive.
        Knowledge Vault asks Google for access to <strong>only the files it creates there</strong> — it
        can never see or change anything else in your Drive.{" "}
        <a href="/privacy/google" target="_blank" rel="noreferrer">
          Exactly what we can reach, and keep
        </a>
        .
      </p>

      <div className="info-box">
        <strong>How documents travel</strong>
        <p>
          Google Drive has no private link for a single file, so uploads and viewing pass through
          Knowledge Vault&rsquo;s streaming service on the way to and from your Drive. Encrypted
          documents pass through locked; nothing is ever kept. Streaming has a monthly allowance,
          shown in storage settings.
        </p>
      </div>

      {!connection ? (
        <div className="storage-test-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={start}
            disabled={!!connecting || configured === null}
          >
            {connecting ? "Waiting for Google…" : "Connect your Google account"}
          </button>
          {connecting && (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => connecting.cancel()}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className={wrongAccount ? "warn-box" : "gdrive-connected"}>
          <p>
            <span className="ok-text">✓</span> Connected as <strong>{connection.accountEmail}</strong>
            {connection.isWorkspace && <span className="badge">Google Workspace</span>}{" "}
            <button type="button" className="linklike" onClick={forget}>
              Use a different account
            </button>
          </p>
          {wrongAccount && (
            <p>
              This organization&rsquo;s documents are in <strong>{requiredAccount}</strong>&rsquo;s Drive.
              Another account cannot see those files — connect with {requiredAccount}.
            </p>
          )}
        </div>
      )}
      {connectError && <p className="form-error">{connectError}</p>}

      {connection && (
        <>
          {showEncryptionChoice && (
            <fieldset className="field storage-posture">
              <legend>How should your documents be stored in Drive?</legend>
              <label className="ack-row">
                <input
                  type="radio"
                  name="gdrive-encryption"
                  checked={encryption === "ENCRYPTED"}
                  onChange={() => setEncryption("ENCRYPTED")}
                />
                <span>
                  <strong>Encrypted (recommended).</strong> Documents are stored as locked files that
                  only Knowledge Vault — or your <code>.main</code> file and Supreme password — can open.
                  Nobody who opens the folder in Drive can read them, including your own
                  administrators, and Drive&rsquo;s search and AI features see nothing.
                </span>
              </label>
              <label className="ack-row">
                <input
                  type="radio"
                  name="gdrive-encryption"
                  checked={encryption === "PLAIN"}
                  onChange={() => setEncryption("PLAIN")}
                />
                <span>
                  <strong>Readable files.</strong> Documents are stored as ordinary files you can open in
                  Drive, under their own names. Anyone who can open that folder can read every one of
                  them, and Drive&rsquo;s search and AI features can too.
                </span>
              </label>
              <small className="muted">
                This choice is fixed once your storage is connected — changing it later means
                re-encrypting every document you have stored.
              </small>
            </fieldset>
          )}

          <label className="ack-row gdrive-ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              I understand these documents will be stored in <strong>{connection.accountEmail}</strong>
              &rsquo;s Google Drive and count against its storage. If that account is deleted or loses
              access, the documents go with it — so keep the organization&rsquo;s <code>.main</code> file
              safe, and{" "}
              {connection.isWorkspace
                ? "prefer a dedicated account (such as knowledge-vault@your-company.com) over a person's own."
                : "use an account you will keep."}
            </span>
          </label>

          <div className="storage-test-row">
            <button
              type="button"
              className="btn"
              onClick={runTest}
              disabled={testing || !ack || wrongAccount}
              data-state={test?.ok ? "ok" : test ? "bad" : undefined}
            >
              {testing ? "Testing…" : test?.ok ? "✓ Connection tested" : "Test connection"}
            </button>
            {test?.ok ? (
              <span className="ok-text">✓ Connected — your Google Drive is ready.</span>
            ) : (
              !testing && (
                <span className="auth-sub">
                  {ack ? "The test has to pass before this can be saved." : "Tick the box above, then test."}
                </span>
              )
            )}
          </div>

          {test && (
            <ul className={test.ok ? "storage-test-steps" : "form-error storage-test-result"}>
              {!test.ok && <strong>{test.error}</strong>}
              {!test.ok && test.hint && <p>{test.hint}</p>}
              {test.steps.map((s) => (
                <li key={s.step}>
                  {s.ok ? "✓" : "✗"} {s.label}
                  {s.detail ? ` — ${s.detail}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
