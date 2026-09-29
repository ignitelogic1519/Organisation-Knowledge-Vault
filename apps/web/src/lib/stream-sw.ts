"use client";

import type { DownloadTicket } from "@vault/shared";

// The page's half of the stream client (docs/structure.md §9.16, public/kv-stream-sw.js).
//
// Registers the service worker, hands it one stream at a time, and answers when it asks
// for a stream again — after the browser has stopped it, or when a ticket has expired
// and needs renewing (which re-runs the API's permission check).

const SW_URL = "/kv-stream-sw.js";
let ready: Promise<ServiceWorker | null> | null = null;

/** The worker controlling this page, or null when streaming is not available here. */
function worker(): Promise<ServiceWorker | null> {
  if (ready) return ready;
  ready = (async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return null;
    try {
      await navigator.serviceWorker.register(SW_URL, { scope: "/" });
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller;
      // A worker installed just now takes control after clients.claim(); wait briefly.
      return await new Promise<ServiceWorker | null>((resolve) => {
        const t = window.setTimeout(() => resolve(null), 3000);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            window.clearTimeout(t);
            resolve(navigator.serviceWorker.controller);
          },
          { once: true },
        );
      });
    } catch {
      return null;
    }
  })();
  return ready;
}

/** Whether a stream can be played through the worker in this browser, right now. */
export async function streamingAvailable(): Promise<boolean> {
  return (await worker()) !== null;
}

function post(sw: ServiceWorker, message: object): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const t = window.setTimeout(() => resolve(false), 5000);
    channel.port1.onmessage = (e: MessageEvent<{ ok?: boolean }>) => {
      window.clearTimeout(t);
      resolve(!!e.data?.ok);
    };
    sw.postMessage(message, [channel.port2]);
  });
}

function registration(id: string, t: DownloadTicket) {
  return {
    type: "kv-register",
    id,
    url: t.downloadUrl,
    ticket: t.ticket,
    encrypted: t.encrypted,
    fileKey: t.fileKey,
    mime: t.mime,
    bytes: t.bytes,
    stream: t.stream,
  };
}

/**
 * Hand one document to the worker and get back the URL a <video> or <audio> element
 * plays. `renew` fetches a fresh ticket from the API when the worker's has expired.
 */
export async function openStream(
  ticket: DownloadTicket,
  renew: () => Promise<DownloadTicket>,
): Promise<{ src: string; close: () => void } | null> {
  const sw = await worker();
  if (!sw) return null;
  const id = crypto.randomUUID();
  let current = ticket;
  if (!(await post(sw, registration(id, current)))) return null;

  const onMessage = async (event: MessageEvent<{ type?: string; id?: string }>) => {
    if (event.data?.id !== id) return;
    const target = navigator.serviceWorker.controller ?? sw;
    if (event.data.type === "kv-renew") {
      try {
        current = await renew();
      } catch {
        return; // the worker times out and the player reports the error
      }
      await post(target, registration(id, current));
    } else if (event.data.type === "kv-need") {
      await post(target, registration(id, current));
    }
  };
  navigator.serviceWorker.addEventListener("message", onMessage);

  return {
    src: `/kv-stream/${id}`,
    close: () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      (navigator.serviceWorker.controller ?? sw).postMessage({ type: "kv-forget", id });
    },
  };
}
