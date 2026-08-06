"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasSession } from "@/lib/auth-client";

// The landing page's call to action.
//
// Signing in used to have no door on this page. The only account link in the hero was
// "Get started free", which registers — someone who already has a profile had to find
// "Sign in" in the navigation bar, and on a phone that lives behind the hamburger now
// that the bar collapses. So the two doors sit here side by side, both reachable without
// opening anything.
//
// Which pair you get depends on whether you are signed in, decided in the browser for the
// same reason SessionNavLinks decides there: this page is server-rendered and the session
// is not, so a hard-coded "Sign in" would show to people who already are.

export function HeroCta() {
  // `null` = not known yet. Rendering either answer during that moment would be a guess,
  // so the row renders its own shape and waits — see `data-pending` below.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(hasSession());
    // A sign-in or sign-out in another tab writes the same storage key; follow it so the
    // hero agrees with the navigation bar without a reload.
    const sync = () => setSignedIn(hasSession());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  // Held open at the signed-out shape (the taller of the two) so the buttons below it
  // never jump when the answer lands.
  if (signedIn === null) {
    return (
      <div className="hero-cta" data-pending aria-hidden>
        <div className="hero-cta-row">
          <span className="btn btn-primary btn-lg">Create your profile</span>
          <span className="btn btn-quiet btn-lg">Sign in</span>
        </div>
        <span className="hero-cta-aside">See every feature</span>
      </div>
    );
  }

  if (signedIn) {
    return (
      <div className="hero-cta">
        <div className="hero-cta-row">
          <Link className="btn btn-primary btn-lg" href="/orgs">
            My organizations
          </Link>
          <Link className="btn btn-quiet btn-lg" href="/account">
            Account
          </Link>
        </div>
        <Link className="hero-cta-aside" href="#features">
          See every feature
        </Link>
      </div>
    );
  }

  return (
    <div className="hero-cta">
      <div className="hero-cta-row">
        <Link className="btn btn-primary btn-lg" href="/register">
          Create your profile
        </Link>
        <Link className="btn btn-quiet btn-lg" href="/login">
          Sign in
        </Link>
      </div>
      <Link className="hero-cta-aside" href="#features">
        See every feature
      </Link>
    </div>
  );
}
