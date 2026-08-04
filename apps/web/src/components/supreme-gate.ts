"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { useDialogs } from "./dialogs";

// One Supreme unlock, used by every screen that needs it (docs/structure.md §4.4).
//
// Every caller used to roll its own prompt-then-toast, which failed the same way in
// each: a rejected password closed the sheet and flashed a toast for four seconds. If
// you looked away, the dialog had simply vanished and nothing said why — indistinguishable
// from the button not working.
//
// This keeps the sheet open and puts the reason inside it, so a mistyped password is
// obvious and immediately retryable. It stops on cancel, and on the rate limit — after
// which more guesses cannot help and saying so is kinder than another empty prompt.

export interface SupremeGate {
  /** A live token, or null if the person cancelled or ran out of attempts. */
  unlock: (purpose?: string) => Promise<string | null>;
  /** The current token, if one was obtained and has not been cleared. */
  token: string | null;
  /** The Supreme password itself, for the flows that re-derive a file key from it. */
  password: string | null;
  clear: () => void;
}

export function useSupremeGate(orgId: string): SupremeGate {
  const dialogs = useDialogs();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  // Held in a ref too, so a second call during the same render sees the fresh token
  // rather than prompting again.
  const tokenRef = useRef<string | null>(null);

  const unlock = useCallback(
    async (purpose?: string): Promise<string | null> => {
      if (tokenRef.current) return tokenRef.current;

      let error: string | undefined;
      // The server locks out after 5 attempts in 15 minutes; stop before then rather
      // than reopening a sheet that can no longer succeed.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const pw = await dialogs.promptPassword({
          title: "Supreme access",
          message:
            purpose ??
            "Owner-level changes need the organization's Supreme password. Access lasts 10 minutes.",
          label: "Supreme password",
          submitLabel: "Unlock",
          minLength: 1,
          error,
        });
        if (pw === null) return null; // cancelled — not a failure, say nothing

        try {
          const session = await orgs.supremeVerify(orgId, pw);
          tokenRef.current = session.supremeToken;
          setToken(session.supremeToken);
          setPassword(pw);
          dialogs.toast("Supreme access granted for 10 minutes.", "success");
          return session.supremeToken;
        } catch (e) {
          if (e instanceof ApiError && e.status === 429) {
            // Locked out. Another prompt would only fail, so end it with a plain
            // explanation of what to do instead.
            await dialogs.alert({
              title: "Too many attempts",
              message:
                "The Supreme password has been entered incorrectly too many times. For safety, " +
                "further attempts are blocked for 15 minutes. Nothing has changed, and your " +
                "organization is unaffected — try again after the wait.",
            });
            return null;
          }
          error =
            e instanceof ApiError
              ? `${e.message}. Check for caps lock and try again.`
              : "That could not be verified — check your connection and try again.";
        }
      }

      await dialogs.alert({
        title: "Supreme password not accepted",
        message:
          "That password was not accepted. It is the password set when this organization was " +
          "created, and it cannot be recovered or reset by anyone — including us.",
      });
      return null;
    },
    [dialogs, orgId],
  );

  const clear = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setPassword(null);
  }, []);

  return { unlock, token, password, clear };
}
