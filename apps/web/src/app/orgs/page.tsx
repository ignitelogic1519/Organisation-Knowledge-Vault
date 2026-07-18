"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrgSummary } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { fileToBase64, vaultFiles } from "@/lib/courses-client";
import { SiteNav } from "@/components/SiteNav";

type DeletedOrg = Awaited<ReturnType<typeof orgs.listDeleted>>[number];

export default function OrgsPage() {
  const router = useRouter();
  const [list, setList] = useState<OrgSummary[] | null>(null);
  const [deleted, setDeleted] = useState<DeletedOrg[]>([]);

  const load = () => {
    orgs
      .list()
      .then(setList)
      .catch(() => router.replace("/login"));
    orgs.listDeleted().then(setDeleted).catch(() => undefined);
  };

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <main>
      <SiteNav right={<Link href="/account">Account</Link>} />
      <section className="page-wrap">
        <header className="page-head">
          <h1>Your organizations</h1>
          <Link className="btn btn-primary" href="/orgs/new">
            Create organization
          </Link>
        </header>

        {list === null && <p className="auth-sub">Loading…</p>}
        {deleted.length > 0 && (
          <div className="panel danger-zone" style={{ marginBottom: "1rem" }}>
            <h2>Deleted — restorable until purge</h2>
            <ul className="owner-list">
              {deleted.map((d) => (
                <li key={d.id} className="account-row">
                  <span>
                    {d.name} <span className="chip">#{d.orgNumber}</span>{" "}
                    <span className="auth-sub">purges {d.purgeAt.slice(0, 10)}</span>
                  </span>
                  <button
                    className="btn btn-quiet btn-small"
                    onClick={async () => {
                      const pw = prompt(
                        `Undelete "${d.name}" — enter its Supreme password:`,
                      );
                      if (!pw) return;
                      try {
                        await orgs.undelete(d.id, pw);
                        load();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Undelete failed");
                      }
                    }}
                  >
                    Undelete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="revive-box">
          <summary>Revive a deleted organization from a .main file</summary>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const file = d.get("main") as File;
              try {
                const b64 = await fileToBase64(file);
                const res = await vaultFiles.revive(b64, String(d.get("password")));
                alert(
                  `Revived! Roles: ${res.report.rolesRestored}, matched people: ${res.report.peopleMatched}, pending (re-attach on registration): ${res.report.peoplePending}, courses: ${res.report.coursesRestored}.\n\nMedia is marked unreachable until storage is reconnected.`,
                );
                router.push(`/orgs/${res.orgId}`);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Revival failed");
              }
            }}
          >
            <label className="field">
              <span>.main file</span>
              <input name="main" type="file" accept=".main" required />
            </label>
            <label className="field">
              <span>Supreme password</span>
              <input name="password" type="password" required />
            </label>
            <button className="btn btn-primary btn-small">Revive</button>
          </form>
        </details>
        {list?.length === 0 && (
          <div className="empty-card">
            <h2>No organizations yet</h2>
            <p className="auth-sub">
              Create one to become its first owner, or ask an admin to add your profile
              ({/* email is their identity */}the email you registered with).
            </p>
          </div>
        )}
        <div className="org-grid">
          {list?.map((o) => (
            <Link key={o.id} href={`/orgs/${o.id}`} className="org-card">
              <div className="org-card-head">
                <h2>{o.name}</h2>
                <span className="chip">#{o.orgNumber}</span>
              </div>
              <p className="auth-sub">
                {o.myPlacements.length > 0
                  ? o.myPlacements
                      .map((p) => `${p.roleName} (${p.kind.toLowerCase()})`)
                      .join(" · ")
                  : "Member"}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
