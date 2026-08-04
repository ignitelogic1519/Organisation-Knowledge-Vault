"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { expiresInLabel, type PublicProfile } from "@vault/shared";
import { auth, ApiError, hasSession } from "@/lib/auth-client";
import { useMail } from "@/components/mail-events";
import { AppShell } from "@/components/AppShell";
import { useDialogs } from "@/components/dialogs";
import { IconGrid, IconHelp, IconLogout, IconUser } from "@/components/icons";
import { pricing } from "@/lib/pricing-client";

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/pricing", label: "Pricing", icon: <span aria-hidden>🪙</span> },
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
  // The coin balance, so it can be read where the account is, not only where it is spent.
  const [coins, setCoins] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!hasSession()) return;
    pricing
      .wallet()
      .then((w) => setCoins(w.coins))
      .catch(() => setCoins(null));
  }, []);


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
                {/* The wallet was only ever visible on the pricing page, which meant
                    checking your own balance required going somewhere to spend it. */}
                <p className="account-wallet">
                  <span className="coins-chip">🪙 {coins === null ? "…" : coins} coins</span>
                  <Link href="/payment" className="btn btn-quiet btn-small">
                    Buy coins
                  </Link>
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

          <AdminMessages />

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

// Messages from the Knowledge Base team, mirrored onto the Account page so a user can
// read their access code without opening the mailbox. The mailbox provider already holds
// them (and keeps them live), so this is a filter, not a second fetch.
function AdminMessages() {
  const { view } = useMail();
  const items = (view?.messages ?? []).filter((m) => m.category === "ADMIN");

  // Hide the whole block when there's nothing to show — an empty panel is just noise.
  if (items.length === 0) return null;

  return (
    <div className="panel glass admin-inbox" style={{ gridColumn: "1 / -1" }}>
      <h2>Messages from the Knowledge Base team</h2>
      <p className="auth-sub">
        Access codes and plan decisions land here and stay for 30 days — read your code any time.
        Everything is also in your mailbox.
      </p>
      <ul className="owner-list">
        {items.map((m) => {
          const otp = typeof m.payload.otp === "string" ? m.payload.otp : null;
          return (
            <li key={m.id} className="bell-item" data-unread={!m.readAt} style={{ display: "block" }}>
              <span className="bell-item-top">
                <span className="chip bell-cat">{m.sublabel ?? "Admin"}</span>
                <strong>{m.subject}</strong>
              </span>
              {otp && <div className="admin-otp-code">{otp}</div>}
              {otp && typeof m.payload.expiresAt === "string" && (
                <span className="auth-sub">
                  Use it within 24h · expires {new Date(m.payload.expiresAt).toLocaleString()}
                </span>
              )}
              <p className="auth-sub" style={{ marginTop: "0.2rem" }}>{m.body}</p>
              <span className="auth-sub" style={{ fontSize: "0.75rem" }}>
                {new Date(m.createdAt).toLocaleString()} · clears {expiresInLabel(m.expiresAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
