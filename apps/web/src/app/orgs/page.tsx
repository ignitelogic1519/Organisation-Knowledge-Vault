"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrgSummary } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { SiteNav } from "@/components/SiteNav";

export default function OrgsPage() {
  const router = useRouter();
  const [list, setList] = useState<OrgSummary[] | null>(null);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    orgs
      .list()
      .then(setList)
      .catch(() => router.replace("/login"));
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
