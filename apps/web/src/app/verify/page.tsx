"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { auth } from "@/lib/auth-client";
import { SiteNav } from "@/components/SiteNav";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"working" | "ok" | "failed">("working");

  useEffect(() => {
    if (!token) {
      setState("failed");
      return;
    }
    auth
      .verifyEmail(token)
      .then(() => setState("ok"))
      .catch(() => setState("failed"));
  }, [token]);

  return (
    <section className="auth-wrap">
      <div className="auth-card">
        {state === "working" && <h1>Verifying…</h1>}
        {state === "ok" && (
          <>
            <h1>Email verified ✓</h1>
            <p className="auth-sub">Your profile is fully active.</p>
            <Link className="btn btn-primary btn-block" href="/account">
              Go to your account
            </Link>
          </>
        )}
        {state === "failed" && (
          <>
            <h1>Link invalid or expired</h1>
            <p className="auth-sub">
              Request a fresh verification email from your account page.
            </p>
            <Link className="btn btn-quiet btn-block" href="/account">
              Go to your account
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

export default function VerifyPage() {
  return (
    <main>
      <SiteNav />
      <Suspense>
        <VerifyInner />
      </Suspense>
    </main>
  );
}
