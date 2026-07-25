# Chapter 3 — Architecture & Tech Stack

← [Chapter 2](./chapter-02-the-big-idea.md) · [Index](./index.md) · Next: [Chapter 4 →](./chapter-04-reading-the-code.md)

> **In this chapter:** how the pieces fit together — the mobile app, the website, and the
> backend — and the exact technologies used at each layer, with the *why* behind each
> choice.

**Level:** 🟢 Beginner · **Prerequisites:** Chapters 1–2

---

## 3.1 The whole system, one diagram

The mobile app is one client in a larger system. Here's the full picture:

```
 ┌──────────────────────┐    HTTPS     ┌───────────────┐   HTTPS/JSON   ┌────────────┐   SQL   ┌──────────┐
 │  📱 Mobile app        │  (loads UI)  │  🌐 Web app    │  (REST API)    │  ⚙️ API     │ ──────► │  Postgres │
 │  Flutter + Kotlin     │ ───────────► │  Next.js       │ ─────────────► │  Fastify   │         │  (Neon)   │
 │  WebView shell        │ ◀─────────── │  (Vercel)      │ ◀───────────── │  + Prisma  │         └──────────┘
 └──────────────────────┘   web pages   └───────────────┘   JSON data     │ (Render)   │
                                                                          └─────┬──────┘
                                                                                │ storage adapter
                                                                                ▼
                                                                       (each org's own Drive)
```

> **💡 Read it left to right:** the **mobile app** loads the **web app**; the web app calls
> the **API**; the API reads and writes the **database** and streams media from each
> organization's own storage. The mobile app only ever touches the first hop — the web app.

### Why the mobile app only touches the web app

Because the app is a WebView showing the website, **all** the API calls, authentication,
and data handling happen inside the web app exactly as they do in a desktop browser. The
mobile shell adds no API logic of its own. This is why the backend needed **zero changes**
to support mobile — to the server, the app is just another browser hitting the website.

> **⚙️ Note on CORS:** the web app already permits its own origin (`WEB_ORIGIN`), and the
> WebView loads that same origin, so there was nothing to configure. Cross-origin rules
> simply don't come into play.

---

## 3.2 The mobile app's internal layers

Zoom into just the mobile app. It's a small stack of four layers:

```
┌───────────────────────────────────────────────┐
│  Flutter UI shell (Dart)   → lib/*.dart        │  splash, progress bar, error screen,
│                                                 │  back navigation, pull-to-refresh
├───────────────────────────────────────────────┤
│  WebView engine            → flutter_inappwebview │ renders the live website; handles
│  (Kotlin under the hood)                        │  cookies, uploads, downloads, JS
├───────────────────────────────────────────────┤
│  Android host (Kotlin)     → MainActivity.kt    │  the native activity Flutter runs in
├───────────────────────────────────────────────┤
│  Android OS                                     │  the phone itself
└───────────────────────────────────────────────┘
```

| Layer | Technology | Where in the repo |
|-------|-----------|-------------------|
| App & UI shell | **Flutter (Dart)** | `apps/mobile/lib/` |
| WebView engine | **`flutter_inappwebview`** plugin | declared in `pubspec.yaml` |
| Android host | **Kotlin** | `android_overlay/.../MainActivity.kt` |
| Launcher icon / splash | Android adaptive icon (vector) | `android_overlay/.../res/` |
| APK build | **GitHub Actions** | `.github/workflows/mobile-apk.yml` |

---

## 3.3 Why these technologies (the *why* behind each choice)

Good KT explains reasoning, not just facts.

### Why Flutter?
> Flutter builds from a **single codebase** and can target Android *and* iOS from the same
> source. Since the goal is a lightweight cross-platform shell, Flutter lets the same
> `lib/` code run on iOS later with almost no changes (see [Chapter 10](./chapter-10-extending-the-app.md)).

### Why the `flutter_inappwebview` plugin (not the basic one)?
> A basic WebView can show a page, but this app needs the *full* set: **file uploads,
> file downloads, JavaScript, cookies (for persistent login), pull-to-refresh, and
> permission prompts**. `flutter_inappwebview` provides all of these. Its Android
> implementation is written in Kotlin.

