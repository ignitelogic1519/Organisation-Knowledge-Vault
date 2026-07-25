# Chapter 6 — Building Locally

← [Chapter 5](./chapter-05-build-the-apk-with-ci.md) · [Index](./index.md) · Next: [Chapter 7 →](./chapter-07-configuration-and-branding.md)

> **In this chapter:** how to build the APK on your **own machine**, step by step —
> installing the tools, generating the Android project, applying the overlay, and running
> the build. Use this when you're actively developing the shell or need an instant local
> build.

**Level:** 🟡 Intermediate · **Prerequisites:** Chapters 1–4; a computer you can install
software on (macOS, Windows, or Linux).

---

## 6.1 When to build locally vs use CI

| Use **CI** (Chapter 5) when… | Use **local** (this chapter) when… |
|------------------------------|------------------------------------|
| You just want an APK to install | You're editing the Dart/Kotlin code and iterating |
| You have no dev tools installed | You want to run on an emulator/device with hot reload |
| You want a shareable artifact | You need to debug the native shell |

> **💡** Most people never need this chapter — CI covers them. Read on only if you're
> going to change the app itself.

---

## 6.2 Install the prerequisites

You need two toolchains: the **Flutter SDK** and the **Android SDK**.

> **⚙️ Hands-on**

1. **Install Flutter** — follow the official guide for your OS
   (`https://docs.flutter.dev/get-started/install`). Add `flutter` to your `PATH`.
2. **Install the Android SDK** — the simplest route is to install **Android Studio**,
   which bundles the SDK, platform tools, and an emulator.
3. **Verify** everything with Flutter's own doctor:
   ```bash
   flutter doctor
   ```
   Resolve anything it flags (accept Android licenses with
   `flutter doctor --android-licenses` if prompted).

> **⚠️ Match the CI Flutter version.** CI pins **Flutter 3.24.5** for a compatibility
> reason explained in [Chapter 8](./chapter-08-ci-pipeline-deep-dive.md). To avoid
> surprises, use that same version locally. With the Flutter Version Manager you can do:
> ```bash
> fvm install 3.24.5 && fvm use 3.24.5
> ```
> or check out that version of the SDK directly.

---

## 6.3 Understand the "generate + overlay" workflow first

Before the commands, understand *why* they're shaped the way they are — otherwise step 2
looks alarming.

> **💡 The key idea**
> The repo does **not** store the full `android/` project (it's git-ignored). Instead it
> stores only the small, meaningful Android customizations in **`android_overlay/`**. So a
> local build has three phases:
> 1. **Generate** a fresh, standard Android project with `flutter create`.
> 2. **Restore** our Dart sources (because `flutter create` overwrites some files from its
>    template).
> 3. **Overlay** our committed Android files on top of the generated scaffold.

This is exactly what CI does too — you're just doing it by hand.

---

## 6.4 Step-by-step: build the APK

> **⚙️ Hands-on** — run these from the repository root.

```bash
cd apps/mobile

# 1) Generate the Android platform scaffold (creates the android/ folder)
flutter create --org com.knowledgevault --project-name knowledge_vault --platforms=android .

# 2) Put our sources back (flutter create rewrote these from its template)
git checkout -- pubspec.yaml analysis_options.yaml lib

# 3) Overlay our committed Android customizations onto the scaffold
cp -R android_overlay/app/src/main/. android/app/src/main/

# 4) Resolve dependencies
flutter pub get

# 5) Build the release APK, pointed at your site
flutter build apk --release --dart-define=SITE_URL=https://your-app.vercel.app
```

The finished APK is at:

```
apps/mobile/build/app/outputs/flutter-apk/app-release.apk
```

Copy that to a phone and install it exactly as in [Chapter 5 §5.5](./chapter-05-build-the-apk-with-ci.md#55-step-by-step-install-on-an-android-phone).

> **⚠️ Watch out — don't commit the generated folders.** After building you'll have
> `android/`, `build/`, `.dart_tool/` etc. These are all in `.gitignore` and must **stay**
> out of git. Only `android_overlay/` and `lib/` are tracked. If `git status` shows an
> `android/` folder as untracked, that's expected — leave it alone.

---

## 6.5 Run on an emulator or device (with hot reload)

For active development you usually don't want a full release build each time. Run the app
live instead:

> **⚙️ Hands-on**

1. Start an emulator (from Android Studio's Device Manager) **or** plug in a phone with USB
   debugging enabled.
2. Confirm Flutter sees it:
   ```bash
   flutter devices
   ```
3. Run in debug with your site URL:
   ```bash
   flutter run --dart-define=SITE_URL=https://your-app.vercel.app
   ```
4. Edit a Dart file and press **`r`** for hot reload, or **`R`** for a hot restart.

> **💡** In a debug run, `MainActivity.kt` enables WebView inspection, so you can open
> `chrome://inspect` in desktop Chrome to debug the loaded web page itself.

---

## 6.6 Building an app bundle (optional, for the Play Store)

If you're heading toward Play Store distribution, you'll want an **App Bundle** (`.aab`)
rather than an APK:

```bash
flutter build appbundle --release --dart-define=SITE_URL=https://your-app.vercel.app
# → build/app/outputs/bundle/release/app-release.aab
```

Signing that properly for the store is covered in
[Chapter 9](./chapter-09-release-and-distribution.md).

---

## Key takeaways

- Local builds need the **Flutter SDK + Android SDK**; verify with `flutter doctor`.
- Use the **same Flutter version as CI (3.24.5)** to avoid build breakage.
- The build is always **generate (`flutter create`) → restore sources → overlay
  `android_overlay/` → `pub get` → `build apk`.**
- The APK lands at `build/app/outputs/flutter-apk/app-release.apk`.
- The generated `android/`, `build/`, `.dart_tool/` folders are **git-ignored** — never
  commit them.
- For iterative work, use `flutter run` with hot reload instead of full release builds.

## Check yourself

1. Why isn't the `android/` folder stored in git, and how is it produced locally?
2. What does step 2 (`git checkout -- ...`) fix, and why is it needed?
3. Where does the finished release APK file appear?
4. Which command would you use for live development with hot reload?

## 🎬 Video script hint

A hands-on terminal video. Show `flutter doctor` (all green), then run the five build
commands one at a time, narrating what each does — especially the "generate then overlay"
pair, since that's the surprising part. End by locating the APK file and installing it.
Optionally show a `flutter run` hot-reload edit for the "wow."

---

← [Chapter 5](./chapter-05-build-the-apk-with-ci.md) · [Index](./index.md) · Next: [Chapter 7 — Configuration & Branding →](./chapter-07-configuration-and-branding.md)
