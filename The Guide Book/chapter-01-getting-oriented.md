# Chapter 1 — Getting Oriented

← [Preface](./00-preface.md) · [Index](./index.md) · Next: [Chapter 2 →](./chapter-02-the-big-idea.md)

> **In this chapter:** what the Knowledge Vault mobile app *is*, **exactly where it lives
> in the repository**, and the handful of words you need to follow the rest of the book.

**Level:** 🟢 Beginner · **Prerequisites:** none

---

## 1.1 What is the Knowledge Vault mobile app?

> **💡 Concept**
> Knowledge Vault is a web platform for organizational training and compliance —
> people log in, take assigned courses, browse a library of documents, and managers
> track who has completed what.
>
> The **mobile app** is a native **Android application** that puts that same platform on
> a phone. When you open it, you get an app icon, a splash screen, and the full
> Knowledge Vault experience — the constellation role map, the library, sign-in,
> notifications, everything — running inside the app.

The important thing to understand up front: the mobile app is **not a re-built copy** of
the website. It is a thin native "shell" that displays the **live website** inside it. We
explain exactly why in [Chapter 2](./chapter-02-the-big-idea.md) — for now, just hold the
picture: *a phone app that shows the real Knowledge Vault site.*

### What it looks like to a user

1. Tap the **Knowledge Vault** icon on the home screen.
2. A branded splash screen appears (a star mark on a purple gradient).
3. The live site loads and the user signs in — and **stays** signed in between launches.
4. From there it behaves like the website, plus phone niceties: a real **back button**,
   **pull-to-refresh**, and downloads/links that open in the right system app.

---

## 1.2 Where the mobile app lives in the repository

This is the question most people ask first. Here is the direct answer.

> **⚙️ The entire mobile app is in one folder:**
> ```
> apps/mobile/
> ```
> **And the thing that builds the installable file (the APK) is one workflow:**
> ```
> .github/workflows/mobile-apk.yml
> ```

That's it — two locations. Everything else below is just detail *inside* those two.

### The repository at a glance

Knowledge Vault is a **monorepo** (one repository holding several projects side by side):

```
Organisation-Knowledge-Vault/
├── apps/
│   ├── web/       ← the Next.js website (what users normally see in a browser)
│   ├── api/       ← the backend API server (Fastify + Prisma)
│   └── mobile/    ← 📱 THE MOBILE APP  ◀── you are here
├── packages/
│   └── shared/    ← shared types & the central permission function
├── docs/          ← the project's design & spec documents
└── .github/
    └── workflows/
        └── mobile-apk.yml   ← 🏗️ builds the Android APK
```

### Inside `apps/mobile/` — the file map

```
apps/mobile/
├── README.md                 Short project readme (this book is the long version)
├── pubspec.yaml              The app's manifest: name, version, dependencies
├── analysis_options.yaml     Dart linter rules
├── .gitignore                Ignores generated build folders (android/, build/, …)
│
├── lib/                      ◀── THE APP CODE (written in Dart)
│   ├── main.dart             App entry point + theme wiring
│   ├── config.dart           The one setting that matters: which website to load
│   ├── theme.dart            Brand colors mirrored from the web design system
│   └── webview_screen.dart   The heart of the app (splash, loading, back, errors…)
│
└── android_overlay/          ◀── THE ANDROID-SPECIFIC BITS (kept small on purpose)
    └── app/src/main/
        ├── AndroidManifest.xml               Permissions + app name
        ├── kotlin/.../MainActivity.kt        The Kotlin host activity
        └── res/                              Launcher icon + splash screen assets
```

> **⚠️ Watch out — "where is the `android/` folder?"**
> You will **not** find a normal `android/` folder in git, and that's intentional. It is
> *generated* during the build and then the small, meaningful customizations from
> `android_overlay/` are copied on top of it. Chapter 4 and Chapter 8 explain this
> "generate + overlay" trick in detail. If you're looking for it, it does not exist until
> you run the build.

### The four Dart files, in one sentence each

