# Appendix A — Glossary

← [Chapter 11](./chapter-11-troubleshooting-and-faq.md) · [Index](./index.md) · Next: [Appendix B →](./appendix-b-quick-reference.md)

> Every term used in this book, in plain English. Alphabetical.

---

**AAB (Android App Bundle)** — A publishing format (`.aab`) for the Play Store. Google
generates optimized APKs per device from it. Used for store distribution;
`flutter build appbundle`. (Chapter 9)

**Adaptive icon** — An Android launcher icon defined as separate background + foreground
vector layers, so the system can mask it into different shapes. Ours is a brand star on a
gradient. (Chapter 4 §4.8, Chapter 7 §7.3)

**AGP (Android Gradle Plugin)** — The plugin that drives the Android build inside Gradle.
**AGP 8** works with our WebView plugin; **AGP 9** removed a file that breaks it — the
reason Flutter is pinned. (Chapter 8)

**APK (Android Package)** — The single installable file for an Android app. The deliverable
you download and install. (Chapter 1, Chapter 5)

**Artifact (CI)** — A file produced by a GitHub Actions run and made available for
download. Our APK is uploaded as the **`knowledge-vault-apk`** artifact. (Chapter 5)

**Auto-reflect** — The property that web-app changes appear in the installed mobile app on
the next launch, with no rebuild — because the app loads the live site. (Chapter 2)

**CI (Continuous Integration)** — A server that automatically runs tasks (like building the
APK) when code changes. We use **GitHub Actions**. (Chapter 3, Chapter 8)

**CORS (Cross-Origin Resource Sharing)** — Browser rules about which origins may call an
API. The WebView loads the site's own origin, already allowed by `WEB_ORIGIN`, so nothing
extra is needed. (Chapter 3, Chapter 7)

**Cold start** — The delay when a sleeping free-tier server wakes to handle the first
request (~30–60s). Can slow the app's very first load. (Chapter 11)

**`--dart-define`** — A flag that passes a compile-time value into Dart. We use
`--dart-define=SITE_URL=...` to set the target site without editing code. (Chapters 6, 7)

**Dart** — The programming language Flutter apps are written in. Our `lib/*.dart` files.
(Chapter 1)

**Debug key** — The automatic, shared signing key used in development. Fine for sideloading;
not accepted by the Play Store. (Chapter 9)

**Deep link** — A URL that opens a specific screen in the app rather than the home page. Not
implemented yet; a possible extension. (Chapter 10)

**FCM (Firebase Cloud Messaging)** — Google's push-notification service; what you'd add for
true push (banners when the app is closed). (Chapter 10)

**Flutter** — Google's cross-platform toolkit for building apps from one codebase. The app's
UI shell is Flutter. (Chapter 1, Chapter 3)

**`flutter create`** — Command that generates a platform project scaffold (e.g. the
`android/` folder). Step 1 of the generate-and-overlay build. (Chapters 6, 8)

**`flutter_inappwebview`** — The full-featured WebView plugin used by the app (uploads,
downloads, cookies, pull-to-refresh, permissions). Kotlin under the hood. (Chapter 3)

**Generate-and-overlay** — The pattern where the build *generates* a standard native
project, then *overlays* the committed customizations from `android_overlay/`. Keeps only
meaningful native files in git. (Chapters 6, 8)

**GitHub Actions** — GitHub's built-in CI. Runs `.github/workflows/mobile-apk.yml` to build
the APK. (Chapters 5, 8)

**Hot reload** — Flutter's instant code-update-while-running feature, used during
`flutter run`. (Chapter 6)

**JDK (Java Development Kit)** — Needed by the Android/Gradle build; CI uses **JDK 17**.
(Chapter 8)

**Keystore** — The file holding a release signing key. Must be kept secret; losing it means
you can't update a published app. (Chapter 9)

**Kotlin** — The modern Android language. Our tiny host `MainActivity.kt` is Kotlin.
(Chapters 1, 4)

**MainActivity** — The native Android activity Flutter runs inside. Ours only enables
WebView debugging in debug builds. (Chapter 4 §4.7)

**Manifest (`AndroidManifest.xml`)** — The Android file declaring permissions (INTERNET,
CAMERA), the app label, and the launch activity. (Chapter 4 §4.6)

**MDM / EMM** — Mobile/Enterprise Device Management (Intune, Workspace ONE, …). Pushes apps
to managed corporate devices centrally — a clean way to roll out to a fleet. (Chapter 9)

**Monorepo** — One repository containing several projects (`apps/web`, `apps/api`,
`apps/mobile`, `packages/shared`). (Chapter 1, Chapter 3)

**ProGuard** — Android's code shrinker/obfuscator. A referenced ProGuard file changed
between AGP versions; the CI has a safety-net step to keep it valid. (Chapter 8)

**`pubspec.yaml`** — The Flutter project manifest: app name, version, and dependencies.
(Chapters 3, 7)

**PullToRefresh** — Swipe-down-to-reload, provided natively by the shell around the WebView.
(Chapter 4)

**Release key** — A real, private signing key you generate for stable distribution and the
Play Store. (Chapter 9)

**Shell** — A thin native wrapper around a WebView. The entire design of this app. (Chapter
2)

**Sideload** — Installing an app from an APK file directly, outside the Play Store. Requires
enabling *Install unknown apps* once. (Chapter 5)

**`SITE_URL`** — The setting for which website the app loads. Set in code, at build time, or
in CI. (Chapters 4, 7)

**Splash screen** — The branded screen shown while the site's first paint loads (star mark,
name, tagline, spinner). (Chapter 4 §4.5)

**SSE (Server-Sent Events)** — The web app's live-update channel (notifications, etc.),
active while the app is open. Different from push. (Chapters 3, 10)

**`url_launcher`** — The plugin that opens external links (`mailto:`, `tel:`, other sites)
and downloads in the phone's system apps. (Chapter 3, Chapter 4)

**WebView** — An embedded browser engine that renders a web page inside an app, without
browser chrome. The core of the app. (Chapters 1, 2)

**`workflow_dispatch`** — The GitHub Actions trigger that gives you the manual **Run
workflow** button, with an optional site-URL input. (Chapters 5, 8)

**WKWebView** — Apple's WebView engine, used by the plugin on iOS (vs Android's WebView).
(Chapter 10)

---

← [Chapter 11](./chapter-11-troubleshooting-and-faq.md) · [Index](./index.md) · Next: [Appendix B — Quick Reference →](./appendix-b-quick-reference.md)
