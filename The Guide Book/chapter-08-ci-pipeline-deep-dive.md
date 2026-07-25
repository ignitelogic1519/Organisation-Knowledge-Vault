# Chapter 8 — The CI Pipeline in Depth

← [Chapter 7](./chapter-07-configuration-and-branding.md) · [Index](./index.md) · Next: [Chapter 9 →](./chapter-09-release-and-distribution.md)

> **In this chapter:** every step of the build workflow
> `.github/workflows/mobile-apk.yml`, explained — including the two non-obvious "why is
> this here?" steps (the Flutter version pin and the ProGuard safety-net).

**Level:** 🔴 Advanced · **Prerequisites:** Chapters 4–6

---

## 8.1 What the workflow is for

`.github/workflows/mobile-apk.yml` is the recipe GitHub Actions follows to turn the source
in `apps/mobile/` into a downloadable `app-release.apk`. Chapter 5 showed how to *use* it;
this chapter explains how it *works*, so you can maintain or change it confidently.

---

## 8.2 The triggers (`on:`)

```yaml
on:
  push:
    branches: [main]
    paths:
      - "apps/mobile/**"
      - ".github/workflows/mobile-apk.yml"
  workflow_dispatch:
    inputs:
      site_url:
        description: "Web app URL the shell loads (overrides the repo SITE_URL variable)"
        required: false
        type: string
```

> **💡**
> - **`push`** — builds automatically, but **only** when something under `apps/mobile/`
>   (or the workflow itself) changes on `main`. Editing the website or the API does **not**
>   trigger a mobile build — correct, because those don't affect the APK.
> - **`workflow_dispatch`** — the manual **Run workflow** button, with an optional
>   `site_url` input that overrides the repo `SITE_URL` variable for that run.

---

## 8.3 The job setup

```yaml
jobs:
  build-apk:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
```

> **💡** Runs on a fresh Ubuntu machine, and every `run:` step executes inside
> `apps/mobile/` so the commands match what you'd type locally.

---

## 8.4 The steps, one by one

### 1. Checkout
```yaml
- name: Checkout
  uses: actions/checkout@v4
```
Clones the repo onto the runner.

### 2. Set up Java (JDK 17)
```yaml
- name: Set up JDK 17
  uses: actions/setup-java@v4
  with:
    distribution: temurin
    java-version: "17"
```
The Android build (Gradle/AGP) needs a JDK. 17 is the right version for this toolchain.

### 3. Set up Flutter — **the pinned version**
```yaml
- name: Set up Flutter
  uses: subosito/flutter-action@v2
  with:
    flutter-version: 3.24.5
    channel: stable
    cache: true
```

> **⚠️ This pin is deliberate — do not bump it blindly.** The workflow comments explain why:
> Flutter **3.24.5** sits in the "AGP-8 era," where **`flutter_inappwebview` 6.1.5 builds
> cleanly**. Newer Flutter versions ship **AGP 9**, which **removed `proguard-android.txt`**
> and breaks the plugin (upstream issue
> `pichillilorenzo/flutter_inappwebview#2765`). In plain terms: a newer Flutter would fail
> the build. The pin trades "latest" for "works."

### 4. Generate the Android scaffold
```yaml
- name: Generate Android platform scaffold
  run: flutter create --org com.knowledgevault --project-name knowledge_vault --platforms=android .
```
Creates the `android/` project that isn't stored in git (see Chapter 6 §6.3).

### 5. Restore the committed Dart sources
```yaml
- name: Restore committed Dart sources
  run: git checkout -- pubspec.yaml analysis_options.yaml lib
```
`flutter create` overwrites these from its template; this puts *our* versions back.

### 6. Apply the Android overlay
```yaml
- name: Apply Android overlay (manifest, Kotlin host, icons, splash)
  run: cp -R android_overlay/app/src/main/. android/app/src/main/
```
Copies our manifest, `MainActivity.kt`, launcher icon, and splash onto the scaffold. This
is the "overlay" half of the generate-and-overlay strategy.

