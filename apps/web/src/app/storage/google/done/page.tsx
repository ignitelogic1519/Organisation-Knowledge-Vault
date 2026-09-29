"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GOOGLE_CHANNEL } from "@/lib/google-connect";

// Where the Google sign-in pop-up lands (docs/structure.md §9.16).
//
// Google sends the browser to our API, which files the grant and redirects here with
// either the id of the new connection or a sentence saying why it failed. This page tells
// the form that opened the pop-up — over a BroadcastChannel, because Google's pages cut
// the pop-up's link to its opener — and closes itself. Nothing secret is in this URL: the
// connection id is only usable by the signed-in person who started the sign-in.

export default function GoogleDonePage() {
  return (
    <Suspense fallback={null}>
      <GoogleDone />
    </Suspense>
  );
}

function GoogleDone() {
  const params = useSearchParams();
  const connection = params.get("connection");
  const error = params.get("error");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const channel = new BroadcastChannel(GOOGLE_CHANNEL);
    channel.postMessage(connection ? { connection } : { error: error ?? "Google sign-in did not finish." });
    channel.close();
    if (connection) {
      setClosing(true);
      const t = window.setTimeout(() => window.close(), 900);
      return () => window.clearTimeout(t);
    }
  }, [connection, error]);

  return (
    <main className="google-done">
      <div className="auth-card glass">
        {connection ? (
          <>
            <h1>Google account connected</h1>
            <p className="auth-sub">
              {closing ? "This window will close by itself. " : ""}Go back to Knowledge Vault to finish
              setting up storage.
            </p>
          </>
        ) : (
          <>
            <h1>Google account not connected</h1>
            <p className="form-error">{error ?? "Google sign-in did not finish."}</p>
            <p className="auth-sub">You can close this window and try again from Knowledge Vault.</p>
          </>
        )}
      </div>
    </main>
  );
}