### Why Kotlin for the host?
> Every Flutter Android app runs inside a native **Activity**. Kotlin is the modern
> standard language for Android, so the host activity (`MainActivity.kt`) is Kotlin. Ours
> is deliberately tiny — it only enables WebView debugging in debug builds.

### Why build the APK in GitHub Actions?
> Compiling an Android app needs the full Android SDK toolchain. Rather than require every
> team member to install gigabytes of tooling, the **CI builds the APK in the cloud** and
> hands back a downloadable file. Anyone with repo access can get an APK without a local
> setup. (Local builds are still possible — [Chapter 6](./chapter-06-build-locally.md).)

---

## 3.4 The dependencies, decoded

Open `apps/mobile/pubspec.yaml` and you'll find just **two** runtime dependencies. That
small number is itself a design statement — this app does very little of its own.

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_inappwebview: ^6.1.5   # the full-featured WebView
  url_launcher: ^6.3.1           # opens mailto:/tel:/external links & downloads
                                 # in the phone's system apps

dev_dependencies:
  flutter_lints: ^4.0.0          # code-style checks (development only)
```

| Package | Job |
|---------|-----|
| `flutter_inappwebview` | Renders the website; handles cookies, JS, uploads, downloads, pull-to-refresh, permissions. |
| `url_launcher` | When the user taps an external link (`mailto:`, `tel:`, a non-app site) or a download starts, hands it to the correct system app. |
| `flutter_lints` | Enforces Dart style during development; not shipped in the app. |

> **⚠️ Watch out — version pinning matters.** The `^6.1.5` on `flutter_inappwebview`, and
> the Flutter version pinned in CI, are chosen together for compatibility. Chapter 8
> explains why the CI pins **Flutter 3.24.5** specifically — bumping it blindly can break
> the build.

---

## 3.5 How a launch actually flows

Putting the layers in motion — what happens from tap to usable app:

1. The user taps the icon → Android starts **`MainActivity`** (Kotlin host).
2. Flutter boots and runs **`main.dart`**, which applies the theme and shows
   **`WebViewScreen`**.
3. `WebViewScreen` immediately displays the **brand splash** and starts loading the site
   from **`config.dart`**'s `siteUrl`.
4. The **WebView** fetches the live website over HTTPS; a thin progress bar tracks loading.
5. On success, the splash disappears and the real Knowledge Vault UI is shown. On failure,
   the branded **error screen** with **Try again** appears instead.
6. From then on, taps, navigation, sign-in, uploads — all handled by the web app inside the
   WebView, with the native shell catching back-presses, refreshes, downloads, and
   external links.

We trace the code that does each of these steps in the next chapter.

---

## Key takeaways

- The mobile app is **one client** in a larger web + API + database system, and it only
  ever talks to the **web app** (which does everything else).
- The backend needed **no changes** for mobile — to it, the app is just another browser.
- Internally the app is four layers: **Flutter UI (Dart) → WebView plugin (Kotlin) →
  Android host (Kotlin) → OS.**
- Only **two** runtime dependencies: `flutter_inappwebview` and `url_launcher`.
- Technology choices are driven by goals: Flutter for cross-platform, `inappwebview` for a
  full-featured WebView, GitHub Actions so nobody needs a local Android setup.

## Check yourself

1. Which layer of the larger system does the mobile app communicate with directly?
2. Why did the backend need no changes to support the mobile app?
3. What are the two runtime dependencies, and what does each one do?
4. Why is the APK built in CI rather than expecting everyone to build locally?

## 🎬 Video script hint

Animate the system diagram (§3.1) one arrow at a time so viewers see data flow from phone
→ web → API → database. Then zoom into the mobile app's four internal layers (§3.2) and
end on the two-dependency `pubspec.yaml` — "the whole app depends on just these two
packages." That smallness is a memorable hook.

---

← [Chapter 2](./chapter-02-the-big-idea.md) · [Index](./index.md) · Next: [Chapter 4 — Reading the Code →](./chapter-04-reading-the-code.md)
