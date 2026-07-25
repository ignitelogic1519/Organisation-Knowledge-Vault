# Chapter 4 — Reading the Code

← [Chapter 3](./chapter-03-architecture-and-stack.md) · [Index](./index.md) · Next: [Chapter 5 →](./chapter-05-build-the-apk-with-ci.md)

> **In this chapter:** a guided, file-by-file tour of the actual source. By the end you'll
> understand every file in `apps/mobile/` and be able to point to the exact code behind
> each behavior.

**Level:** 🟡 Intermediate · **Prerequisites:** Chapters 1–3 (some code reading ahead, but
explained line by line)

---

## 4.1 The map before the tour

```
apps/mobile/
├── lib/
│   ├── main.dart             §4.2  — app entry & theme
│   ├── config.dart           §4.3  — which website to load
│   ├── theme.dart            §4.4  — brand colors
│   └── webview_screen.dart   §4.5  — the whole UI (the big one)
└── android_overlay/app/src/main/
    ├── AndroidManifest.xml   §4.6  — permissions & app name
    ├── kotlin/.../MainActivity.kt  §4.7 — Kotlin host
    └── res/                  §4.8  — icon & splash assets
```

We go simplest → most involved.

---

## 4.2 `lib/main.dart` — the entry point

Every Flutter app starts at `main()`. Ours does three things: initialize, style the system
bars, and launch the app widget.

```dart
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: kvBg,
    ),
  );
  runApp(const KnowledgeVaultApp());
}
```

> **💡 Line by line**
> - `ensureInitialized()` — required boilerplate before touching platform features.
> - `setSystemUIOverlayStyle(...)` — makes the status bar transparent with light icons and
>   paints the navigation bar the brand background color (`kvBg`), so the app looks
>   edge-to-edge and on-brand.
> - `runApp(...)` — launches the top-level widget.

The top-level widget is minimal:

```dart
class KnowledgeVaultApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Knowledge Vault',
      debugShowCheckedModeBanner: false,   // hide the debug ribbon
      theme: buildTheme(),                 // from theme.dart
      home: const WebViewScreen(),         // the one and only screen
    );
  }
}
```

Takeaway: `main.dart` is just wiring. The real screen is `WebViewScreen`.

---

## 4.3 `lib/config.dart` — the single most important setting

This tiny file decides **which website the app displays**. It's the file you're most
likely to change.

```dart
class AppConfig {
  static const String siteUrl = String.fromEnvironment(
    'SITE_URL',
    defaultValue: 'https://knowledge-vault.vercel.app',
  );
}
```

> **💡 What `String.fromEnvironment` does**
> It reads a value passed **at build time** via `--dart-define=SITE_URL=...`. If none is
> passed, it falls back to the `defaultValue`. This means you can point the app at any
> deployment **without editing code** — just pass a different `SITE_URL` when you build.
> Three ways to set it are covered in [Chapter 7](./chapter-07-configuration-and-branding.md).

> **⚠️ Watch out** This is a **compile-time** constant, not a runtime setting. Changing the
> target site requires a **rebuild** of the APK. (Changing the *content* of the site does
> not — that's the auto-reflect magic from Chapter 2.)

---

## 4.4 `lib/theme.dart` — the brand tokens

The colors here are mirrored from the web design system so the native chrome (splash,
progress bar, backgrounds) matches the website.

```dart
const Color kvAccent  = Color(0xFF5B5BF0); // --accent   (brand purple)
const Color kvAccent2 = Color(0xFFA24BF5); // --accent-2 (lighter purple)
const Color kvBg      = Color(0xFF0B0B14); // dark app background

const LinearGradient kvGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [kvAccent, kvAccent2],
);

ThemeData buildTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: kvBg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: kvAccent,
      brightness: Brightness.dark,
    ),
  );
}
```

> **💡** These three colors — accent, accent-2, background — reappear throughout the app
> (splash gradient, progress bar, error screen). Change them here to re-skin the native
> parts. The comments (`--accent`, etc.) point to the matching CSS variables in the web
> app's `globals.css`, so the two stay in sync by hand.

---

## 4.5 `lib/webview_screen.dart` — the heart of the app

This is where all the behavior lives. It's a `StatefulWidget` (it has changing state:
loading progress, first-load-done, error). Let's break it into its jobs.

### The state it tracks

```dart
InAppWebViewController? _controller;        // handle to control the WebView
late final PullToRefreshController _pullToRefresh;
double _progress = 0;                       // 0.0 → 1.0 load progress
bool _firstLoadDone = false;                // has the site painted once?
bool _hasError = false;                     // are we showing the error screen?
final Uri _siteUri = Uri.parse(AppConfig.siteUrl);
```

### The WebView itself and its settings

```dart
InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri(AppConfig.siteUrl)),
  initialSettings: InAppWebViewSettings(
    transparentBackground: true,
    supportZoom: false,
    useOnDownloadStart: true,
    mediaPlaybackRequiresUserGesture: false,
    allowsInlineMediaPlayback: true,
    useHybridComposition: true,
    cacheEnabled: true,   // keeps the session cookie → stays signed in
  ),
  ...
)
```

> **💡 Why these settings**
> - `cacheEnabled: true` — **keeps the login session between launches** (matches the web
>   experience; no re-login every time).
> - `useOnDownloadStart: true` — lets the app catch download events (see below).
> - `allowsInlineMediaPlayback` / `mediaPlaybackRequiresUserGesture: false` — video/audio
>   courses play inline.
> - `supportZoom: false` — the web UI is already responsive; disabling pinch-zoom keeps it
>   app-like.

### The callbacks — the "smart" behaviors

The WebView reports events; the code reacts. Here are the important handlers and what each
one accomplishes:

