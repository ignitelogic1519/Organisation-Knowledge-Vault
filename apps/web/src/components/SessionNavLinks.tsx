"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasSession } from "@/lib/auth-client";

// The right-hand end of the public navigation. The marketing pages are server-rendered
// and the session lives in the browser, so this decides what to show only once it is
// running here — until then it renders nothing rather than flashing "Sign in" at
// someone who is already signed in.

export function SessionNavLinks() {
  // `null` = we do not know yet. Rendering the signed-out links during that moment is
  // what made a live session look signed out on the home and pricing pages.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(hasSession());
    // A sign-in or sign-out in another tab writes the same storage key; follow it so
    // the nav agrees with the rest of the app without a reload.
    const sync = () => setSignedIn(hasSession());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  if (signedIn === null) {
    // Hold the space so the bar does not jump when the answer arrives.
    return <span className="nav-session-placeholder" aria-hidden />;
  }

  if (signedIn) {
    return (
      <>
        <Link href="/orgs" className="nav-link">
          My organizations
        </Link>
        <Link href="/account" className="btn btn-primary btn-small">
          Account
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="nav-link">
        Sign in
      </Link>
      <Link href="/register" className="btn btn-primary btn-small">
        Get started
      </Link>
    </>
  );
}
