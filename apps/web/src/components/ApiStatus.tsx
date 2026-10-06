"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@vault/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type State = { state: "checking" } | { state: "ok"; ms: number } | { state: "down" };

/**
 * A quiet service-status line for the footer. It used to sit in the hero as "API connected
 * · 566 ms", which read like a development diagnostic in the one place that should only
 * carry the product's promise and the next step. The words are for customers; the response
 * time is still there for whoever wants it, as the line's hint.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<State>({ state: "checking" });

  useEffect(() => {
    const started = performance.now();
    fetch(`${API_URL}/health`)
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((body) => {
        if (body.status === "ok") {
          setStatus({ state: "ok", ms: Math.round(performance.now() - started) });
        } else {
          setStatus({ state: "down" });
        }
      })
      .catch(() => setStatus({ state: "down" }));
  }, []);

  return (
    <span
      className="status-line"
      role="status"
      data-hint={
        status.state === "ok"
          ? `The service answered in ${status.ms} ms.`
          : status.state === "down"
            ? "The service did not answer. Signing in and loading organizations will not work until it does."
            : undefined
      }
    >
      <span
        className="status-dot"
        data-state={status.state === "checking" ? undefined : status.state}
        aria-hidden
      />
      {status.state === "checking" && "Checking service…"}
      {status.state === "ok" && "All systems normal"}
      {status.state === "down" && "Service unavailable"}
    </span>
  );
}
