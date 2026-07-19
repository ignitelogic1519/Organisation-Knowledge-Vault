"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { downloadBlob, vaultFiles } from "@/lib/courses-client";
import { StructureTree } from "@/components/StructureTree";
import { useOrg } from "@/components/org-context";

// Admin console — every management surface in one place, fully separated from the member
// view: structure & people & courses (tree), owner management behind the Supreme gate,
// and the Supreme zone (.main export, deletion).
export default function OrgAdminPage() {
  const router = useRouter();
  const { org, reload, isAdmin, isSupremeOwner } = useOrg();
  const [notice, setNotice] = useState<string | null>(null);

  // Supreme gate: token AND verified password live only in page memory (never persisted)
  // and die on navigation — the password is needed again to encrypt .main exports
  const [supremeToken, setSupremeToken] = useState<string | null>(null);
  const [supremePassword, setSupremePassword] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  async function verifySupreme(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    const password = new FormData(e.currentTarget).get("password") as string;
    try {
      const session = await orgs.supremeVerify(org.id, password);
      setSupremeToken(session.supremeToken);
      setSupremePassword(password);
      setGateOpen(false);
      setNotice("Supreme access granted for 10 minutes.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Verification failed");
    }
  }

  async function addOwner(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supremeToken) return;
    setNotice(null);
    const form = e.currentTarget;
    const username = new FormData(form).get("username") as string;
    try {
      await orgs.addOwner(org.id, username, supremeToken);
      form.reset();
      reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not add owner");
    }
  }

  async function removeOwner(profileId: string) {
    if (!supremeToken) return;
    setNotice(null);
    try {
      await orgs.removeOwner(org.id, profileId, supremeToken);
      reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not remove owner");
    }
  }

  if (!isAdmin) {
    return (
      <div className="empty-card glass">
        <h2>Owners only</h2>
        <p className="auth-sub">
          The Admin console is available to role owners. Your view of this organization
          lives in the <Link href={`/orgs/${org.id}`}>Overview</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-grid stagger">
      <div className="panel glass panel-wide">
        <h2>Structure, people &amp; courses</h2>
        <p className="auth-sub">
          Your governed slice of the role tree. Create sub-roles, place people, publish
          courses, export/restore <code>.bkp</code> node backups. The{" "}
          <Link href={`/orgs/${org.id}/graph`} style={{ color: "var(--accent)" }}>
            Constellation
          </Link>{" "}
          shows the same tree as a star map.
        </p>
        <StructureTree orgId={org.id} />
      </div>

      {isSupremeOwner && (
        <div className="panel glass">
          <h2>
            {org.ownerRole.name} <span className="chip">role #{org.ownerRole.roleNumber}</span>
          </h2>
          <p className="auth-sub">
            Owners of the Supreme role. Changes require the Supreme password.
          </p>
          <ul className="owner-list">
            {org.owners.map((o) => (
              <li key={o.profileId} className="account-row">
                <span>
                  {o.displayName} <span className="auth-sub">@{o.username}</span>
                </span>
                {supremeToken && org.owners.length > 1 && (
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => removeOwner(o.profileId)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>

          {!supremeToken && !gateOpen && (
            <button className="btn btn-quiet" onClick={() => setGateOpen(true)}>
              Manage owners (Supreme access)
            </button>
          )}
          {gateOpen && !supremeToken && (
            <form onSubmit={verifySupreme} className="inline-form">
              <label className="field">
                <span>Supreme password</span>
                <input name="password" type="password" autoFocus required />
              </label>
              <button className="btn btn-primary">Unlock</button>
            </form>
          )}
          {supremeToken && (
            <form onSubmit={addOwner} className="inline-form">
              <label className="field">
                <span>Add co-owner by username</span>
                <input name="username" placeholder="their-username" required />
              </label>
              <button className="btn btn-primary">Add owner</button>
            </form>
          )}
          {notice && <p className="auth-sub">{notice}</p>}
        </div>
      )}

      {isSupremeOwner && supremeToken && (
        <div className="panel glass panel-wide danger-zone">
          <h2>Supreme zone</h2>
          <p className="auth-sub">
            The <code>.main</code> file is this organization&apos;s existence backup —
            encrypted with the Supreme password, held only by you.
          </p>
          <div className="tree-actions">
            <button
              className="btn btn-quiet"
              onClick={async () => {
                // The password verified at the gate is reused — no re-typing, no mismatch
                const pw =
                  supremePassword ??
                  prompt(
                    "Enter this organization's SUPREME password (the one set at creation — it encrypts the .main file):",
                  );
                if (!pw) return;
                try {
                  const blob = await vaultFiles.exportMain(org.id, pw, supremeToken);
                  downloadBlob(blob, `${org.name}.main`);
                  setNotice(
                    ".main downloaded — keep it safe; it cannot be regenerated after deletion.",
                  );
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Export failed";
                  alert(`.main export failed: ${msg}`);
                  setNotice(msg);
                }
              }}
            >
              ⬇ Download .main
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (
                  !confirm(
                    "Delete this organization?\n\nDownload the .main file FIRST — after the 30-day retention it is the ONLY way to revive the organization.",
                  )
                )
                  return;
                try {
                  const res = await vaultFiles.deleteOrg(org.id, supremeToken);
                  alert(
                    `Organization deleted. Data retained until ${res.retainedUntil.slice(0, 10)} — after that, only the .main file can revive it.`,
                  );
                  router.replace("/orgs");
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : "Deletion failed");
                }
              }}
            >
              Delete organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
