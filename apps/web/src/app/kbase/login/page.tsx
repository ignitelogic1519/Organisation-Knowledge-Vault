"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { admin, AdminApiError } from "@/lib/admin-client";

// The "Knowledge Base" employee portal login — a separate realm from user sign-in.
// Reached from the small footer button on the public site.
export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      await admin.login(String(data.get("username")).trim(), String(data.get("password")));
      router.push("/kbase");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  return (
    <main className="kv-auth-wrap" style={{ minHeight: "100vh" }}>
      <form className="card kv-auth-card" onSubmit={submit}>
        <span className="brand-mark" aria-hidden>
          ✦
        </span>
        <h1 className="h3 mb-1">
          Knowledge Base <span className="gradient-text">Portal</span>
        </h1>
        <p className="auth-sub mb-4">Employee access only — the platform administration console.</p>
        <div className="mb-3 text-start">
          <label className="form-label" htmlFor="username">
            Admin username
          </label>
          <input id="username" name="username" className="form-control" autoComplete="username" required autoFocus />
        </div>
        <div className="mb-3 text-start">
          <label className="form-label" htmlFor="password">
            Password
          </label>
          <input id="password" name="password" type="password" className="form-control" autoComplete="current-password" required />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary w-100" disabled={busy}>
          {busy ? "Signing in…" : "Enter portal"}
        </button>
      </form>
    </main>
  );
}
