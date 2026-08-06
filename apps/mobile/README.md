# Knowledge Vault — Mobile (Android)

A native Android app, built with **Flutter** (Dart) and a **Kotlin** host, that
renders the live Knowledge Vault web app inside a full-featured WebView.

## Why a WebView shell?

The headline requirement was: **whatever changes in the web app must also show up
in the mobile app.** That rules out a hand-written native re-implementation — that
would be a second, separate codebase that drifts out of sync with every web change.

This shell loads your **deployed website**, so:

- **Same UI** — pixel-for-pixel, because it *is* the web UI.
- **All functionality** — constellation, library, Studio, PDF viewer, requests,
  compliance, notifications (SSE), sign-in — all of it, unchanged.
- **Auto-reflect** — ship a change to the web app and it appears in the installed
  APK on the next launch. No mobile rebuild, no store update.

The native layer adds the things a browser tab can't: an app icon and splash, a
real back-button, pull-to-refresh, offline/retry handling, opening external links
and downloads in the right system app, and granting camera/file permissions for
in-app uploads.

## Tech stack

| Layer            | Technology |
|------------------|------------|
| App & UI shell   | Flutter (Dart) — `lib/` |
| WebView engine   | `flutter_inappwebview` (Kotlin platform implementation) |
| Android host     | Kotlin — `MainActivity` (`android_overlay/.../MainActivity.kt`) |
| Launcher icon    | Android adaptive icon, pure vector (brand star on the accent gradient) |
| APK build        | GitHub Actions → downloadable artifact |

## Configuration — point it at your deployment

The site the shell loads is `AppConfig.siteUrl` in `lib/config.dart`
(default `https://knowledge-vault.vercel.app`). Set your real URL either way:

- **Edit the default** in `lib/config.dart`, **or**
- **Pass it at build time** (no code change):
  `--dart-define=SITE_URL=https://your-app.vercel.app`, **or**
- **In CI**, set a repository variable **`SITE_URL`** (Settings → Secrets and
  variables → Actions → Variables), or type it into the workflow's
  *Run workflow* box.

No backend change is required: the WebView is just another client of your Vercel
site, and the API's existing CORS `WEB_ORIGIN` already covers it.

## Getting the APK (CI — recommended)

This repo can't compile Android here, so the APK is built in GitHub Actions:

1. Push a change under `apps/mobile/`, or run **Actions → “Build mobile APK” →
   Run workflow** (optionally typing your site URL).
2. Open the finished run and download the **`knowledge-vault-apk`** artifact.
3. Copy `app-release.apk` to an Android device and install (enable
   *Install unknown apps* for your file manager/browser).

The release APK is signed with Flutter's debug key, so it installs by sideload.
For Play Store distribution, add a real keystore and a `signingConfig` in
`android/app/build.gradle` (standard Flutter release signing).

## Building locally (optional)

Requires the Flutter SDK + Android SDK on your machine.

```bash
cd apps/mobile
flutter create --org com.knowledgevault --project-name knowledge_vault --platforms=android .
git checkout -- pubspec.yaml analysis_options.yaml lib   # keep our sources
cp -R android_overlay/app/src/main/. android/app/src/main/
flutter pub get
flutter build apk --release --dart-define=SITE_URL=https://your-app.vercel.app
# → build/app/outputs/flutter-apk/app-release.apk
# or `flutter run` on a connected device/emulator
```

The `android/` folder is generated (git-ignored). The only Android files kept in
git are the meaningful customizations under **`android_overlay/`**, which the
build overlays onto the freshly generated scaffold.

## Repository layout

```
apps/mobile/
  lib/
    main.dart            App entry, theme, status bar
    config.dart          SITE_URL (the deployment the shell loads)
    theme.dart           Brand tokens mirrored from the web design system
    webview_screen.dart  The WebView + splash, progress, back-nav, errors,
                         external-link / download / permission handling
  android_overlay/       Committed Android customizations (overlaid at build)
    app/src/main/
      AndroidManifest.xml            INTERNET/CAMERA perms, app label
      kotlin/.../MainActivity.kt     Kotlin host
      res/                           adaptive launcher icon + dark splash
  pubspec.yaml
```

## Limitations & notes

- **Android only** for now. The same shell runs on iOS (`--platforms=ios` +
  `WKWebView`), but iOS builds/distribution need a Mac and an Apple account.
- **One view, no tabs — and the web app knows it.** This shell is a single WebView: there
  is no tab strip and no second window, so a pop-up would be a place the reader could not
  leave. The web app detects that (`apps/web/src/lib/reader-window.ts`, WebView user agent /
  coarse pointer / standalone display-mode) and opens the full-screen document **reader**
  in the same view, where it draws its own tab strip back to the page the document came
  from. Nothing here needs `supportMultipleWindows`; leaving it off is the deliberate
  choice, and the hardware back button keeps working because the reader is an ordinary
  navigation.
- Needs the site reachable over the network (it's not an offline app); the error
  screen offers a retry.
- File **downloads** are handed to the system browser/download manager.
```
