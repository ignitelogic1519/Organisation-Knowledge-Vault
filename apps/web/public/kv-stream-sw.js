/* Knowledge Vault stream client (docs/structure.md §9.16).
 *
 * A service worker that lets a <video> or <audio> element play a document stored in an
 * organization's Google Drive — seeking included — without the whole file ever being
 * downloaded or held in memory.
 *
 * The player asks for /kv-stream/<id> with ordinary Range requests. This worker turns
 * each plaintext range into the range of stored bytes that holds it, fetches just that
 * from Knowledge Vault's streaming gateway (the ticket goes in a header, never a URL),
 * and — when the document is encrypted — decrypts those frames here, in the reader's
 * browser. The gateway only ever carries ciphertext.
 *
 * It answers nothing but /kv-stream/ URLs, and only for streams a page of ours has
 * registered. Keys live in this worker's memory and are never written anywhere; if the
 * browser stops the worker, it asks the page to register the stream again.
 *
 * The frame arithmetic mirrors kvblobCipherRange in @vault/shared, which the API's tests
 * check against real encrypted objects.
 */

const WINDOW = 2 * 1024 * 1024; // plaintext bytes answered per range request
const TAG = 16;
const streams = new Map(); // id -> { ...registration, key: CryptoKey | null }
const waiting = new Map(); // id -> [resolve]

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function b64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

self.addEventListener("message", (event) => {
  const m = event.data || {};
  if (m.type === "kv-register" && typeof m.id === "string") {
    const done = (key) => {
      streams.set(m.id, { ...m, key });
      for (const resolve of waiting.get(m.id) || []) resolve(true);
      waiting.delete(m.id);
      if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true });
    };
    if (m.encrypted && m.fileKey) {
      crypto.subtle
        .importKey("raw", b64(m.fileKey), { name: "AES-GCM" }, false, ["decrypt"])
        .then(done, () => event.ports && event.ports[0] && event.ports[0].postMessage({ ok: false }));
    } else {
      done(null);
    }
  } else if (m.type === "kv-forget" && typeof m.id === "string") {
    streams.delete(m.id);
  } else if (m.type === "kv-ping" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ ok: true });
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/kv-stream/")) return;
  const id = decodeURIComponent(url.pathname.slice("/kv-stream/".length));
  event.respondWith(serve(event.request, id, event.clientId));
});

/** Ask the page that opened this stream to register it again (renewing its ticket). */
async function askPages(type, id, clientId) {
  const pages = clientId ? [await self.clients.get(clientId)].filter(Boolean) : [];
  const all = pages.length ? pages : await self.clients.matchAll({ type: "window" });
  const ready = new Promise((resolve) => {
    waiting.set(id, [...(waiting.get(id) || []), resolve]);
    setTimeout(() => resolve(false), 8000);
  });
  for (const c of all) c.postMessage({ type, id });
  return ready;
}

async function streamFor(id, clientId) {
  if (streams.has(id)) return streams.get(id);
  // This worker may have been stopped and restarted, losing its memory: ask again.
  const ok = await askPages("kv-need", id, clientId);
  return ok ? streams.get(id) : null;
}

function text(status, message) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function nonceFor(base, i) {
  const n = new Uint8Array(12);
  n.set(base.subarray(0, 8), 0);
  new DataView(n.buffer).setUint32(8, i, false);
  return n;
}

/** Fetch stored bytes [a, b] through the gateway, renewing an expired ticket once. */
async function upstream(s, id, clientId, a, b) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(s.url, {
      headers: { authorization: `KVT ${s.ticket}`, range: `bytes=${a}-${b}` },
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) {
      const renewed = await askPages("kv-renew", id, clientId);
      if (!renewed) break;
      s = streams.get(id);
      continue;
    }
    if (!res.ok) {
      let message = `The document could not be read (${res.status}).`;
      try {
        message = (await res.json()).error || message;
      } catch (e) {
        /* not JSON */
      }
      throw Object.assign(new Error(message), { status: res.status });
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  throw Object.assign(new Error("This document's access has expired. Reopen it."), { status: 401 });
}

/** Plaintext [start, end] of an encrypted object: fetch its frames, decrypt, trim. */
async function decryptRange(s, id, clientId, start, end) {
  const f = s.stream.frameBytes;
  const stride = f + TAG;
  const first = Math.floor(start / f);
  const last = Math.floor(end / f);
  const lastLen = Math.min(f, s.bytes - last * f);
  const cipherStart = s.stream.headerBytes + first * stride;
  const cipherEnd = s.stream.headerBytes + last * stride + lastLen + TAG - 1;
  const data = await upstream(s, id, clientId, cipherStart, cipherEnd);
  const base = b64(s.stream.nonceBase);
  const out = new Uint8Array(end - start + 1);
  let at = 0;
  let written = 0;
  for (let i = first; i <= last; i += 1) {
    const len = Math.min(f, s.bytes - i * f);
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonceFor(base, i), tagLength: TAG * 8 },
        s.key,
        data.subarray(at, at + len + TAG),
      ),
    );
    at += len + TAG;
    const from = i === first ? start - first * f : 0;
    const to = i === last ? end - i * f + 1 : len;
    out.set(plain.subarray(from, to), written);
    written += to - from;
  }
  return out;
}

async function readRange(s, id, clientId, start, end) {
  if (s.encrypted) return decryptRange(s, id, clientId, start, end);
  return upstream(s, id, clientId, start, end);
}

async function serve(request, id, clientId) {
  const s = await streamFor(id, clientId);
  if (!s) return text(410, "This stream is no longer open. Reopen the document.");
  if (s.encrypted && (!s.key || !s.stream)) return text(422, "This document cannot be streamed.");
  const size = s.bytes;
  const header = request.headers.get("range");
  const baseHeaders = {
    "content-type": s.mime || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };

  try {
    if (!header) {
      // No range asked for (an <img>, a download): stream the whole document a window
      // at a time, so memory stays at one window whatever its size.
      let at = 0;
      const body = new ReadableStream({
        async pull(controller) {
          if (at >= size) return controller.close();
          const end = Math.min(size - 1, at + WINDOW - 1);
          try {
            controller.enqueue(await readRange(s, id, clientId, at, end));
            at = end + 1;
          } catch (err) {
            controller.error(err);
          }
        },
      });
      return new Response(body, { status: 200, headers: { ...baseHeaders, "content-length": String(size) } });
    }

    const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    let start;
    let end;
    if (!m || (m[1] === "" && m[2] === "")) return text(416, "Bad range");
    if (m[1] === "") {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    // Answer a bounded window; the player asks for the next one when it wants it.
    end = Math.min(end, start + WINDOW - 1);
    const bytes = await readRange(s, id, clientId, start, end);
    return new Response(bytes, {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-length": String(bytes.length),
        "content-range": `bytes ${start}-${end}/${size}`,
      },
    });
  } catch (err) {
    // A frame that fails to decrypt has been altered in storage: never play it.
    const status = err && err.status ? err.status : 422;
    const message =
      err && err.name === "OperationError"
        ? "This document failed its integrity check, so it was not played."
        : (err && err.message) || "The document could not be read.";
    return text(status, message);
  }
}
