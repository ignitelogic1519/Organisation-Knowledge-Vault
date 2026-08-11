"use client";

import { useState } from "react";
import {
  STORAGE_ADAPTERS,
  corsRulesFor,
  storageConfigSchema,
  type StorageConfigInput,
  type StorageTestResult,
} from "@vault/shared";
import { storageApi } from "@/lib/storage-client";

// The storage setup fieldset (docs/structure.md §9.3). Shared by organization creation
// and the storage settings screen, so both ask the same questions in the same words and
// run the same connection test.
//
// The backend is chosen by the surrounding form (NAS or KVEP); these are the fields for
// a NAS connection. `adapter: "s3"` rides along in the config value.

export interface StorageSetupValue extends StorageConfigInput {}

const EMPTY: StorageConfigInput = {
  adapter: "s3",
  endpoint: "",
  bucket: "",
  region: "us-east-1",
  prefix: "",
  forcePathStyle: true,
  accessKeyId: "",
  secretAccessKey: "",
  encryption: "ENCRYPTED",
};

export function StorageSetupFields({
  value,
  onChange,
  webOrigin,
  showEncryptionChoice = true,
  onTested,
}: {
  value: StorageConfigInput;
  onChange: (next: StorageConfigInput) => void;
  webOrigin: string;
  /** Hidden when reconfiguring: the posture is fixed once storage is activated (§9.5). */
  showEncryptionChoice?: boolean;
  /**
   * Whether these exact settings have been PROVEN to work. The surrounding form gates its
   * own save on it: an organization created against storage nobody has reached is an
   * organization that cannot accept a single upload, and the owner finds out afterwards.
   * Any edit to the settings retracts it — the proof belonged to the old values.
   */
  onTested?: (passed: boolean) => void;
}) {
  const [test, setTest] = useState<StorageTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const set = <K extends keyof StorageConfigInput>(key: K, next: StorageConfigInput[K]) => {
    // Changing a field invalidates the last result — it was about different settings.
    if (test) {
      setTest(null);
      onTested?.(false);
    }
    onChange({ ...value, [key]: next });
  };

  async function runTest() {
    setTest(null);
    onTested?.(false);
    const parsed = storageConfigSchema.safeParse(value);
    if (!parsed.success) {
      setTest({ ok: false, steps: [], error: parsed.error.issues[0].message });
      return;
    }
    setTesting(true);
    try {
      const result = await storageApi.test(parsed.data);
      setTest(result);
      onTested?.(result.ok);
    } catch (err) {
      setTest({
        ok: false,
        steps: [],
        error: err instanceof Error ? err.message : "Could not run the test",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="storage-setup">
      {/* No backend picker here. The surrounding form has already asked where documents
          go, and with one backend available a second dropdown that cannot be changed is
          just noise. The adapter still travels in the config value (`adapter: "s3"`),
          so nothing about what gets saved has changed — only what is shown. When a
          second backend ships, the picker belongs in the surrounding choice, not here. */}
      <p className="muted">{STORAGE_ADAPTERS[0].blurb}</p>

      <div className="warn-box" style={{ marginTop: 0 }}>
        <strong>Your NAS needs to be reachable from the internet.</strong>
        <p>
          Knowledge Vault runs in a datacentre, so it cannot see a NAS that only exists on
          your office network. The safest way to fix that is a{" "}
          <strong>Cloudflare Tunnel</strong> — one container on the NAS, no ports opened on
          your firewall, and you get a proper HTTPS address.{" "}
          <button type="button" className="linklike" onClick={() => setShowGuide((v) => !v)}>
            {showGuide ? "Hide setup steps" : "Show setup steps"}
          </button>
        </p>
      </div>

      {showGuide && (
        <div className="info-box">
          <ol>
            <li>
              On the NAS, install <strong>MinIO</strong> (Docker). It gives your NAS an S3
              address, which is what lets your people download at your NAS&rsquo;s full
              speed instead of through us.
            </li>
            <li>
              Create a bucket — for example <code>knowledge-vault</code>. Keep it{" "}
              <strong>private</strong>; we refuse to connect a public one.
            </li>
            <li>
              Create an access key scoped to that bucket. It needs read, write, delete and
              list — nothing else.
            </li>
            <li>
              Install <strong>Cloudflare Tunnel</strong> (also Docker) pointed at MinIO&rsquo;s
              port, and note the HTTPS address it gives you. No port forwarding needed.
            </li>
            <li>
              Set the bucket&rsquo;s CORS rules so your people&rsquo;s browsers may upload and
              download directly:
              <pre className="code-block">{corsRulesFor(webOrigin)}</pre>
            </li>
          </ol>
        </div>
      )}

      <label className="field">
        <span>Storage address</span>
        <input
          value={value.endpoint}
          onChange={(e) => set("endpoint", e.target.value)}
          placeholder="https://storage.your-company.com"
        />
        <small>The HTTPS address of MinIO on your NAS.</small>
      </label>

      <label className="field">
        <span>Bucket</span>
        <input
          value={value.bucket}
          onChange={(e) => set("bucket", e.target.value)}
          placeholder="knowledge-vault"
        />
        <small>It must already exist — we never create buckets on your storage.</small>
      </label>

      <label className="field">
        <span>Access key ID</span>
        <input
          value={value.accessKeyId}
          onChange={(e) => set("accessKeyId", e.target.value)}
          autoComplete="off"
        />
      </label>

      <label className="field">
        <span>Secret access key</span>
        <input
          type="password"
          value={value.secretAccessKey}
          onChange={(e) => set("secretAccessKey", e.target.value)}
          autoComplete="new-password"
        />
        <small>
          Encrypted before it is stored, with a key that is not kept in our database. It is
          never shown again after saving.
        </small>
      </label>

      <details className="storage-advanced">
        <summary>Advanced</summary>
        <label className="field">
          <span>Folder prefix</span>
          <input
            value={value.prefix}
            onChange={(e) => set("prefix", e.target.value)}
            placeholder="knowledge-vault/"
          />
          <small>Optional — lets you share the bucket with other systems.</small>
        </label>
        <label className="field">
          <span>Region</span>
          <input value={value.region} onChange={(e) => set("region", e.target.value)} />
          <small>MinIO ignores this. Leave it as it is unless your storage asks for one.</small>
        </label>
        <label className="ack-row">
          <input
            type="checkbox"
            checked={value.forcePathStyle}
            onChange={(e) => set("forcePathStyle", e.target.checked)}
          />
          <span>Path-style addressing (MinIO needs this on)</span>
        </label>
      </details>

      {showEncryptionChoice && (
        <fieldset className="field storage-posture">
          <legend>How should your documents be stored?</legend>
          <label className="ack-row">
            <input
              type="radio"
              name="encryption"
              checked={value.encryption === "ENCRYPTED"}
              onChange={() => set("encryption", "ENCRYPTED")}
            />
            <span>
              <strong>Encrypted (recommended).</strong> Documents land on your NAS as
              unreadable blobs. Nobody can open them from the NAS itself — including your own
              IT — only through Knowledge Vault, or with your <code>.main</code> file and
              Supreme password.
            </span>
          </label>
          <label className="ack-row">
            <input
              type="radio"
              name="encryption"
              checked={value.encryption === "PLAIN"}
              onChange={() => set("encryption", "PLAIN")}
            />
            <span>
              <strong>Readable files.</strong> Documents land on your NAS as ordinary PDFs and
              images you can browse yourself. Anyone with access to the NAS can read anything
              on it.
            </span>
          </label>
          <small className="muted">
            This choice is fixed once your storage is connected — changing it later means
            re-encrypting every document you have stored.
          </small>
        </fieldset>
      )}

      <div className="storage-test-row">
        <button
          type="button"
          className="btn"
          onClick={runTest}
          disabled={testing}
          data-state={test?.ok ? "ok" : test ? "bad" : undefined}
        >
          {testing ? "Testing…" : test?.ok ? "✓ Connection tested" : "Test connection"}
        </button>
        {test?.ok ? (
          <span className="ok-text">✓ Connected — your storage is ready.</span>
        ) : (
          !testing && (
            <span className="auth-sub">
              The test has to pass before these settings can be saved.
            </span>
          )
        )}
      </div>

      {test && !test.ok && (
        <div className="form-error storage-test-result">
          <strong>{test.error}</strong>
          {test.hint && <p>{test.hint}</p>}
          {test.steps.length > 0 && (
            <ul>
              {test.steps.map((s) => (
                <li key={s.step}>
                  {s.ok ? "✓" : "✗"} {s.label}
                  {s.detail ? ` — ${s.detail}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export { EMPTY as emptyStorageConfig };
