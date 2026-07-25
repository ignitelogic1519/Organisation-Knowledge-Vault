# Chapter 10 — Extending the App

← [Chapter 9](./chapter-09-release-and-distribution.md) · [Index](./index.md) · Next: [Chapter 11 →](./chapter-11-troubleshooting-and-faq.md)

> **In this chapter:** where to go next. How to add iOS, and the native capabilities you
> could layer on (deep links, push notifications, better offline handling) — with an honest
> read on the effort and trade-offs of each.

**Level:** 🔴 Advanced · **Prerequisites:** Chapters 3, 4, 6

---

## 10.1 The extension philosophy

> **💡** The shell is deliberately minimal. Every native feature you add is a piece of code
> that lives *outside* the website and must be maintained separately. So the guiding rule
> is: **only add native code for things the web genuinely cannot do** (icon, back button,
> hardware access, notifications). Everything else belongs in the web app, where it
> auto-reflects everywhere for free.

Keep that filter in mind for every idea below.

---

## 10.2 Add iOS support

Because the app is Flutter, the entire `lib/` shell already runs on iOS. What's missing is
the iOS platform project and an equivalent of the `android_overlay/`.

### The approach (mirrors Android)
> **⚙️ Hands-on (high level)**
> 1. Generate the iOS scaffold:
>    ```bash
>    flutter create --org com.knowledgevault --project-name knowledge_vault --platforms=ios .
>    ```
> 2. Create an **`ios_overlay/`** analogous to `android_overlay/`, holding the committed iOS
>    customizations: `Info.plist` (permissions: camera/microphone usage strings, app
>    transport security), the app icon set, and the launch screen.
> 3. Add CI/build steps that overlay `ios_overlay/` onto the generated `ios/` folder.
> 4. Build on a **Mac** with Xcode; `flutter_inappwebview` uses **WKWebView** on iOS.

### The real costs
- **A Mac is mandatory** to build and archive iOS apps.
- **An Apple Developer account** (paid) is required to run on devices and distribute.
- **No sideloading** — distribution is via TestFlight or the App Store, both reviewed.
- A few WebView behaviors differ between WKWebView and Android's WebView; test uploads,
  downloads, and permission prompts specifically.

> **💡** iOS is a *distribution and tooling* problem more than a *code* problem — the shell
> is already cross-platform.

---

## 10.3 Deep links (open a specific page from a URL/notification)

Today, tapping the icon always opens the site's default page. If you want a link like
`knowledgevault://course/123` (or an `https://` App Link) to open a specific screen:

- Register an **intent-filter** (Android) / **Universal Link** (iOS) in the overlay.
- On launch, read the incoming URI and load `SITE_URL + /that/path` in the WebView instead
  of the home page.

> **💡** Modest effort, high value if you plan to send users links from emails or push
> notifications. The web app already has the routes — you're just choosing the initial URL.

---

## 10.4 Push notifications

The web app currently delivers live updates via **SSE while the app is open**. True
**push** (a banner when the app is closed) is a native capability the web layer can't do
alone. To add it you'd integrate **Firebase Cloud Messaging (FCM)**:

- Add the `firebase_messaging` plugin and Firebase config to the overlay.
- Register the device token with the backend so the server can target it.
- On tap, use the deep-link mechanism (§10.3) to open the relevant page.

> **⚠️** This is the largest of the extensions: it touches the app, the backend (token
> storage + send logic), and Firebase setup. Scope it as its own project, not a quick add.

---

## 10.5 Better offline handling

The app needs the network because it loads a live site. If you want a friendlier offline
story you could:

- Cache the last-loaded shell/pages via a **service worker in the web app** (best — it
  auto-reflects and needs no native code), or
- Show a richer native offline screen with cached content hints.

> **💡** Prefer the **web-side** service-worker approach: it improves both the browser and
> the app at once, staying true to the "put it in the web app" philosophy.

---

## 10.6 Other native niceties (small, optional)

| Idea | Effort | Where |
|------|--------|-------|
| Haptic feedback on key actions | Small | Dart, via `HapticFeedback` |
| Custom pull-to-refresh styling | Small | `webview_screen.dart` |
| Screenshot/security flag (`FLAG_SECURE`) for sensitive content | Small | `MainActivity.kt` |
| Biometric lock before opening | Medium | `local_auth` plugin |
| In-app file preview instead of hand-off | Medium–Large | replace `onDownloadStartRequest` handling |

---

## 10.7 A checklist before you add anything native

Ask these four questions first:

1. **Can the web app do it instead?** If yes, do it there — it auto-reflects.
2. **Does it need maintenance on every OS?** Native code doubles when iOS lands.
3. **Does it introduce a secret or a service?** (FCM, keystores) — plan the ops.
4. **Does it change the "just a shell" promise?** The more native logic, the more the two
   platforms can drift — the very thing the shell exists to prevent.

---

## Key takeaways

- The `lib/` shell is **already cross-platform**; adding iOS is mostly tooling
  (**Mac + Apple account + `ios_overlay/`**), not new app code.
- **Deep links** are a small, high-value add that reuses existing web routes.
- **Push notifications** are the biggest add — app + backend + Firebase; treat as a
  project.
- Prefer solving things **in the web app** (offline, features) so they auto-reflect;
  reserve native code for what the web truly can't do.

## Check yourself

1. Why is adding iOS more of a tooling problem than a coding problem?
2. What would you reuse from the web app to implement deep links?
3. Why are push notifications considered the heaviest extension?
4. State the rule for deciding whether something should be native or web.

## 🎬 Video script hint

A "roadmap / what's next" video. Use the §10.7 checklist as the spine, then briefly preview
each extension (iOS, deep links, push, offline) with an honest effort rating. Frame it as
"here's how we'd grow this without breaking the shell promise."

---

← [Chapter 9](./chapter-09-release-and-distribution.md) · [Index](./index.md) · Next: [Chapter 11 — Troubleshooting & FAQ →](./chapter-11-troubleshooting-and-faq.md)