| Callback | What it does |
|----------|--------------|
| `onProgressChanged` | Updates the top progress bar; ends the pull-to-refresh spinner at 100%. |
| `onLoadStop` | Marks the first load done (hides the splash) and clears any error. |
| `onReceivedError` | If the **main page** fails, shows the branded error screen. |
| `shouldOverrideUrlLoading` | Decides internal vs external links (below). |
| `onDownloadStartRequest` | Hands downloads to the system browser/download manager. |
| `onPermissionRequest` | Grants camera/mic/storage prompts (e.g. avatar upload). |

### Internal vs external links

```dart
bool _isInternal(Uri url) => url.host.isEmpty || url.host == _siteUri.host;

shouldOverrideUrlLoading: (c, action) async {
  final uri = action.request.url;
  if (uri == null) return NavigationActionPolicy.ALLOW;
  const externalSchemes = {'mailto', 'tel', 'sms', 'intent'};
  if (externalSchemes.contains(uri.scheme) || !_isInternal(uri)) {
    await _openExternal(uri);                 // open in the right system app
    return NavigationActionPolicy.CANCEL;     // don't load it inside the WebView
  }
  return NavigationActionPolicy.ALLOW;        // same site → stay in the app
}
```

> **💡** Rule of thumb it encodes: *if the link is on our own site, stay inside the app; if
> it's a mail/phone link or points to another website, hand it to the phone.* This is what
> makes `mailto:` open the mail app and external websites open the real browser.

### The back button

```dart
Future<void> _handleBack() async {
  final controller = _controller;
  if (controller != null && await controller.canGoBack()) {
    await controller.goBack();       // go back within the web app
  } else {
    await SystemNavigator.pop();     // nothing to go back to → exit the app
  }
}
```

Wrapped in a `PopScope(canPop: false, ...)` so Android's back gesture is intercepted and
routed through this logic — pressing back navigates the *web history* first, and only
exits the app when there's nowhere left to go.

### The three overlays: splash, progress, error

At the bottom of `build()`, three conditional widgets sit on top of the WebView:

```dart
if (_progress < 1.0 && _firstLoadDone && !_hasError)
  _TopProgressBar(progress: _progress),     // thin loading bar
if (!_firstLoadDone && !_hasError) const _BrandSplash(),   // startup splash
if (_hasError) _ErrorView(onRetry: _retry),                // error + Try again
```

- **`_BrandSplash`** — the star mark on the gradient, the name, the tagline *"your
  structure · your knowledge · your custody"*, and a spinner. Shown until the first paint.
- **`_TopProgressBar`** — a 2.5px accent bar showing load progress on later navigations.
- **`_ErrorView`** — "Couldn't reach Knowledge Vault" with a **Try again** button that
  reloads.

> **💡** Notice the brand mark (`_BrandMark`) is drawn in code — a gradient rounded square
> with a star icon — so it scales crisply and matches the web favicon without shipping an
> image.

---

## 4.6 `AndroidManifest.xml` — permissions & identity

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />

<application android:label="Knowledge Vault" ... >
  <activity android:name=".MainActivity" ... />
</application>
```

> **💡 What matters here**
> - **`INTERNET`** — required; the app loads a website.
> - **`CAMERA`** — for in-app photo capture (e.g. profile picture). Marked
>   `required="false"` so phones without a camera can still install it.
> - **`android:label="Knowledge Vault"`** — the name shown under the icon.

---

## 4.7 `MainActivity.kt` — the Kotlin host

```kotlin
class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val debuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (debuggable) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }
}
```

> **💡** Deliberately tiny. It extends Flutter's `FlutterActivity` and adds exactly one
> thing: in **debug** builds, it enables remote WebView inspection so a developer can open
> `chrome://inspect` and debug the page. **Release** builds are untouched (the `if`
> guard). All the real WebView work is done by the plugin, not here.

---

## 4.8 `res/` — icon and splash assets

The `res/` folder holds the Android launcher icon (an **adaptive icon** — a vector brand
star on the accent gradient, so it renders sharp at any size) and the dark splash
background used before Flutter starts drawing. These are the committed "look" of the app
outside of code.

> **⚠️ Reminder** These overlay files are the *only* Android files kept in git. The full
> `android/` project is generated at build time and these are copied on top — see
> [Chapter 8](./chapter-08-ci-pipeline-deep-dive.md).

---

## Key takeaways

- `main.dart` = wiring; `config.dart` = which site; `theme.dart` = brand colors;
  `webview_screen.dart` = **all the behavior**.
- `webview_screen.dart` handles: loading progress, splash, error+retry, back navigation,
  internal-vs-external links, downloads, permissions, and persistent login.
- `cacheEnabled: true` is what keeps users signed in between launches.
- The Kotlin `MainActivity` only enables WebView debugging in debug builds — nothing more.
- `AndroidManifest.xml` declares `INTERNET` (required) and optional `CAMERA`.

## Check yourself

1. Which file would you edit to change the website the app loads?
2. Which setting keeps the user logged in between app launches?
3. What happens when the user taps a `mailto:` link, and which function decides that?
4. What does the Kotlin `MainActivity` actually do?

## 🎬 Video script hint

Two code-tour videos:
- **Part 1 — the Dart shell:** open `main.dart` → `config.dart` → `theme.dart`, then walk
  `webview_screen.dart` by behavior (splash, progress, back, error, links). Show the
  running app beside each snippet so viewers connect code to what they see.
- **Part 2 — the Android overlay:** `AndroidManifest.xml`, `MainActivity.kt`, and the
  icon/splash `res/` files. Emphasize how *little* native code there is.

---

← [Chapter 3](./chapter-03-architecture-and-stack.md) · [Index](./index.md) · Next: [Chapter 5 — Get the APK the Easy Way →](./chapter-05-build-the-apk-with-ci.md)
