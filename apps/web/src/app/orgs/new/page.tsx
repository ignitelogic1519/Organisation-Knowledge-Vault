"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrgSchema } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { AppShell } from "@/components/AppShell";
import { IconGrid, IconHelp, IconUser } from "@/components/icons";

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

export default function NewOrgPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    if (data.get("supremePassword") !== data.get("supremePassword2")) {
      setError("Supreme passwords do not match");
      return;
    }
    const parsed = createOrgSchema.safeParse({
      name: data.get("name"),
      ownerRoleName: data.get("ownerRoleName"),
      supremePassword: data.get("supremePassword"),
      acknowledgedUnrecoverable: data.get("ack") === "on" ? true : false,
      accessCode: String(data.get("accessCode") ?? "").trim(),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const org = await orgs.create(parsed.data);
      router.push(`/orgs/${org.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  return (
    <AppShell
      nav={NAV}
      title="Create an organization"
      subtitle="This creates the organization's Supreme — its root object — and its first role, with you as the first owner."
    >
      <form className="auth-card auth-card-wide glass" onSubmit={submit} style={{ margin: 0 }}>
        <div className="warn-box" style={{ marginTop: 0 }}>
          <strong>You need an access code to create an organization.</strong>
          <p>
            Choose a plan on the <Link href="/pricing">Pricing page</Link> to request one. The
            Knowledge Base team reviews it and sends your one-time code to your{" "}
            <Link href="/account">notifications</Link>.
          </p>
        </div>
        <label className="field">
          <span>Access code</span>
          <input name="accessCode" required placeholder="8-character code from your notifications" autoCapitalize="characters" />
          <small>The super-admin sends this after approving your plan request.</small>
        </label>
        <label className="field">
          <span>Organization name</span>
          <input name="name" required minLength={2} />
        </label>
        <label className="field">
          <span>First role name</span>
          <input name="ownerRoleName" placeholder="Owner / CEO / Principal…" required />
          <small>The role at the top of your structure — you become its first occupant</small>
        </label>
        <label className="field">
          <span>Supreme password</span>
          <input name="supremePassword" type="password" minLength={12} required />
          <small>At least 12 characters</small>
        </label>
        <label className="field">
          <span>Repeat Supreme password</span>
          <input name="supremePassword2" type="password" required />
        </label>

        <div className="warn-box">
          <strong>This password cannot be recovered. By anyone. Ever.</strong>
          <p>
            The platform stores no copy — it protects owner-level changes and encrypts your
            organization&apos;s <code>.main</code> revival file. If it is lost, changing the
            owner structure and reviving a deleted organization become permanently
            impossible.
          </p>
          <label className="ack-row">
            <input type="checkbox" name="ack" />
            <span>I understand the Supreme password is unrecoverable</span>
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating…" : "Create organization"}
        </button>
      </form>
    </AppShell>
  );
}
