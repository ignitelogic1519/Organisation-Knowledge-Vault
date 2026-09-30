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

const WINDOW = 4 * 1024 * 1024; // most plaintext bytes answered per range request
const PLAIN_BLOCK = 256 * 1024; // unencrypted objects are read in blocks of this size
const RUN = 4; // blocks fetched per request to the gateway (1 MiB at the default size)
const CACHE_BLOCKS = 24; // decrypted blocks kept per stream (6 MiB at the default size)
const TAG = 16;
const streams = new Map(); // id -> { ...registration, key: CryptoKey | null, cache: Map }
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
      const before = streams.get(m.id);
      streams.set(m.id, { ...m, key, cache: before ? before.cache : new Map() });
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
    const current = streams.get(id) || s; // a renewal replaces the ticket
    const res = await fetch(current.url, {
      headers: { authorization: `KVT ${current.ticket}`, range: `bytes=${a}-${b}` },
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) {
      const renewed = await askPages("kv-renew", id, clientId);
      if (!renewed) break;
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

function blockSize(s) {
  return s.encrypted ? s.stream.frameBytes : PLAIN_BLOCK;
}

/**
 * Blocks first..last of an object, as plaintext: one request to the gateway for the
 * stored bytes that hold them and, when encrypted, each frame decrypted and checked here.
 */
async function fetchBlocks(s, id, clientId, first, last) {
  const f = blockSize(s);
  const lenOf = (i) => Math.min(f, s.bytes - i * f);
  if (!s.encrypted) {
    const data = await upstream(s, id, clientId, first * f, first * f + (last - first) * f + lenOf(last) - 1);
    const out = [];
    for (let i = first; i <= last; i += 1) out.push(data.slice((i - first) * f, (i - first) * f + lenOf(i)));
    return out;
  }
  const stride = f + TAG;
  const cipherStart = s.stream.headerBytes + first * stride;
  const cipherEnd = s.stream.headerBytes + last * stride + lenOf(last) + TAG - 1;
  const data = await upstream(s, id, clientId, cipherStart, cipherEnd);
  const base = b64(s.stream.nonceBase);
  const out = [];
  let at = 0;
  for (let i = first; i <= last; i += 1) {
    const len = lenOf(i);
    out.push(
      new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: nonceFor(base, i), tagLength: TAG * 8 },
          s.key,
          data.subarray(at, at + len + TAG),
        ),
      ),
    );
    at += len + TAG;
  }
  return out;
}

/**
 * One plaintext block, from this stream's small cache when a player asks for the same
 * bytes again (they re-request overlapping ranges constantly), or fetched with up to
 * RUN - 1 of the blocks after it. The cache holds promises, so two requests for the
 * same block share one fetch; it is bounded, and forgotten with the stream.
 */
function block(s, id, clientId, i, lastWanted) {
  const cache = s.cache;
  if (cache.has(i)) {
    const hit = cache.get(i);
    cache.delete(i);
    cache.set(i, hit); // most recently used last
    return hit;
  }
  let last = i;
  while (last < lastWanted && last - i + 1 < RUN && !cache.has(last + 1)) last += 1;
  const run = fetchBlocks(s, id, clientId, i, last);
  for (let k = i; k <= last; k += 1) {
    const one = run.then((blocks) => blocks[k - i]);
    one.catch(() => cache.get(k) === one && cache.delete(k)); // never cache a failure
    cache.set(k, one);
  }
  while (cache.size > CACHE_BLOCKS) cache.delete(cache.keys().next().value);
  return cache.get(i);
}

/**
 * The plaintext bytes [start, end] as a stream, one block at a time, fetched only as the
 * player reads them — a player that stops reading (it has enough, or it seeked) costs
 * nothing more. The first block is read before answering, so a failure there becomes a
 * proper status rather than a broken stream.
 */
async function rangeBody(s, id, clientId, start, end) {
  const f = blockSize(s);
  const first = Math.floor(start / f);
  const last = Math.floor(end / f);
  const piece = async (i) => {
    const b = await block(s, id, clientId, i, last);
    const from = i === first ? start - i * f : 0;
    const to = i === last ? end - i * f + 1 : b.length;
    return b.slice(from, to);
  };
  const head = await piece(first);
  let next = first;
  return new ReadableStream({
    async pull(controller) {
      try {
        controller.enqueue(next === first ? head : await piece(next));
        next += 1;
        if (next > last) controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
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
    if (size === 0) return new Response(new Uint8Array(0), { status: 200, headers: baseHeaders });
    if (!header) {
      // No range asked for (an <img>, a download): the whole document, a block at a time,
      // so memory stays small whatever its size.
      const body = await rangeBody(s, id, clientId, 0, size - 1);
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
    const body = await rangeBody(s, id, clientId, start, end);
    return new Response(body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "content-length": String(end - start + 1),
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
