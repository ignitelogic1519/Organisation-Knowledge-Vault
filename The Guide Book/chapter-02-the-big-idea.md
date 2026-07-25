# Chapter 2 — The Big Idea: A WebView Shell

← [Chapter 1](./chapter-01-getting-oriented.md) · [Index](./index.md) · Next: [Chapter 3 →](./chapter-03-architecture-and-stack.md)

> **In this chapter:** the single design decision that explains the entire mobile app —
> *why it's a "WebView shell"* and not a hand-built native app. Understand this one idea
> and everything else in the book clicks into place.

**Level:** 🟢 Beginner · **Prerequisites:** [Chapter 1](./chapter-01-getting-oriented.md)

---

## 2.1 The requirement that shaped everything

Before a single line was written, there was one headline requirement:

> **"Whatever changes in the web app must also show up in the mobile app."**

Think about what that demands. The web platform is large and evolving — the constellation
role map, the library, the document Studio, the PDF viewer, requests, compliance, live
notifications. New features ship regularly. If the mobile app were a *separate*
re-implementation of all that, then **every** web change would need to be re-built a
second time for mobile, tested again, and released again through an app store. The two
would inevitably drift apart, and mobile would always lag behind.

That single requirement rules out a native rewrite. So what's the alternative?

---

## 2.2 The answer: show the real website inside the app

> **💡 Concept — the "shell"**
> Instead of rebuilding the UI, the mobile app is a thin **shell** wrapped around a
> **WebView** that loads the **already-deployed website**. The app *is* the web UI,
> because it literally renders the web UI.

The consequences are worth stating plainly, because they're the whole point:

| Property | Why it's true |
|----------|---------------|
| **Same UI, pixel-for-pixel** | It's not a copy of the web UI — it *is* the web UI. |
| **All functionality, for free** | Constellation, library, Studio, PDF viewer, requests, compliance, SSE notifications, sign-in — everything the site does, the app does. |
| **Auto-reflect** | Ship a change to the website and it appears in the **installed** app on the next launch. No mobile rebuild. No store update. |
| **Tiny codebase** | The whole app is four Dart files plus a small Android overlay. |

### The "auto-reflect" superpower

This deserves its own emphasis because it's the feature people find surprising:

> **⚙️ Because the app loads the live site, updating the app usually means updating the
> website — nothing more.** A user who already installed the APK sees your new web
> feature the next time they open the app. You do **not** rebuild or redistribute the APK
> for web changes.

You only rebuild the APK when the **shell itself** changes (for example, you change which
website it points at, or add a new native capability). Web content changes need no rebuild
at all.

---

## 2.3 "But isn't that just a browser?" — what the native layer adds

A fair question: if it just shows a website, why not tell people to open the site in
Chrome? Because a raw browser tab can't do the things that make it feel like an app. The
native shell adds exactly those things:

- **An app icon and splash screen** — it lives on the home screen like any app.
- **A real hardware/gesture back button** that navigates *within* the web app.
- **Pull-to-refresh** to reload the current page with a swipe.
- **Offline / error handling** — a branded "couldn't reach Knowledge Vault" screen with a
  **Try again** button, instead of a browser error page.
- **External links & downloads open in the right app** — a `mailto:` opens the mail app, a
  PDF export hands off to the system download manager, etc.
- **Camera / file permissions** for in-app uploads (e.g. a profile photo).
- **Persistent sign-in** — the session cookie is kept between launches, so users don't log
  in every time.

> **💡** Think of it as: *the web app provides the brains; the native shell provides the
> body* — the icon, the window, the buttons, and the hooks into the phone's hardware.

---

## 2.4 The honest trade-offs

No design is free. Being upfront about the costs is part of the KT:

| Trade-off | Detail |
|-----------|--------|
| **Needs a network connection** | It loads a live website, so it isn't a true offline app. The error screen offers a retry. |
| **Android only, today** | The same shell *can* run on iOS (it uses a cross-platform toolkit), but iOS builds need a Mac and an Apple developer account. See [Chapter 10](./chapter-10-extending-the-app.md). |
| **Downloads hand off** | File downloads are handed to the system browser / download manager rather than kept inside the app. |
| **First load depends on the site** | If the backend is cold-starting (free-tier servers sleep), the very first load can be slow — the splash covers this. |

These are deliberate, accepted limitations for the current version — not bugs.

---

## 2.5 When would you *not* use a shell?

To really understand a decision, know its boundaries. A WebView shell is the right call
here because the requirement is "mirror the web app exactly, always." You would reach for
a fully native app instead if you needed: heavy offline use, deep OS integration
(widgets, background sync, complex native gestures), or maximum performance for
animation-heavy screens. Knowledge Vault needs none of those on mobile today — it needs
*parity with the web, with zero drift* — which is precisely what the shell delivers.

---

## Key takeaways

- The mobile app exists to satisfy one rule: **the web app and the mobile app must never
  drift apart.**
- It achieves that by being a **thin native shell around a WebView** that loads the
  **live deployed website**.
- **Auto-reflect:** web changes appear in the installed app on next launch — no rebuild.
- The native layer adds what a browser tab can't: icon/splash, back button,
  pull-to-refresh, error screen, external-link/download handling, permissions, persistent
  login.
- Accepted trade-offs: needs network, Android-only today, downloads hand off.

## Check yourself

1. State, in one sentence, the requirement that led to the WebView-shell design.
2. What does "auto-reflect" mean, and when does it *not* apply?
3. Name three things the native shell adds that a plain browser tab can't.
4. Give one reason you might choose a fully native app instead of a shell.

## 🎬 Video script hint

This is your most important concept video. Structure it as a story:
1. Pose the problem — "the web app changes all the time; how does mobile keep up?"
2. Reveal the trick — the app just shows the live site (show the app next to the site,
   side by side, identical).
3. The payoff — edit the website, relaunch the app, watch the change appear. That "aha"
   moment is the whole video.
4. Close with the short list of native extras (icon, back button, pull-to-refresh).

---

← [Chapter 1](./chapter-01-getting-oriented.md) · [Index](./index.md) · Next: [Chapter 3 — Architecture & Tech Stack →](./chapter-03-architecture-and-stack.md)
