"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerSchema } from "@vault/shared";
import { auth, ApiError } from "@/lib/auth-client";
import { GoogleButton } from "@/components/GoogleButton";
import { SiteNav } from "@/components/SiteNav";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const parsed = registerSchema.safeParse({
      email: data.get("email"),
      password: data.get("password"),
      displayName: data.get("displayName"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await auth.register(parsed.data.email, parsed.data.password, parsed.data.displayName);
      router.push("/account");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  async function google(idToken: string) {
    setError(null);
    try {
      await auth.google(idToken);
      router.push("/account");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed");
    }
  }

  return (
    <main>
      <SiteNav right={<Link href="/login">Sign in</Link>} />
      <section className="auth-wrap">
        <form className="auth-card" onSubmit={submit}>
          <h1>Create your profile</h1>
          <p className="auth-sub">
            One global profile — join or create any number of organizations with it.
          </p>
          <label className="field">
            <span>Name</span>
            <input name="displayName" autoComplete="name" required />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
            />
            <small>At least 10 characters</small>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Creating…" : "Create profile"}
          </button>
          <GoogleButton onCredential={google} />
          <p className="auth-alt">
            Already have a profile? <Link href="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
