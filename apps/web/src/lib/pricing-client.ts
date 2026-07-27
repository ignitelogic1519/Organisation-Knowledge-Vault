"use client";

import type { CreatePlatformRequestInput, PlatformRequestView, PricingView } from "@vault/shared";
import { api } from "./auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const pricing = {
  /** Public pricing cards (no auth needed). */
  view: async (): Promise<PricingView> => {
    const res = await fetch(`${API}/pricing`);
    if (!res.ok) throw new Error("Could not load pricing");
    return (await res.json()) as PricingView;
  },
  /** Coins are only ever fetched here (auth). */
  wallet: () => api<{ coins: number }>("/wallet"),
  request: (input: CreatePlatformRequestInput) =>
    api<{ ok: boolean; id: string }>("/platform-requests", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  myRequests: () => api<{ requests: PlatformRequestView[] }>("/platform-requests/mine"),
  withdraw: (id: string) =>
    api<{ ok: boolean }>(`/platform-requests/${id}/withdraw`, { method: "POST", body: "{}" }),
};
