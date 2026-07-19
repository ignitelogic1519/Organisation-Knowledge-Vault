"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { OrgDetail } from "@vault/shared";
import { ApiError, hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { MyLearning } from "@/components/MyLearning";
import { SiteNav } from "@/components/SiteNav";
import { StructureTree } from "@/components/StructureTree";
import { downloadBlob, vaultFiles } from "@/lib/courses-client";

export default function OrgPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Supreme gate state: token AND the verified password live only in page memory (never
  // persisted) and die on navigation — the password is needed again to encrypt .main exports
  const [supremeToken, setSupremeToken] = useState<string | null>(null);
  const [supremePassword, setSupremePassword] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);

  const reload = useCallback(() => {
    orgs
      .get(id)
      .then(setOrg)
      .catch(() => router.replace("/orgs"));
  }, [id, router]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    reload();
  }, [reload, router]);

  const isOwner = org?.myPlacements.some(
    (p) => p.roleNodeId === org.ownerRole.id && p.kind === "OWNER",
  );

  async function verifySupreme(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    const password = new FormData(e.currentTarget).get("password") as string;
    try {
      const session = await orgs.supremeVerify(id, password);
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
      await orgs.addOwner(id, username, supremeToken);
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
      await orgs.removeOwner(id, profileId, supremeToken);
      reload();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not remove owner");
    }
  }

  if (!org) {
    return (
      <main>
        <SiteNav right={<Link href="/orgs">Your organizations</Link>} />
        <section className="auth-wrap">
          <div className="auth-card">
            <h1>Loading…</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <SiteNav right={<Link href="/orgs">Your organizations</Link>} />
      <section className="page-wrap">
        <header className="page-head">
          <div>
            <h1>
              {org.name} <span className="chip">#{org.orgNumber}</span>
            </h1>
            <p className="auth-sub">
              Supreme → {org.ownerRole.name} · your position:{" "}
              {org.myPlacements.map((p) => `${p.roleName} (${p.kind.toLowerCase()})`).join(" · ") ||
                "member"}
            </p>
          </div>
        </header>

        <div className="panel-grid">
          <div className="panel panel-wide">
            <h2>My Learning</h2>
            <MyLearning orgId={id} />
          </div>

          <div className="panel panel-wide">
            <h2>My Structure</h2>
            <StructureTree orgId={id} />
          </div>

          <div className="panel">
            <h2>
              {org.ownerRole.name} <span className="chip">role #{org.ownerRole.roleNumber}</span>
            </h2>
            <ul className="owner-list">
              {org.owners.map((o) => (
                <li key={o.profileId} className="account-row">
                  <span>
                    {o.displayName} <span className="auth-sub">@{o.username}</span>
                  </span>
                  {isOwner && supremeToken && org.owners.length > 1 && (
                    <button className="btn btn-danger" onClick={() => removeOwner(o.profileId)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {isOwner && !supremeToken && !gateOpen && (
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

          {isOwner && supremeToken && (
            <div className="panel panel-wide danger-zone">
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
                      const blob = await vaultFiles.exportMain(id, pw, supremeToken);
                      downloadBlob(blob, `${org.name}.main`);
                      setNotice(".main downloaded — keep it safe; it cannot be regenerated after deletion.");
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
                      const res = await vaultFiles.deleteOrg(id, supremeToken);
                      alert(`Organization deleted. Data retained until ${res.retainedUntil.slice(0, 10)} — after that, only the .main file can revive it.`);
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
      </section>
    </main>
  );
}
