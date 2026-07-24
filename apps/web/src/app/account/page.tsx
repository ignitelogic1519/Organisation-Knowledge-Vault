"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicProfile } from "@vault/shared";
import { auth, ApiError, hasSession } from "@/lib/auth-client";
import { AppShell } from "@/components/AppShell";
import { useDialogs } from "@/components/dialogs";
import { IconGrid, IconHelp, IconLogout, IconUser } from "@/components/icons";

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

// Downscale + re-encode a chosen image to a small square JPEG data URL (client-side),
// so the avatar upload stays tiny regardless of the source photo.
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function AccountPage() {
  const router = useRouter();
  const dialogs = useDialogs();
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

  const saveAvatar = async (avatar: string | null) => {
    try {
      const res = await auth.updateMe({ avatar });
      setProfile(res.profile);
      dialogs.toast(avatar ? "Profile picture updated." : "Profile picture removed.", "success");
    } catch (e) {
      dialogs.toast(e instanceof ApiError ? e.message : "Could not update", "danger");
    }
  };

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
            <div className="avatar-edit">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar-xl avatar-img" src={profile.avatar} alt="" />
              ) : (
                <span className="avatar avatar-xl" aria-hidden>
                  {profile.displayName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]!.toUpperCase())
                    .join("")}
                </span>
              )}
              <div>
                <h2>{profile.displayName}</h2>
                <p className="auth-sub">
                  @{profile.username} · joined {profile.createdAt.slice(0, 10)}
                </p>
                <div className="tree-actions" style={{ marginTop: "0.4rem" }}>
                  <label className="btn btn-quiet btn-small" style={{ cursor: "pointer" }}>
                    {profile.avatar ? "Change picture" : "Upload picture"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          await saveAvatar(await fileToAvatar(file));
                        } catch {
                          dialogs.toast("Could not read that image.", "danger");
                        }
                      }}
                    />
                  </label>
                  {profile.avatar && (
                    <button className="btn btn-quiet btn-small" onClick={() => saveAvatar(null)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
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
                if (
                  !(await dialogs.confirm({
                    title: "Delete profile",
                    message: "Delete your profile permanently? This cannot be undone.",
                    confirmLabel: "Delete forever",
                    danger: true,
                  }))
                )
                  return;
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
