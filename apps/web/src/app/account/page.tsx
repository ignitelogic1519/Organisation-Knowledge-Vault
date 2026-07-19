"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicProfile } from "@vault/shared";
import { auth, ApiError, hasSession } from "@/lib/auth-client";
import { AppShell } from "@/components/AppShell";
import { IconGrid, IconHelp, IconLogout, IconUser } from "@/components/icons";

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    auth
      .me()
      .then((res) => setProfile(res.profile))
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <AppShell
      nav={NAV}
      title="Account"
      subtitle="One global profile — join or create any number of organizations with it."
      actions={
        <button
          className="btn btn-quiet"
          onClick={async () => {
            await auth.logout();
            router.replace("/login");
          }}
        >
          <IconLogout size={16} /> Sign out
        </button>
      }
    >
      {!profile ? (
        <div className="auth-card glass skeleton" style={{ minHeight: "14rem", margin: 0 }} />
      ) : (
        <div className="panel-grid stagger">
          <div className="panel glass">
            <h2>{profile.displayName}</h2>
            <p className="auth-sub">
              @{profile.username} · joined {profile.createdAt.slice(0, 10)}
            </p>
            <div className="account-row">
              <span>Username</span>
              <span className="badge badge-ok">@{profile.username}</span>
            </div>
            <div className="account-row">
              <span>Organizations</span>
              <Link className="btn btn-quiet btn-small" href="/orgs">
                Open
              </Link>
            </div>
            {notice && <p className="auth-sub">{notice}</p>}
          </div>

          <div className="panel glass danger-zone">
            <h2>Danger zone</h2>
            <p className="auth-sub">
              Deleting your profile removes you from every organization. This cannot be
              undone.
            </p>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm("Delete your profile permanently? This cannot be undone.")) return;
                try {
                  await auth.deleteMe();
                  await auth.logout();
                  router.replace("/");
                } catch (err) {
                  setNotice(err instanceof ApiError ? err.message : "Deletion failed");
                }
              }}
            >
              Delete profile
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
