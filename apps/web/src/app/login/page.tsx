"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginSchema } from "@vault/shared";
import { auth, ApiError } from "@/lib/auth-client";
import { SiteNav } from "@/components/SiteNav";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      router.push("/account");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  return (
    <main>
      <SiteNav right={<Link href="/register">Create profile</Link>} />
      <section className="auth-wrap">
        <form className="auth-card" onSubmit={submit}>
          <h1>Sign in</h1>
          <p className="auth-sub">Welcome back to Knowledge Vault.</p>
          <label className="field">
            <span>Username</span>
            <input name="username" autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="auth-alt">
            New here? <Link href="/register">Create a profile</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
