"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { getAccessToken, refreshSession } from "@/lib/auth-client";

// Live updates: one Server-Sent-Events stream per open org. The server only sends
// WHICH slice went stale ("structure" | "requests" | "courses" | "notifications");
// subscribed components refetch their own data through the normal authorized
// endpoints. Reconnects with a fresh access token and exponential backoff.

export type OrgEventTopic = "structure" | "requests" | "courses" | "notifications";

type Listener = (topic: OrgEventTopic) => void;

interface OrgEventsApi {
  subscribe: (topics: OrgEventTopic[], cb: Listener) => () => void;
}

const OrgEventsContext = createContext<OrgEventsApi | null>(null);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function OrgEventsProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const listeners = useRef(new Map<Listener, Set<OrgEventTopic>>());

  const subscribe = useCallback((topics: OrgEventTopic[], cb: Listener) => {
    listeners.current.set(cb, new Set(topics));
    return () => {
      listeners.current.delete(cb);
    };
  }, []);

  useEffect(() => {
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
      es = new EventSource(
        `${API}/orgs/${orgId}/events?token=${encodeURIComponent(token)}`,
      );
      es.onopen = () => {
        retryMs = 1500;
      };
      es.onmessage = (e) => {
        try {
          const { topic } = JSON.parse(e.data) as { topic: OrgEventTopic };
          for (const [cb, topics] of listeners.current) {
            if (topics.has(topic)) cb(topic);
          }
        } catch {
          /* malformed hint — ignore */
        }
      };
      es.onerror = () => {
        // stale token or dropped connection: rotate the session and reconnect
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
    return () => {
      stopped = true;
      es?.close();
    };
  }, [orgId]);

  return (
    <OrgEventsContext.Provider value={{ subscribe }}>{children}</OrgEventsContext.Provider>
  );
}

/**
 * Re-run `cb` whenever one of `topics` changes on the live channel. Safe to call
 * outside an OrgEventsProvider (no-op) — e.g. the bell on non-org pages.
 */
export function useOrgEvent(topics: OrgEventTopic[], cb: () => void): void {
  const ctx = useContext(OrgEventsContext);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const key = topics.join(",");
  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe(key.split(",") as OrgEventTopic[], () => cbRef.current());
  }, [ctx, key]);
}
