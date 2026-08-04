"use client";

import type { CreatePlatformRequestInput, PlatformRequestView, PricingView } from "@vault/shared";
import { api } from "./auth-client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const pricing = {
  /** Public pricing cards. The access token is sent when there is one, so a signed-in
   *  reader also gets the organizations they could upgrade — anonymous readers just
   *  get the cards. */
  view: async (): Promise<PricingView> => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("kv.accessToken") : null;
    const res = await fetch(`${API}/pricing`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
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
  /** Clear a served request from your own list (the outcome stays in your mailbox). */
  dismiss: (id: string) =>
    api<{ ok: boolean }>(`/platform-requests/${id}`, { method: "DELETE" }),
};
