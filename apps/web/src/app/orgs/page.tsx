"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { OrgSummary } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { AppShell } from "@/components/AppShell";
import { OrgCard } from "@/components/OrgCard";
import { RecoveryDock } from "@/components/RecoveryDock";
import { IconGrid, IconHelp, IconPlus, IconUser } from "@/components/icons";

type DeletedOrg = Awaited<ReturnType<typeof orgs.listDeleted>>[number];

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/pricing", label: "Pricing", icon: <span aria-hidden>🪙</span> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

/** Above this many, finding one by eye stops working and the filter bar earns its space. */
const FILTER_THRESHOLD = 5;

type Lens = "all" | "owner" | "member";

// Dashboard — every organization the signed-in profile belongs to.
export default function OrgsPage() {
  const router = useRouter();
  const [list, setList] = useState<OrgSummary[] | null>(null);
  const [deleted, setDeleted] = useState<DeletedOrg[]>([]);
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState<Lens>("all");

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

  /**
   * The two lenses overlap on purpose — owning one branch of an organization while
   * sitting as a member in another is ordinary — so these are counted with exactly the
   * predicates the filter uses rather than as a split of the total. Counting "member" as
   * "everything I don't own" made the tab read 0 while the filter it labelled found one.
   */
  const owned = useMemo(
    () => (list ?? []).filter((o) => o.myPlacements.some((p) => p.kind === "OWNER")).length,
    [list],
  );
  const joined = useMemo(
    () => (list ?? []).filter((o) => o.myPlacements.some((p) => p.kind !== "OWNER")).length,
    [list],
  );

  /**
   * Search covers the name, the number and the role names, because all three are things
   * people actually remember — "the one where I'm the safety lead" is as valid a way to
   * look as typing the organization's name.
   */
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (list ?? []).filter((o) => {
      if (lens === "owner" && !o.myPlacements.some((p) => p.kind === "OWNER")) return false;
      if (lens === "member" && !o.myPlacements.some((p) => p.kind !== "OWNER")) return false;
      if (!term) return true;
      return (
        o.name.toLowerCase().includes(term) ||
        String(o.orgNumber).includes(term) ||
        o.myPlacements.some((p) => p.roleName.toLowerCase().includes(term))
      );
    });
  }, [list, query, lens]);

  const manyOrgs = (list?.length ?? 0) > FILTER_THRESHOLD;

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
          <div className="orgcard glass skeleton" style={{ minHeight: "11rem" }} />
          <div className="orgcard glass skeleton" style={{ minHeight: "11rem" }} />
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

      {/* The filter bar appears only once there is enough to filter. Two or three cards
          need no apparatus above them; twenty do. */}
      {manyOrgs && (
        <div className="org-toolbar">
          <div className="org-lens" role="group" aria-label="Filter organizations">
            {(
              [
                ["all", `All ${list!.length}`],
                ["owner", `Owner ${owned}`],
                ["member", `Member ${joined}`],
              ] as [Lens, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="org-lens-btn"
                data-active={lens === key}
                onClick={() => setLens(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="org-search">
            <span className="visually-hidden">Search your organizations</span>
            <input
              type="search"
              value={query}
              placeholder="Search by name, number or your role…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="org-grid stagger">
        {shown.map((o) => (
          <OrgCard key={o.id} org={o} />
        ))}
      </div>

      {list !== null && list.length > 0 && shown.length === 0 && (
        <p className="auth-sub">
          Nothing matches that. <button className="linklike" onClick={() => { setQuery(""); setLens("all"); }}>Clear the filters</button>
        </p>
      )}

      {/* Recovery lives in a dock in the bottom-left corner: out of the way until
          something needs bringing back, and holding BOTH ways back — the organizations
          waiting out their 30 days, and a `.main` revival for anything already purged. */}
      <RecoveryDock deleted={deleted} onChanged={load} />
    </AppShell>
  );
}
