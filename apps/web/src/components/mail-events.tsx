"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { MailboxView } from "@vault/shared";
import { getAccessToken, hasSession, refreshSession } from "@/lib/auth-client";
import { mailbox } from "@/lib/courses-client";

// The mailbox's live wire. One Server-Sent-Events stream per signed-in browser — opened
// from the root layout, so it is alive on EVERY page (org or not) and a message lands the
// moment it is written. The server sends only "you have mail"; this provider refetches
// through the ordinary authorized endpoint, chimes, and hands the result to whoever is
// rendering the mailbox.

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const SOUND_KEY = "kv.mailSound";

interface MailApi {
  view: MailboxView | null;
  reload: () => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
}

const MailContext = createContext<MailApi | null>(null);

/** A short two-tone chime, synthesised — no asset to ship, no autoplay of media files. */
function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, at: number, len: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + len + 0.02);
    };
    play(880, 0, 0.14);
    play(1174.7, 0.12, 0.2);
    setTimeout(() => void ctx.close().catch(() => undefined), 700);
  } catch {
    /* audio blocked (no gesture yet, or unsupported) — silence is fine */
  }
}

export function MailProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<MailboxView | null>(null);
  const [soundOn, setSoundOnState] = useState(true);
  const lastUnread = useRef(0);
  const primed = useRef(false); // don't chime for mail that was already there on load

  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    } catch {
      /* private mode — the preference just doesn't persist */
    }
  }, []);

  const reload = useCallback(() => {
    if (!hasSession()) {
      setView(null);
      return;
    }
    mailbox
      .load()
      .then((next) => {
        setView(next);
        if (primed.current && next.unread > lastUnread.current && soundOn) chime();
        lastUnread.current = next.unread;
        primed.current = true;
      })
      .catch(() => undefined);
  }, [soundOn]);

  useEffect(() => {
    try {
      setSoundOnState(localStorage.getItem(SOUND_KEY) !== "0");
    } catch {
      /* keep the default */
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The personal stream. Reconnects with a fresh access token and exponential backoff,
  // exactly like the per-org channel does.
  useEffect(() => {
    if (!hasSession()) return;
    let es: EventSource | null = null;
    let stopped = false;
    let retryMs = 1500;

    const connect = () => {
      if (stopped) return;
      const token = getAccessToken();
      if (!token) {
        setTimeout(connect, 5000);
        return;
      }
      es = new EventSource(`${API}/me/events?token=${encodeURIComponent(token)}`);
      es.onopen = () => {
        retryMs = 1500;
      };
      es.onmessage = () => reload();
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        void refreshSession()
          .catch(() => undefined)
          .then(() => {
            if (stopped) return;
            setTimeout(connect, retryMs);
            retryMs = Math.min(retryMs * 2, 30_000);
          });
      };
    };

    connect();
    // A safety net for a sleeping laptop or a dropped stream nobody noticed.
    const poll = setInterval(reload, 120_000);
    return () => {
      stopped = true;
      es?.close();
      clearInterval(poll);
    };
  }, [reload]);

  return (
    <MailContext.Provider value={{ view, reload, soundOn, setSoundOn }}>
      {children}
    </MailContext.Provider>
  );
}

/** The mailbox state. Safe outside the provider (returns a null view and a no-op reload). */
export function useMail(): MailApi {
  return (
    useContext(MailContext) ?? {
      view: null,
      reload: () => undefined,
      soundOn: false,
      setSoundOn: () => undefined,
    }
  );
}
