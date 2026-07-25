# Chapter 9 — Release & Distribution

← [Chapter 8](./chapter-08-ci-pipeline-deep-dive.md) · [Index](./index.md) · Next: [Chapter 10 →](./chapter-10-extending-the-app.md)

> **In this chapter:** how the app is signed today, how to sign it properly for the Play
> Store, and the realistic ways to get it onto users' phones.

**Level:** 🔴 Advanced · **Prerequisites:** Chapters 5, 6, 8

---

## 9.1 First, what "signing" even means

> **💡 Concept** Every Android app must be **cryptographically signed** before it can be
> installed. The signature proves the app came from a consistent source and lets Android
> verify updates are from the same author. There are two kinds of signing key you'll hear
> about:
> - **Debug key** — an automatic, shared, throwaway key used during development. Fine for
>   sideloading; **rejected by the Play Store**.
> - **Release (upload) key** — a real key *you* generate and guard. Required for the Play
>   Store and for stable, updatable distribution.

---

## 9.2 How the app is signed *today*

The current release APK from CI is signed with **Flutter's debug key**. That's why:

- It **installs by sideload** (Chapter 5 §5.5) — perfectly fine for internal distribution.
- It is **not** ready for the Play Store as-is.

This is a deliberate starting point: it lets the whole team install and test without anyone
managing secrets. When you're ready to distribute officially, you add a real key.

---

## 9.3 Add a real release key (for the Play Store)

The high-level steps (standard Flutter release signing):

> **⚙️ Hands-on**

1. **Generate a keystore** (keep it secret, keep it safe — losing it means you can't update
   the app):
   ```bash
   keytool -genkey -v -keystore ~/kv-upload.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. **Reference it** from the Android Gradle build. Because the `android/` folder is
   generated, you have two options:
   - Add the `signingConfig` into a file under `android_overlay/` that gets overlaid onto
     `android/app/build.gradle` at build time, **or**
   - Add a build step that injects the `signingConfig` after `flutter create`.
   Use a `key.properties` file (path, passwords, alias) that is **never committed** —
   supply it via CI secrets.
3. **Wire secrets in CI** — store the keystore (base64) and passwords as GitHub Actions
   **secrets**, decode them in a build step, and point `key.properties` at the result.
4. **Build a signed bundle**:
   ```bash
   flutter build appbundle --release --dart-define=SITE_URL=https://your-app.vercel.app
   ```

> **⚠️ Never commit** the keystore, its passwords, or `key.properties`. Treat the upload
> key like a production password — store it only in CI secrets and a secure vault.

---

## 9.4 Distribution options, compared

| Channel | Best for | Notes |
|---------|----------|-------|
| **Sideload (APK)** | Internal teams, pilots | What we do now. Users enable *Install unknown apps* once. No store review. |
| **MDM / EMM** (Intune, Workspace ONE, etc.) | Managed corporate fleets | Push the APK to enrolled devices centrally; no per-user sideload toggle. Great for an org rollout. |
| **Google Play — Internal testing** | A controlled tester list | Requires a Play Console account + real signing; fastest official channel. |
| **Google Play — Production** | Public / whole-org launch | Full review, store listing, real signing, `.aab` bundle. |

> **💡 For an organizational KT rollout**, the two realistic choices are **sideload** (fast,
> zero cost) or **MDM** (clean at scale). The Play Store matters mainly if you want a public
> listing or automatic updates.

---

## 9.5 A note on updates

Remember the auto-reflect principle: **web changes need no redistribution at all.** You
only ship a new APK when the *shell* changes (new native capability, new target URL, new
branding, or a dependency/Flutter upgrade). That keeps the release cadence for the APK very
low — which is exactly why sideloading is tolerable in the first place.

---

## 9.6 iOS distribution (brief)

The same shell can target iOS, but distribution there always requires:
- a **Mac** to build,
- an **Apple Developer account**,
- signing with Apple certificates/provisioning profiles,
- distribution via TestFlight or the App Store (no sideloading equivalent).

The mechanics of adding iOS are in [Chapter 10](./chapter-10-extending-the-app.md).

---

## Key takeaways

- Every Android app must be **signed**; the current APK uses the **debug key** (sideload
  only, not Play-Store-ready).
- For the store, generate a **release keystore**, wire it via `key.properties` + **CI
  secrets**, and build a signed **`.aab`**. **Never commit** the key.
- Distribution realistically = **sideload** (now), **MDM** (fleet rollout), or **Play**
  (public/auto-update).
- APK releases are **rare** because web changes auto-reflect — you reship only when the
  shell changes.

## Check yourself

1. Why can't today's APK go straight to the Play Store?
2. What must you *never* commit when adding release signing, and where should it live?
3. Which distribution channel fits a managed corporate device fleet best?
4. What kinds of change actually require shipping a new APK?

## 🎬 Video script hint

A DevOps-focused video. Explain debug vs release keys with a simple visual (a shared vs a
private key). Then screen-record generating a keystore and outline the CI-secrets wiring
(don't show real secrets!). Close with the distribution-options table as a decision guide.

---

← [Chapter 8](./chapter-08-ci-pipeline-deep-dive.md) · [Index](./index.md) · Next: [Chapter 10 — Extending the App →](./chapter-10-extending-the-app.md)
