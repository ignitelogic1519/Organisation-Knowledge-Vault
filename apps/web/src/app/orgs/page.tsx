"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrgSummary } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { fileToBase64, vaultFiles } from "@/lib/courses-client";
import { AppShell } from "@/components/AppShell";
import { useDialogs } from "@/components/dialogs";
import { IconGrid, IconHelp, IconPlus, IconUser } from "@/components/icons";

type DeletedOrg = Awaited<ReturnType<typeof orgs.listDeleted>>[number];

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

// Dashboard — every organization the signed-in profile belongs to.
export default function OrgsPage() {
  const router = useRouter();
  const dialogs = useDialogs();
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
    <AppShell
      nav={NAV}
      title="Your organizations"
      subtitle="Each organization is its own constellation — enter one to learn or govern."
      actions={
        <Link className="btn btn-primary" href="/orgs/new">
          <IconPlus size={16} /> Create organization
        </Link>
      }
    >
      {list === null && (
        <div className="org-grid">
          <div className="org-card glass skeleton" style={{ minHeight: "7rem" }} />
          <div className="org-card glass skeleton" style={{ minHeight: "7rem" }} />
        </div>
      )}

      {deleted.length > 0 && (
        <div className="panel glass danger-zone" style={{ marginBottom: "1.1rem" }}>
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
                    const pw = await dialogs.promptPassword({
                      title: `Undelete "${d.name}"`,
                      message: "Enter the organization's Supreme password to restore it.",
                      label: "Supreme password",
                      minLength: 1,
                      submitLabel: "Undelete",
                    });
                    if (!pw) return;
                    try {
                      await orgs.undelete(d.id, pw);
                      load();
                    } catch (err) {
                      dialogs.toast(err instanceof Error ? err.message : "Undelete failed", "danger");
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

      {list?.length === 0 && (
        <div className="empty-card glass" style={{ marginBottom: "1.1rem" }}>
          <h2>No organizations yet</h2>
          <p className="auth-sub">
            Create one to become its first owner, or ask an admin to add your profile by
            your exact username.
          </p>
          <Link className="btn btn-primary" href="/orgs/new">
            <IconPlus size={16} /> Create your first organization
          </Link>
        </div>
      )}

      <div className="org-grid stagger">
        {list?.map((o) => (
          <Link key={o.id} href={`/orgs/${o.id}`} className="org-card glass">
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

      <details className="revive-box" style={{ marginTop: "1.4rem" }}>
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
              await dialogs.alert({
                title: "Organization revived",
                message: `Roles: ${res.report.rolesRestored}, matched people: ${res.report.peopleMatched}, pending (re-attach on registration): ${res.report.peoplePending}, courses: ${res.report.coursesRestored}. Media is marked unreachable until storage is reconnected.`,
                tone: "success",
              });
              router.push(`/orgs/${res.orgId}`);
            } catch (err) {
              dialogs.toast(err instanceof Error ? err.message : "Revival failed", "danger");
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
    </AppShell>
  );
}
