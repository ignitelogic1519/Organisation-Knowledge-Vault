# Chapter 11 — Troubleshooting & FAQ

← [Chapter 10](./chapter-10-extending-the-app.md) · [Index](./index.md) · Next: [Appendix A →](./appendix-a-glossary.md)

> **In this chapter:** fixes for the problems people actually hit — build failures, install
> issues, and "why is it doing that?" behavior questions. Organized by *symptom* so you can
> jump straight to yours.

**Level:** 🟡 Intermediate · **Prerequisites:** skim Chapters 5, 6, 8

---

## 11.1 Build problems (CI)

### The CI build fails on the Android/Gradle step
> **Most likely cause:** the Flutter version was changed. The build is pinned to **3.24.5**
> on purpose (AGP 8). A newer Flutter brings AGP 9, which breaks `flutter_inappwebview`.
> **Fix:** restore `flutter-version: 3.24.5` in `.github/workflows/mobile-apk.yml`, or, if
> you *must* upgrade, also resolve the ProGuard/AGP compatibility (Chapter 8 §8.4 step 8).

### The build fails with "no files found" on the upload step
> **Cause:** the APK wasn't produced, so `if-no-files-found: error` failed the run
> (by design). **Fix:** scroll up to the **Build release APK** step's log — the real error
> is there (usually a dependency or Gradle failure).

### `flutter_inappwebview` / `proguard-android.txt` error
> **Cause:** an AGP-9 toolchain. **Fix:** confirm the Flutter pin *and* that the ProGuard
> safety-net step ran (Chapter 8 §8.4 step 8). Together they resolve it.

---

## 11.2 Build problems (local)

### `flutter doctor` shows red marks
> Resolve each one before building. Common ones: Android licenses not accepted
> (`flutter doctor --android-licenses`), or `cmdline-tools` missing (install via Android
> Studio's SDK Manager).

### `git status` shows an untracked `android/` folder after building
> **That's expected and correct.** `android/` is generated and git-ignored. Do **not**
> commit it. Only `lib/` and `android_overlay/` are tracked. (See Chapter 6 §6.4.)

### My Dart changes disappeared after `flutter create`
> `flutter create` overwrites `pubspec.yaml`, `analysis_options.yaml`, and `lib/` from its
> template. That's why the workflow runs `git checkout -- pubspec.yaml analysis_options.yaml
> lib` right after. Run that yourself to restore your committed sources (Chapter 6 §6.4
> step 2).

### The build succeeds but points at the wrong website
> You forgot `--dart-define=SITE_URL=...` (or the CI variable/input). Rebuild with the
> correct `SITE_URL`. Remember it's compile-time — you must rebuild to change it
> (Chapter 7 §7.1).

---

## 11.3 Install problems (phone)

### "App not installed" / blocked install
> **Cause:** sideloading isn't permitted for the app you're installing from. **Fix:** enable
> **Install unknown apps** for that app (Files/Chrome/Drive) — Chapter 5 §5.5.

### "App not installed" when updating an existing copy
> **Cause:** signature mismatch — e.g. a debug-signed APK over a differently-signed one.
> **Fix:** uninstall the old app first, then install the new APK. (Consistent signing
> avoids this — Chapter 9.)

### The artifact download is a `.zip`, not an APK
> **That's normal.** GitHub wraps artifacts in a zip. Unzip it to find `app-release.apk`
> (Chapter 5 §5.4).

---

## 11.4 Runtime behavior questions

### The app shows "Couldn't reach Knowledge Vault"
> The site wasn't reachable when it tried to load. Causes: no network, or the backend is
> **cold-starting** (free-tier servers sleep and can take ~30–60s on first hit). **Fix:**
> tap **Try again**; if it's a cold start, it succeeds shortly after.

### First launch is slow, then it's fine
> Same cold-start effect. The splash covers the first load; subsequent launches are fast and
> stay signed in (thanks to `cacheEnabled`).

### It logged me out / didn't keep my session
> Persistent login relies on the WebView cache/cookies (`cacheEnabled: true`). If the OS
> cleared app storage, or the site's session expired, you'll sign in again — normal
> behavior.

### A download just opened the browser
> **By design.** Downloads (e.g. PDF exports) are handed to the system download manager /
> browser via `url_launcher` (Chapter 4 §4.5). The file downloads there.

### An external link opened outside the app
> **By design.** Links to other sites, and `mailto:`/`tel:`/`sms:` links, open in the right
> system app. Only same-site navigation stays inside the WebView (Chapter 4 §4.5).

### The back button exited the app instead of going back
> The back button first navigates the **web history**; only when there's nothing left to go
> back to does it exit (Chapter 4 §4.5). If you were already on the first page, exit is
> expected.

### Camera/photo upload didn't prompt / was denied
> The shell grants WebView permission requests, but Android still governs the OS-level
> camera permission. Ensure the app has camera permission in Android Settings → Apps →
> Knowledge Vault → Permissions.

---

## 11.5 Frequently asked questions

**Q: Do I need to rebuild the app every time the website changes?**
> No. Web changes appear on the next launch (auto-reflect). Rebuild only when the *shell*
> changes (Chapters 2 & 9).

**Q: Is there an iOS version?**
> Not yet. The shell can run on iOS but needs a Mac + Apple account to build/distribute
> (Chapter 10 §10.2).

**Q: Can it work offline?**
> Not currently — it loads a live site. There's a retry screen for connectivity blips
> (Chapter 2 §2.4; ideas in Chapter 10 §10.5).

**Q: Where do I change which website it opens?**
> `lib/config.dart` default, or a build-time/CI `SITE_URL` (Chapter 7 §7.1).

**Q: Is it safe to distribute the debug-signed APK internally?**
> Yes, for sideloading within the org. For the Play Store or stable updates, add release
> signing (Chapter 9).

**Q: Why is the app so small (four files)?**
> Because it delegates everything to the website. That's the whole design (Chapter 2).

---

## 11.6 A quick triage flow

```
Problem?
 ├─ Can't build?         → §11.1 (CI) / §11.2 (local). Check the Flutter pin first.
 ├─ Can't install?       → §11.3. Enable "Install unknown apps"; uninstall old copy.
 ├─ Won't load the site? → §11.4. Try again; suspect cold start or network.
 └─ "Is this a bug?"     → §11.4. Most link/download/back behaviors are by design.
```

---

## Key takeaways

- **Most build failures trace back to the Flutter version pin** — check it first.
- An untracked `android/` after building is **expected**; never commit it.
- Install issues are almost always the **sideload toggle** or a **signature mismatch**
  (uninstall first).
- Many "bugs" (downloads opening the browser, external links leaving the app, back exiting)
  are **intended** shell behaviors.
- "Couldn't reach" is usually **network or backend cold start** — retry.

## Check yourself

1. CI build fails on Gradle — what's the very first thing you check?
2. Updating the app gives "App not installed." What's the fix?
3. A PDF export opened the browser to download — bug or feature?
4. The app can't reach the site on first launch of the day — likely cause?

## 🎬 Video script hint

A "top issues" video. Use the §11.6 triage flow as the map, then demo the three most common
fixes live: enabling *Install unknown apps*, uninstall-then-reinstall for signature
mismatch, and the Try-again cold-start recovery. Reassure viewers which behaviors are
intended, not broken.

---

← [Chapter 10](./chapter-10-extending-the-app.md) · [Index](./index.md) · Next: [Appendix A — Glossary →](./appendix-a-glossary.md)
