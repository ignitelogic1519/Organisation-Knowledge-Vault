"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrgSummary } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { AppShell } from "@/components/AppShell";
import { RecoveryDock } from "@/components/RecoveryDock";
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

      {/* Recovery lives in a dock in the bottom-left corner: out of the way until
          something needs bringing back, and holding BOTH ways back — the organizations
          waiting out their 30 days, and a `.main` revival for anything already purged. */}
      <RecoveryDock deleted={deleted} onChanged={load} />
    </AppShell>
  );
}
