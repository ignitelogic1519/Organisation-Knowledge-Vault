"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  admin,
  adminIdleDeadline,
  endAdminSession,
  hasAdminActivityMark,
  hasAdminSession,
  markAdminActivity,
  seedAdminActivity,
} from "@/lib/admin-client";

// The console's half of the idle hour (structure.md §8.8) — the staff-side twin of
// SessionGuard. Kept as its own component rather than a shared one because the two
// realms share nothing else: different token, different storage key, different way back
// in. What they do share is the rule and the warning card's markup.

const WARN_BEFORE_MS = 60_000;

export function AdminSessionGuard() {
  const router = useRouter();
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const endingRef = useRef(false);
  const hadSessionRef = useRef(false);

  const signOutNow = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setWarningSeconds(null);
    // Ended on the server first: a console token left readable in storage must not still
    // open the screen that can purge an organization.
    await admin.logout().catch(() => undefined);
    endAdminSession("session_idle");
    router.replace("/kbase/login");
  }, [router]);

  useEffect(() => {
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      if (!hasAdminSession()) {
        if (hadSessionRef.current) {
          hadSessionRef.current = false;
          setWarningSeconds(null);
          router.replace("/kbase/login");
        }
        return;
      }
      hadSessionRef.current = true;
      const left = adminIdleDeadline() - Date.now();
      if (left <= 0) {
        void signOutNow();
        return;
      }
      setWarningSeconds(left <= WARN_BEFORE_MS ? Math.max(0, Math.ceil(left / 1000)) : null);
    };

    if (hasAdminSession() && !hasAdminActivityMark()) {
      seedAdminActivity();
      markAdminActivity(true);
    }

    const onActivity = () => markAdminActivity();
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove"] as const;
    for (const type of events) window.addEventListener(type, onActivity, { passive: true });

    const timer = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    window.addEventListener("storage", tick);
    tick();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      for (const type of events) window.removeEventListener(type, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.removeEventListener("storage", tick);
    };
  }, [router, signOutNow]);

  if (warningSeconds === null) return null;

  return (
    <div className="kv-idle-warning" role="alertdialog" aria-live="assertive">
      <div className="kv-idle-body">
        <strong>Still there?</strong>
        <span>
          The console signs out in{" "}
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
            markAdminActivity(true);
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