| File | What it does |
|------|--------------|
| `lib/main.dart` | Starts the app and applies the theme. |
| `lib/config.dart` | Holds `siteUrl` — the website address the app displays. |
| `lib/theme.dart` | Defines the brand colors (accent purple, dark background). |
| `lib/webview_screen.dart` | The actual screen: shows the site, handles loading, back, refresh, errors, downloads, permissions. |

We read all four line-by-line in [Chapter 4](./chapter-04-reading-the-code.md).

---

## 1.3 Key vocabulary

You'll meet these words constantly. Here are the plain-English versions (the full list is
in [Appendix A](./appendix-a-glossary.md)).

### APK
> **💡** An **APK** (Android Package) is the single installable file for an Android app —
> the equivalent of a `.exe` installer on Windows or a `.dmg` on Mac. When we say
> "download the APK," we mean the one file you copy to a phone to install the app.

### WebView
> **💡** A **WebView** is a full web browser engine embedded *inside* an app, with no
> address bar or browser chrome. It renders a web page as if it were part of the app.
> Our mobile app is essentially a carefully dressed-up WebView pointed at the Knowledge
> Vault website.

### Flutter & Dart
> **💡** **Flutter** is Google's toolkit for building apps from a single codebase.
> **Dart** is the programming language you write Flutter apps in. Our `lib/*.dart` files
> are Dart.

### Kotlin
> **💡** **Kotlin** is the modern language for Android. Flutter still needs a small native
> Android "host" underneath it, and that host is written in Kotlin — our
> `MainActivity.kt`.

### CI / GitHub Actions
> **💡** **CI** (Continuous Integration) means "a server automatically runs tasks for you
> when code changes." **GitHub Actions** is GitHub's built-in CI. We use it to build the
> APK in the cloud so nobody needs a full Android setup on their laptop.

### Sideload
> **💡** **Sideloading** means installing an app from an APK file directly, rather than
> from the Google Play Store. Our app is distributed this way (for now).

---

## 1.4 Why this design in one picture

Here is the whole system in a single diagram. Keep it in your head for the rest of the book:

```
   ┌─────────────────────────┐         loads over HTTPS        ┌──────────────────────┐
   │  📱 Mobile app (Android) │  ───────────────────────────►  │  🌐 Knowledge Vault  │
   │  a native shell around   │                                │     website (Vercel) │
   │  a WebView               │  ◀───────────────────────────  │                      │
   └─────────────────────────┘         the live web UI          └──────────┬───────────┘
                                                                            │ same API
                                                                            ▼
                                                                 ┌──────────────────────┐
                                                                 │  ⚙️ Backend API +DB  │
                                                                 └──────────────────────┘
```

The mobile app doesn't talk to the database or the API directly — it just shows the
website, and the website does everything it already does. That's the secret to why the
mobile app is so small (four Dart files!) and why it never falls out of sync with the web
app. Chapter 2 is entirely about this idea.

---

## Key takeaways

- The mobile app is a **native Android app** that displays the **live Knowledge Vault
  website** inside it.
- It lives entirely in **`apps/mobile/`**; the APK is built by
  **`.github/workflows/mobile-apk.yml`**.
- The app code is **four small Dart files** in `lib/`, plus a small **`android_overlay/`**
  of Android-specific files.
- The `android/` folder is **generated at build time** — that's why it isn't in git.
- Core vocabulary: **APK, WebView, Flutter/Dart, Kotlin, CI, sideload.**

## Check yourself

1. In which single folder does the whole mobile app live?
2. What is an APK, in one sentence?
3. Why can't you find an `android/` folder in the repository?
4. Does the mobile app talk to the database directly? If not, what does it talk to?

## 🎬 Video script hint

Two short videos come out of this chapter naturally:
- **Video A — "What is it & where is it?"** Open the repo, expand `apps/mobile/`, point at
  the four Dart files and `android_overlay/`, then show `.github/workflows/mobile-apk.yml`.
  End on the one-picture diagram from §1.4.
- **Video B — "The words you need."** A 90-second glossary flip through §1.3: APK, WebView,
  Flutter, Kotlin, CI, sideload — one card each.

---

← [Preface](./00-preface.md) · [Index](./index.md) · Next: [Chapter 2 — The Big Idea →](./chapter-02-the-big-idea.md)
