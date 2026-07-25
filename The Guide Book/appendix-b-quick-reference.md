# Appendix B — Quick Reference

← [Appendix A](./appendix-a-glossary.md) · [Index](./index.md)

> The cheat sheet. Everything you'll look up repeatedly, on one page.

---

## Where things live

| I'm looking for… | Path |
|------------------|------|
| The whole mobile app | `apps/mobile/` |
| Which website it loads | `apps/mobile/lib/config.dart` |
| App entry point | `apps/mobile/lib/main.dart` |
| Brand colors | `apps/mobile/lib/theme.dart` |
| All the app behavior | `apps/mobile/lib/webview_screen.dart` |
| Permissions & app name | `apps/mobile/android_overlay/app/src/main/AndroidManifest.xml` |
| Kotlin host | `apps/mobile/android_overlay/app/src/main/kotlin/com/knowledgevault/knowledge_vault/MainActivity.kt` |
| Icon & splash assets | `apps/mobile/android_overlay/app/src/main/res/` |
| Dependencies & version | `apps/mobile/pubspec.yaml` |
| The APK build workflow | `.github/workflows/mobile-apk.yml` |
| Built APK (after local build) | `apps/mobile/build/app/outputs/flutter-apk/app-release.apk` |

---

## Get the APK from CI (fastest path)

```
GitHub → Actions tab → "Build mobile APK" → Run workflow
      → (optional) type site URL → Run
      → open the run → wait for ✓ → Artifacts → download "knowledge-vault-apk"
      → unzip → app-release.apk
```

Install on phone: enable **Install unknown apps** for your file manager → tap the APK →
**Install**.

---

## Build locally (from repo root)

```bash
cd apps/mobile
flutter create --org com.knowledgevault --project-name knowledge_vault --platforms=android .
git checkout -- pubspec.yaml analysis_options.yaml lib
cp -R android_overlay/app/src/main/. android/app/src/main/
flutter pub get
flutter build apk --release --dart-define=SITE_URL=https://your-app.vercel.app
# → build/app/outputs/flutter-apk/app-release.apk
```

Run live with hot reload:
```bash
flutter run --dart-define=SITE_URL=https://your-app.vercel.app
```

Build a store bundle:
```bash
flutter build appbundle --release --dart-define=SITE_URL=https://your-app.vercel.app
```

---

## Set the site URL (precedence: top wins)

1. **Run workflow** input box (per-run) — CI
2. **`SITE_URL`** repository variable — CI (Settings → Secrets and variables → Actions → Variables)
3. **`--dart-define=SITE_URL=...`** — local build
4. **`defaultValue`** in `lib/config.dart` — the baked-in fallback

> Changing the URL requires a **rebuild**. Changing site *content* does **not**.

---

## Key facts to remember

- **Design:** a native shell around a WebView that loads the **live** website.
- **Auto-reflect:** web changes appear on next launch — no rebuild.
- **Rebuild only when:** the shell changes (URL, native feature, branding, deps).
- **Flutter pinned to 3.24.5** in CI (AGP 8 compatibility) — don't bump blindly.
- **Signing:** debug key today (sideload); add a release keystore for the Play Store.
- **Two runtime deps:** `flutter_inappwebview`, `url_launcher`.
- **`android/` is generated** and git-ignored — never commit it.

---

## Common commands

| Task | Command |
|------|---------|
| Check your toolchain | `flutter doctor` |
| Accept Android licenses | `flutter doctor --android-licenses` |
| List connected devices | `flutter devices` |
| Get dependencies | `flutter pub get` |
| Build release APK | `flutter build apk --release --dart-define=SITE_URL=…` |
| Build store bundle | `flutter build appbundle --release --dart-define=SITE_URL=…` |
| Run with hot reload | `flutter run --dart-define=SITE_URL=…` |
| Generate a keystore | `keytool -genkey -v -keystore kv-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload` |

---

## Chapter map (for quick jumps)

| Need | Go to |
|------|-------|
| Where is it? Vocabulary | [Ch. 1](./chapter-01-getting-oriented.md) |
| Why a WebView shell? | [Ch. 2](./chapter-02-the-big-idea.md) |
| How it all connects | [Ch. 3](./chapter-03-architecture-and-stack.md) |
| Read the source | [Ch. 4](./chapter-04-reading-the-code.md) |
| Download & install APK | [Ch. 5](./chapter-05-build-the-apk-with-ci.md) |
| Build on my machine | [Ch. 6](./chapter-06-build-locally.md) |
| Point at my site / rebrand | [Ch. 7](./chapter-07-configuration-and-branding.md) |
| Understand the CI | [Ch. 8](./chapter-08-ci-pipeline-deep-dive.md) |
| Sign & distribute | [Ch. 9](./chapter-09-release-and-distribution.md) |
| Add iOS / features | [Ch. 10](./chapter-10-extending-the-app.md) |
| Fix a problem | [Ch. 11](./chapter-11-troubleshooting-and-faq.md) |

---

← [Appendix A — Glossary](./appendix-a-glossary.md) · [Index](./index.md)
