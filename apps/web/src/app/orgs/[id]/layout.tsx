"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OrgDetail } from "@vault/shared";
import { hasSession } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { AppShell, type ShellNavItem } from "@/components/AppShell";
import { OrgContext } from "@/components/org-context";
import {
  IconBack,
  IconBook,
  IconHelp,
  IconShield,
  IconStars,
} from "@/components/icons";

// Org shell: fetches the org once, decides whether the Admin console tab is visible,
// and wraps every org tab (Overview · Constellation · Admin) in the app chrome.
export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<OrgDetail | null>(null);

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

  const isAdmin = org?.myPlacements.some((p) => p.kind === "OWNER") ?? false;
  const isSupremeOwner =
    org?.myPlacements.some(
      (p) => p.roleNodeId === org.ownerRole.id && p.kind === "OWNER",
    ) ?? false;

  const nav = useMemo<ShellNavItem[]>(() => {
    const items: ShellNavItem[] = [
      { href: "/orgs", label: "Organizations", icon: <IconBack /> },
      { href: `/orgs/${id}`, label: "Constellation", icon: <IconStars /> },
      { href: `/orgs/${id}/learning`, label: "My Learning", icon: <IconBook /> },
    ];
    if (isAdmin) {
      items.push({ href: `/orgs/${id}/admin`, label: "Admin console", icon: <IconShield /> });
    }
    items.push({ href: "/help", label: "Help", icon: <IconHelp /> });
    return items;
  }, [id, isAdmin]);

  const section = pathname.endsWith("/learning")
    ? "My Learning"
    : pathname.endsWith("/admin")
      ? "Admin console"
      : "Constellation";

  if (!org) {
    return (
      <AppShell nav={nav} title={<span className="skeleton" style={{ width: "12rem", height: "1.6rem", display: "inline-block" }} />}>
        <div className="panel-grid stagger">
          <div className="panel glass skeleton" style={{ minHeight: "8rem" }} />
          <div className="panel glass skeleton" style={{ minHeight: "8rem" }} />
        </div>
      </AppShell>
    );
  }

  return (
    <OrgContext.Provider value={{ org, reload, isAdmin, isSupremeOwner }}>
      <AppShell
        nav={nav}
        title={
          <>
            {org.name} <span className="chip">#{org.orgNumber}</span>
          </>
        }
        subtitle={
          section === "Constellation"
            ? org.myPlacements.length > 0
              ? `Your position: ${org.myPlacements
                  .map((p) => `${p.roleName} (${p.kind.toLowerCase()})`)
                  .join(" · ")}`
              : "Your position: member"
            : section
        }
      >
        {children}
      </AppShell>
    </OrgContext.Provider>
  );
}