### 7. Resolve dependencies
```yaml
- name: Resolve dependencies
  run: flutter pub get
```
Downloads `flutter_inappwebview`, `url_launcher`, and the rest.

### 8. The ProGuard safety-net — **the second non-obvious step**
```yaml
- name: Safety-net — use the optimized default ProGuard file
  run: |
    find "$HOME/.pub-cache/hosted/pub.dev" -path '*flutter_inappwebview_android*/android/build.gradle' -print0 \
      | xargs -0 -r sed -i 's/proguard-android\.txt/proguard-android-optimize.txt/g'
```

> **💡 What this does and why**
> The plugin references `proguard-android.txt`, the file that AGP 9 removed. This step
> rewrites that reference to **`proguard-android-optimize.txt`**, which is valid on **both
> AGP 8 and AGP 9**. It's belt-and-suspenders: even though the Flutter pin already avoids
> AGP 9, this makes the build resilient if a future AGP change slips through. Together with
> the version pin, it's why the build stays green.

### 9. Build the release APK (with the site URL)
```yaml
- name: Build release APK
  run: |
    SITE_URL="${{ github.event.inputs.site_url }}"
    if [ -z "$SITE_URL" ]; then SITE_URL="${{ vars.SITE_URL }}"; fi
    if [ -n "$SITE_URL" ]; then
      flutter build apk --release --dart-define=SITE_URL="$SITE_URL"
    else
      flutter build apk --release
    fi
```

> **💡** This is the precedence logic in shell form: use the **typed input** first; if
> empty, fall back to the repo **`SITE_URL` variable**; if that's empty too, build with the
> **default from `config.dart`**. Exactly the order described in Chapter 7 §7.1.

### 10. Upload the APK artifact
```yaml
- name: Upload APK artifact
  uses: actions/upload-artifact@v4
  with:
    name: knowledge-vault-apk
    path: apps/mobile/build/app/outputs/flutter-apk/app-release.apk
    if-no-files-found: error
```

> **💡** Publishes the APK as the **`knowledge-vault-apk`** artifact you download in
> Chapter 5. `if-no-files-found: error` makes the run **fail loudly** if the APK is missing
> — so a broken build never silently "passes."

---

## 8.5 The two lessons worth memorizing

If you take only two things from this chapter:

1. **The Flutter version is pinned for a real compatibility reason** (AGP 8 vs 9 +
   `flutter_inappwebview`). Upgrading it is a deliberate task, not a routine bump — test the
   build when you do.
2. **The generate-and-overlay pattern** (steps 4–6) is how the repo keeps only the
   *meaningful* Android files in git while still producing a full project at build time.

---

## Key takeaways

- The workflow: **checkout → JDK 17 → Flutter 3.24.5 → generate scaffold → restore sources
  → overlay → pub get → ProGuard fix → build APK → upload artifact.**
- **Flutter is pinned to 3.24.5** to avoid AGP 9, which breaks `flutter_inappwebview`.
- The **ProGuard rewrite** is a safety-net so the build survives AGP changes.
- The build step encodes the `SITE_URL` **precedence**: input → repo variable → default.
- `if-no-files-found: error` guarantees a missing APK fails the run.

## Check yourself

1. Why is Flutter pinned to exactly 3.24.5? What breaks if you bump it carelessly?
2. What does the ProGuard safety-net step change, and why is it valid on both AGP 8 and 9?
3. Which three steps implement the "generate + overlay" pattern?
4. In the build step, what is the order of precedence for `SITE_URL`?

## 🎬 Video script hint

An advanced/architecture video for developers. Open the YAML and walk top to bottom,
pausing on the two "why is this weird?" steps (the version pin and the ProGuard sed). Show
the actual upstream issue number on screen for credibility. Audience: anyone who will
maintain the pipeline.

---

← [Chapter 7](./chapter-07-configuration-and-branding.md) · [Index](./index.md) · Next: [Chapter 9 — Release & Distribution →](./chapter-09-release-and-distribution.md)
