# Chapter 5 — Get the APK the Easy Way (CI Build)

← [Chapter 4](./chapter-04-reading-the-code.md) · [Index](./index.md) · Next: [Chapter 6 →](./chapter-06-build-locally.md)

> **In this chapter:** the recommended, no-tools-required way to get an installable APK —
> let **GitHub Actions** build it in the cloud, download the file, and install it on an
> Android phone. This is the direct answer to *"how do I download and build the app?"*

**Level:** 🟢 Beginner · **Prerequisites:** a GitHub account with access to the repo; an
Android phone. **No Flutter/Android setup needed.**

---

## 5.1 Why the CI way is the default

Compiling an Android app needs the full Android toolchain (several gigabytes). Instead of
installing all that, the repository ships a **build workflow** —
`.github/workflows/mobile-apk.yml` — that runs on GitHub's servers, builds the APK, and
attaches it to the run as a downloadable file called an **artifact**.

> **💡 In short:** you click a button, wait a few minutes, and download a ready-to-install
> `app-release.apk`. That's the whole process. Chapter 6 covers building locally if you
> ever need to.

---

## 5.2 What triggers a build

The workflow runs in two situations:

1. **Automatically** — when someone pushes a change under `apps/mobile/**` (or to the
   workflow file itself) on the `main` branch.
2. **Manually** — you click **Run workflow** in the Actions tab (this is the
   `workflow_dispatch` trigger). You can optionally type the site URL to point the build
   at a specific deployment.

For a KT audience, **manual** is what you'll use most.

---

## 5.3 Step-by-step: trigger a build manually

> **⚙️ Hands-on**

1. Open the repository on **GitHub** in your browser.
2. Click the **Actions** tab (top of the repo).
3. In the left sidebar, click the workflow named **"Build mobile APK"**.
4. Click the **Run workflow** button (top right of the list).
5. *(Optional)* In the **"Web app URL the shell loads"** box, type the site you want the
   app to open, e.g. `https://your-org.vercel.app`. Leave it blank to use the default.
6. Click the green **Run workflow** button to confirm.

A new run appears in the list within a few seconds. It typically finishes in **a few
minutes**.

```
GitHub repo
  └─ Actions tab
       └─ "Build mobile APK"  ──►  Run workflow  ──►  (optional site URL)  ──►  Run
```

---

## 5.4 Step-by-step: download the APK

> **⚙️ Hands-on**

1. Still in the **Actions** tab, click the run you just started (or the latest green one).
2. Wait until it shows a green check ✓ (all steps passed).
3. Scroll to the bottom of the run's summary page to the **Artifacts** section.
4. Download the artifact named **`knowledge-vault-apk`**.
5. It downloads as a `.zip`. Unzip it — inside is **`app-release.apk`**. That's your app.

> **⚠️ Watch out** Artifacts expire after a while (GitHub's retention period). If an old
> run's artifact is gone, just run the workflow again — it's quick.

---

## 5.5 Step-by-step: install on an Android phone

The APK is signed with Flutter's **debug key**, which means it installs by **sideloading**
(not from the Play Store). Sideloading requires a one-time permission toggle.

> **⚙️ Hands-on**

1. Transfer `app-release.apk` to the phone — email it to yourself, put it in Drive, use a
   USB cable, or download it directly on the phone.
2. On the phone, tap the `app-release.apk` file (in your Files or Downloads app).
3. Android will warn that installing from this source isn't allowed yet. Tap **Settings**
   and enable **"Allow from this source"** (a.k.a. *Install unknown apps*) for whichever
   app you're installing from (Files, Chrome, Drive…).
4. Go back and tap **Install**.
5. Open **Knowledge Vault** from your home screen. Sign in once, and you're set.

> **💡** After installing, you generally **won't** need to repeat this. Because the app
> loads the live website, future web changes appear automatically — you only reinstall
> when the *shell* changes (new native feature, or a new target URL).

---

## 5.6 Setting the site URL for everyone (repository variable)

If you always want builds to point at the same deployment, set it once instead of typing
it each time.

> **⚙️ Hands-on**

1. In the repo, go to **Settings → Secrets and variables → Actions → Variables**.
2. Click **New repository variable**.
3. Name it **`SITE_URL`**, value = your deployment URL (e.g. `https://your-org.vercel.app`).
4. Save. Now every build uses that URL unless someone types a different one in the
   *Run workflow* box (the typed value wins for that run).

> **💡 Precedence order** (highest wins): the value typed in *Run workflow* → the
> `SITE_URL` repository variable → the default baked into `lib/config.dart`.

---

## 5.7 Quick mental model of what CI did for you

So you can explain it, not just click it:

```
You click Run workflow
        │
        ▼
GitHub spins up a clean Ubuntu machine
        │  installs Java + Flutter 3.24.5
        │  generates the Android project scaffold
        │  copies your android_overlay on top
        │  runs: flutter build apk --release  (with your SITE_URL)
        ▼
Produces app-release.apk  ──►  uploaded as the "knowledge-vault-apk" artifact
```

Every one of those steps is explained line-by-line in
[Chapter 8](./chapter-08-ci-pipeline-deep-dive.md) — you don't need it to *use* the build,
only to *understand or change* it.

---

## Key takeaways

- The easiest way to get the app: **Actions tab → "Build mobile APK" → Run workflow →
  download the `knowledge-vault-apk` artifact → unzip → `app-release.apk`.**
- Installing is a **sideload**: enable *Install unknown apps* once, then tap Install.
- Set a **`SITE_URL` repository variable** to fix the target site for all builds; the
  *Run workflow* box overrides it per-run.
- You rarely rebuild — web changes auto-reflect; rebuild only when the shell changes.

## Check yourself

1. Which tab and workflow do you use to build the APK in the cloud?
2. What is the name of the artifact you download, and what file is inside it?
3. What one-time phone setting do you enable to install a sideloaded APK?
4. If a repo `SITE_URL` variable is set but you also type a URL in *Run workflow*, which
   one is used?

## 🎬 Video script hint

This is a **screen-recording** video, not a talking-head. Record your actual screen:
Actions tab → Run workflow → wait → download artifact → unzip → then switch to a phone
(or emulator screen mirror) and show the sideload install flow ending on the app opening.
Keep it real-time so viewers can follow along click-for-click.

---

← [Chapter 4](./chapter-04-reading-the-code.md) · [Index](./index.md) · Next: [Chapter 6 — Building Locally →](./chapter-06-build-locally.md)
