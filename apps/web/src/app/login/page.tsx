"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SESSION_ENDED, loginSchema } from "@vault/shared";
import { auth, ApiError, takeSignOutReason } from "@/lib/auth-client";
import { SiteNav } from "@/components/SiteNav";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arriving here because a session ended is not the same as arriving here to sign in.
  // Say which it was — being asked for a password with no explanation reads as a fault.
  useEffect(() => {
    const reason = takeSignOutReason();
    if (reason === SESSION_ENDED.idle) {
      setNotice("You were signed out after an hour of inactivity. Sign in to carry on.");
    } else if (reason === SESSION_ENDED.ended) {
      setNotice("Your session ended. Sign in to carry on.");
    }
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      username: data.get("username"),
      password: data.get("password"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await auth.login(parsed.data.username, parsed.data.password);
      router.push("/orgs");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  return (
    <main>
      <SiteNav right={<Link href="/register" className="nav-link">Create profile</Link>} />
      <div className="kv-auth-wrap">
        <form className="card kv-auth-card" onSubmit={submit}>
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          <h1 className="h3 mb-1">
            Welcome <span className="gradient-text">back</span>
          </h1>
          <p className="auth-sub mb-4">Sign in to your Knowledge Vault profile.</p>
          {notice && (
            <p className="form-notice mb-3" role="status">
              {notice}
            </p>
          )}
          <div className="mb-3 text-start">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              name="username"
              className="form-control"
              autoComplete="username"
              required
            />
          </div>
          <div className="mb-3 text-start">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-control"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary w-100" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="auth-alt mt-3">
            New here? <Link href="/register">Create a profile</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
