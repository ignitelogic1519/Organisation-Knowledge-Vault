"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicProfile } from "@vault/shared";
import { auth, ApiError, hasSession } from "@/lib/auth-client";
import { SiteNav } from "@/components/SiteNav";

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

  if (!profile) {
    return (
      <main>
        <SiteNav />
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
      <SiteNav
        right={
          <button
            className="btn btn-quiet"
            onClick={async () => {
              await auth.logout();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        }
      />
      <section className="auth-wrap">
        <div className="auth-card">
          <h1>{profile.displayName}</h1>
          <p className="auth-sub">
            @{profile.username} · joined {profile.createdAt.slice(0, 10)}
          </p>

          <div className="account-row">
            <span>Username</span>
            <span className="badge badge-ok">@{profile.username}</span>
          </div>
          <div className="account-row">
            <span>Organizations</span>
            <a className="btn btn-quiet" href="/orgs">
              Open
            </a>
          </div>

          {notice && <p className="auth-sub">{notice}</p>}

          <hr className="divider" />
          <button
            className="btn btn-danger btn-block"
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
      </section>
    </main>
  );
}
