# Chapter 7 — Configuration & Branding

← [Chapter 6](./chapter-06-build-locally.md) · [Index](./index.md) · Next: [Chapter 8 →](./chapter-08-ci-pipeline-deep-dive.md)

> **In this chapter:** how to point the app at *your* deployment, and how to change its
> identity — name, launcher icon, splash screen, and brand colors.

**Level:** 🟡 Intermediate · **Prerequisites:** Chapters 4 and 6

---

## 7.1 The one setting that matters most: `SITE_URL`

Everything the user sees comes from the website at `SITE_URL`. There are **three** ways to
set it, in increasing order of "no code change":

### Option A — edit the default in code
Change the fallback in `apps/mobile/lib/config.dart`:
```dart
static const String siteUrl = String.fromEnvironment(
  'SITE_URL',
  defaultValue: 'https://YOUR-REAL-DEPLOYMENT.vercel.app',  // ← edit this
);
```
Use this when you want a permanent default committed to the repo.

### Option B — pass it at build time (no code change)
```bash
flutter build apk --release --dart-define=SITE_URL=https://your-app.vercel.app
```
Use this for a one-off build against a specific environment (staging, a preview URL, etc.).

### Option C — set it in CI (no code change, team-wide)
Set a repository variable **`SITE_URL`** under
**Settings → Secrets and variables → Actions → Variables**, or type it into the
*Run workflow* box. Covered in [Chapter 5 §5.6](./chapter-05-build-the-apk-with-ci.md#56-setting-the-site-url-for-everyone-repository-variable).

> **💡 Precedence** (highest wins): *Run workflow* input → `SITE_URL` repo variable →
> `--dart-define` at local build → the `defaultValue` in `config.dart`.

> **⚠️ Watch out** `SITE_URL` is read at **compile time**. Changing which site the app
> loads always means a **rebuild**. (Changing the site's *content* does not — that's
> auto-reflect.)

### Do I need a backend change when I change the URL?
No. The WebView is just another client of your site, and the API's existing CORS
`WEB_ORIGIN` already covers it. Point and rebuild — nothing on the server changes.

---

## 7.2 Change the app name

The name shown under the launcher icon comes from `AndroidManifest.xml`:

```xml
<application android:label="Knowledge Vault" ... >
```

Change `android:label` to rename the app. Because this lives in `android_overlay/`, your
change is committed and survives the "generate + overlay" build.

> **⚠️** The Flutter `pubspec.yaml` `name:` field (`knowledge_vault`) is the *internal*
> package name, **not** the display name — don't confuse the two. The display name is the
> manifest `label`.

---

## 7.3 Change the launcher icon and splash

The launcher icon is an Android **adaptive icon** (a vector brand star on the accent
gradient) plus the dark splash background, all under:

```
android_overlay/app/src/main/res/
├── drawable/ic_launcher_background.xml     icon background (gradient)
├── drawable/ic_launcher_foreground.xml     icon foreground (the star)
├── drawable/launch_background.xml          splash background (light)
├── drawable-night/launch_background.xml    splash background (dark)
├── mipmap-anydpi-v26/ic_launcher.xml       adaptive icon wiring
├── values/colors.xml                       icon/splash colors
└── values(-night)/styles.xml               launch theme
```

To re-brand:

> **⚙️ Hands-on**
> - **Recolor** — edit the gradient/colors in `ic_launcher_background.xml` and
>   `values/colors.xml`.
> - **Replace the mark** — swap the vector paths in `ic_launcher_foreground.xml`.
> - **Splash** — adjust `drawable/launch_background.xml` (and the `-night` variant).
>
> Because these are pure vector XML, the icon stays crisp at every density without shipping
> multiple PNG sizes.

> **💡 Alternative** For image-based icons you can instead use the `flutter_launcher_icons`
> package. The current app deliberately uses vectors to keep the repo asset-free.

---

## 7.4 Change the brand colors (native chrome)

The splash, progress bar, and error/background colors come from `lib/theme.dart`:

```dart
const Color kvAccent  = Color(0xFF5B5BF0); // brand purple
const Color kvAccent2 = Color(0xFFA24BF5); // lighter purple
const Color kvBg      = Color(0xFF0B0B14); // dark background
```

Change these three and the native chrome re-skins. Keep them in sync with the web app's
`globals.css` variables (`--accent`, `--accent-2`) so the shell and the site match.

> **💡 Two color systems, on purpose** The *native* chrome (splash/progress/error) is
> styled by `theme.dart`; the *web content* is styled by the website's own CSS. They're
> mirrored by hand so the seam is invisible.

---

## 7.5 Change the app version

The version lives in `pubspec.yaml`:
```yaml
version: 1.0.0+1     #  <marketing version>+<build number>
```
Bump the part before `+` for a user-visible version, and the number after `+` for each new
build you distribute (the Play Store requires the build number to always increase).

---

## 7.6 A worked example: rebrand for "Acme Learning"

Putting it together — what you'd touch to ship the same shell as *Acme Learning* pointed at
Acme's site:

1. `lib/config.dart` → `defaultValue: 'https://learn.acme.com'` (or pass via CI).
2. `AndroidManifest.xml` → `android:label="Acme Learning"`.
3. `res/ic_launcher_foreground.xml` + `values/colors.xml` → Acme's mark and colors.
4. `lib/theme.dart` → Acme's accent/background colors.
5. `pubspec.yaml` → reset `version:` as you like.
6. Rebuild (CI or local). Done — a fully rebranded app from the same four Dart files.

---

## Key takeaways

- `SITE_URL` picks the site; set it in **code**, at **build time**, or in **CI** — CI/input
  wins over the code default. Changing it needs a **rebuild**, not a backend change.
- App **name** = `android:label` in the manifest (not the `pubspec` `name`).
- **Icon & splash** = vector XML under `android_overlay/.../res/`.
- **Brand colors** for native chrome = the three constants in `lib/theme.dart`, mirrored
  from the web CSS.
- **Version** = `pubspec.yaml` `version: x.y.z+build`.

## Check yourself

1. Give the three ways to set `SITE_URL` and their precedence order.
2. Which file/attribute sets the app's display name?
3. Which file holds the brand colors used by the splash and progress bar?
4. If you change `SITE_URL`, do you also need to change the backend? Why or why not?

## 🎬 Video script hint

A satisfying "rebrand in 5 minutes" video: start from the default app, then live-edit the
label, the icon color, and the theme constants, rebuild, and show the new-looking app on a
device. The §7.6 worked example is your shot list.

---

← [Chapter 6](./chapter-06-build-locally.md) · [Index](./index.md) · Next: [Chapter 8 — The CI Pipeline in Depth →](./chapter-08-ci-pipeline-deep-dive.md)
