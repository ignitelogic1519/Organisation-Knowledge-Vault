"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  auth,
  hasActivityMark,
  hasSession,
  idleDeadline,
  markActivity,
  onSessionEnded,
  seedActivity,
} from "@/lib/auth-client";

// The hour away from the keyboard, as the person experiences it (structure.md §8.8).
//
// The API is the one that enforces the timeout — this component exists so the ending is
// something you SEE. Without it a session dies quietly and the next click fails for no
// visible reason, ten minutes or two hours later. With it, the last minute is announced
// with a way to stay, and the moment the hour passes the app leaves for the sign-in page
// and says why.
//
// What counts as activity is the person, not the program: a click, a key, a scroll, a
// touch, a page they opened. The app's own background traffic — the mailbox poll, the
// request-count poll, the live-update stream, a token refresh — deliberately counts for
// nothing, or a tab left open on an empty desk would keep itself signed in for ever.

/** Announce the ending this long before it happens. */
const WARN_BEFORE_MS = 60_000;
/** Pages that are their own realm or already the way back in. */
const NO_REDIRECT = ["/login", "/register", "/kbase"];

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
  "mousemove",
] as const;

function secondsLeft(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const endingRef = useRef(false);

  const hadSessionRef = useRef(false);
  const leaveRef = useRef<() => void>(() => undefined);
  leaveRef.current = () => {
    const staying = NO_REDIRECT.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!staying) router.replace("/login");
  };

  // Ended for any reason — the hour here, a logout in another tab, the API refusing a
  // request because the session was already gone. One exit for all of them.
  useEffect(() => onSessionEnded(() => leaveRef.current()), []);

  const signOutNow = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setWarningSeconds(null);
    await auth.signOutIdle();
  }, []);

  // The clock. One tick a second: cheap, and it makes the last-minute countdown honest.
  // A background tab has its timers throttled by the browser, so the deadline is also
  // re-read whenever the tab is looked at again — that is the case that matters most,
  // since "I closed the laptop and came back after lunch" is exactly the scenario here.
  useEffect(() => {
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      if (!hasSession()) {
        // Signed out somewhere else (another tab, or a refused request). A tab that never
        // had a session is just a visitor reading a public page — leave it alone.
        if (hadSessionRef.current) {
          hadSessionRef.current = false;
          endingRef.current = false;
          setWarningSeconds(null);
          leaveRef.current();
        }
        return;
      }
      hadSessionRef.current = true;
      const left = idleDeadline() - Date.now();
      if (left <= 0) {
        void signOutNow();
        return;
      }
      setWarningSeconds(left <= WARN_BEFORE_MS ? secondsLeft(idleDeadline()) : null);
    };

    // A browser signed in before this build carries no mark; start its clock rather than
    // reading "unknown" as "away". A mark that already exists is left exactly as it is —
    // if it says an hour has passed, that is the answer, and a page load must not erase it.
    if (hasSession() && !hasActivityMark()) {
      seedActivity();
      markActivity(true);
    }

    const timer = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    // Another tab moved the clock (or ended the session) — this one follows.
    window.addEventListener("storage", tick);
    tick();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.removeEventListener("storage", tick);
    };
  }, [signOutNow]);

  // Real interaction. Passive listeners on the window, throttled inside markActivity, so
  // this costs nothing on a busy page.
  useEffect(() => {
    const onActivity = () => markActivity();
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true });
    }
    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity);
    };
  }, []);

  // Opening a page is activity too — including the ones reached without touching anything
  // (a redirect after saving, a deep link followed from the mailbox).
  useEffect(() => {
    markActivity();
  }, [pathname]);

  // The staff console is another realm with its own guard and its own card — a user
  // session quietly running down underneath it must not interrupt the console's work.
  // The timeout itself still applies; only the announcement is left to the other guard.
  const otherRealm = pathname === "/kbase" || pathname.startsWith("/kbase/");
  if (warningSeconds === null || otherRealm) return null;

  return (
    <div className="kv-idle-warning" role="alertdialog" aria-live="assertive">
      <div className="kv-idle-body">
        <strong>Still there?</strong>
        <span>
          You&rsquo;ll be signed out in{" "}
          <span className="kv-idle-count">
            {warningSeconds} second{warningSeconds === 1 ? "" : "s"}
          </span>{" "}
          because of inactivity.
        </span>
      </div>
      <div className="kv-idle-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            markActivity(true);
            setWarningSeconds(null);
          }}
        >
          Stay signed in
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void signOutNow()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
