"use client";

import { useEffect, useState } from "react";
import type { HealthResponse } from "@vault/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type State = { state: "checking" } | { state: "ok"; ms: number } | { state: "down" };

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
    <div className="status-card" role="status">
      <span
        className="status-dot"
        data-state={status.state === "checking" ? undefined : status.state}
      />
      {status.state === "checking" && "Checking API…"}
      {status.state === "ok" && `API connected · ${status.ms} ms`}
      {status.state === "down" && "API offline — start apps/api or check NEXT_PUBLIC_API_URL"}
    </div>
  );
}
