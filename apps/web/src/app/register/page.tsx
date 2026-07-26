"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerSchema } from "@vault/shared";
import { auth, ApiError } from "@/lib/auth-client";
import { SiteNav } from "@/components/SiteNav";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    if (data.get("password") !== data.get("password2")) {
      setError("The passwords don't match — retype them.");
      return;
    }
    const parsed = registerSchema.safeParse({
      username: data.get("username"),
      password: data.get("password"),
      displayName: data.get("displayName"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await auth.register(parsed.data.username, parsed.data.password, parsed.data.displayName);
      router.push("/account");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  return (
    <main>
      <SiteNav right={<Link href="/login" className="nav-link">Sign in</Link>} />
      <div className="kv-auth-wrap">
        <form className="card kv-auth-card" onSubmit={submit}>
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          <h1 className="h3 mb-1">
            Create your <span className="gradient-text">profile</span>
          </h1>
          <p className="auth-sub mb-4">
            One global profile — join or create any number of organizations with it.
          </p>
          <div className="mb-3 text-start">
            <label className="form-label" htmlFor="displayName">
              Name
            </label>
            <input
              id="displayName"
              name="displayName"
              className="form-control"
              autoComplete="name"
              required
            />
          </div>
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
              minLength={3}
            />
            <div className="form-text">
              Your unique identity on the platform — admins add you to organizations by this
              exact username
            </div>
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
              autoComplete="new-password"
              minLength={10}
              required
            />
            <div className="form-text">At least 10 characters</div>
          </div>
          <div className="mb-3 text-start">
            <label className="form-label" htmlFor="password2">
              Retype password
            </label>
            <input
              id="password2"
              name="password2"
              type="password"
              className="form-control"
              autoComplete="new-password"
              minLength={10}
              required
            />
            <div className="form-text">Type it again to confirm you got it right</div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary w-100" disabled={busy}>
            {busy ? "Creating…" : "Create profile"}
          </button>
          <p className="auth-alt mt-3">
            Already have a profile? <Link href="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
