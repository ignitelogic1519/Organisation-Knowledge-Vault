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
  { href: "/pricing", label: "Pricing", icon: <span aria-hidden>🪙</span> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

// The countdown chip shown above an org's name: remaining time for time-bounded plans
// (Demo, Monthly, custom), or the plan/lapsed state otherwise.
function PlanTimer({ status, planKey, expiresAt }: { status: string; planKey: string | null; expiresAt: string | null }) {
  if (status === "NONE") return null;
  if (status === "EXPIRED") {
    return <span className="org-plan-timer" data-danger="true">⏰ {planKey ?? "Plan"} expired — upgrade to keep it</span>;
  }
  if (!expiresAt) {
    return <span className="org-plan-timer">{planKey ?? "Active"} · no expiry</span>;
  }
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.floor(ms / 86400_000);
  const hours = Math.floor((ms % 86400_000) / 3600_000);
  const danger = ms < 3 * 86400_000;
  const label = status === "DEMO" ? "Demo" : planKey ?? "Plan";
  const remaining = ms <= 0 ? "expired" : days >= 1 ? `${days}d ${hours}h left` : `${hours}h left`;
  return <span className="org-plan-timer" data-danger={danger}>⏳ {label} · {remaining}</span>;
}

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
                      const msg = err instanceof Error ? err.message : "Undelete failed";
                      // Expired plan: explain clearly and let them enter a restore code.
                      if (/expired/i.test(msg)) {
                        await dialogs.alert({ title: "Plan expired", message: msg, tone: "danger" });
                        if (
                          await dialogs.confirm({
                            title: "Have a restore code?",
                            message:
                              "If the super-admin sent you a restore code (check your Account notifications), enter it next. Otherwise, choose a plan on the Pricing page first.",
                            confirmLabel: "Enter restore code",
                            cancelLabel: "Go to Pricing",
                          })
                        ) {
                          const code = await dialogs.promptPassword({
                            title: "Restore code",
                            message: "Paste the one-time restore code from your notifications.",
                            label: "Restore code",
                            minLength: 8,
                            submitLabel: "Restore",
                          });
                          if (!code) return;
                          try {
                            await orgs.undelete(d.id, pw, code);
                            load();
                          } catch (e2) {
                            dialogs.toast(e2 instanceof Error ? e2.message : "Restore failed", "danger");
                          }
                        } else {
                          router.push("/pricing");
                        }
                      } else {
                        dialogs.toast(msg, "danger");
                      }
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
            <PlanTimer status={o.planStatus} planKey={o.planKey} expiresAt={o.planExpiresAt} />
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
            const password = String(d.get("password"));
            const done = (res: Awaited<ReturnType<typeof vaultFiles.revive>>) => {
              dialogs.alert({
                title: "Organization revived",
                message: `Roles: ${res.report.rolesRestored}, matched people: ${res.report.peopleMatched}, pending (re-attach on registration): ${res.report.peoplePending}, courses: ${res.report.coursesRestored}. Media is marked unreachable until storage is reconnected.`,
                tone: "success",
              });
              router.push(`/orgs/${res.orgId}`);
            };
            try {
              const b64 = await fileToBase64(file);
              try {
                done(await vaultFiles.revive(b64, password));
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Revival failed";
                if (!/expired/i.test(msg)) throw err;
                // Expired/legacy plan: explain, then let them supply a restore code.
                await dialogs.alert({ title: "Plan expired", message: msg, tone: "danger" });
                if (
                  await dialogs.confirm({
                    title: "Have a restore code?",
                    message:
                      "Enter the one-time restore code from your notifications, or choose a plan on the Pricing page to get one.",
                    confirmLabel: "Enter restore code",
                    cancelLabel: "Go to Pricing",
                  })
                ) {
                  const code = await dialogs.promptPassword({
                    title: "Restore code",
                    message: "Paste the restore code from your notifications.",
                    label: "Restore code",
                    minLength: 8,
                    submitLabel: "Restore",
                  });
                  if (code) done(await vaultFiles.revive(b64, password, code));
                } else {
                  router.push("/pricing");
                }
              }
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
