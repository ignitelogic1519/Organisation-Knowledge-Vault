"use client";

import type { GdriveConnectionView } from "@vault/shared";
import { storageApi } from "./storage-client";

// Connecting a Google account (docs/structure.md §9.16).
//
// The sign-in happens in a pop-up so the form it starts from — an organization half
// created, a settings panel mid-edit — keeps everything typed into it. Google's pages
// isolate themselves from their opener, which cuts `window.opener` and makes
// `popup.closed` unreliable, so the pop-up reports back over a BroadcastChannel from our
// own origin instead: Google → our API → /storage/google/done on this site → here.

export const GOOGLE_CHANNEL = "kv-google-connect";
const TIMEOUT_MS = 10 * 60 * 1000;

export interface GoogleConnectHandle {
  result: Promise<GdriveConnectionView>;
  cancel: () => void;
}

/**
 * Start a Google sign-in. Must be called straight from a click: the pop-up is opened
 * before anything is awaited, or the browser's pop-up blocker stops it.
 */
export function connectGoogle(intent: "create" | "reconnect", orgId?: string): GoogleConnectHandle {
  const popup = window.open("about:blank", "kv-google-connect", "popup,width=520,height=700");
  let cancel = () => {};
  const result = new Promise<GdriveConnectionView>((resolve, reject) => {
    if (!popup) {
      reject(new Error("Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again."));
      return;
    }
    const channel = new BroadcastChannel(GOOGLE_CHANNEL);
    const timer = window.setTimeout(() => finish(new Error("The Google sign-in took too long. Try again.")), TIMEOUT_MS);
    let settled = false;
    function finish(outcome: Error | GdriveConnectionView) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      channel.close();
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    }
    cancel = () => {
      try {
        popup.close();
      } catch {
        // already gone
      }
      finish(new Error("Google sign-in cancelled."));
    };
    channel.onmessage = (event: MessageEvent<{ connection?: string; error?: string }>) => {
      if (event.data?.error) finish(new Error(event.data.error));
      else if (event.data?.connection) {
        storageApi
          .googleConnection(event.data.connection)
          .then(finish)
          .catch((err: unknown) => finish(err instanceof Error ? err : new Error("Could not read the Google connection.")));
      }
    };
    storageApi
      .googleAuthorize(intent, orgId)
      .then(({ url }) => {
        popup.location.href = url;
      })
      .catch((err: unknown) => {
        popup.close();
        finish(err instanceof Error ? err : new Error("Could not start the Google sign-in."));
      });
  });
  return { result, cancel: () => cancel() };
}
