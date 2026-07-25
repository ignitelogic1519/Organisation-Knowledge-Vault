# The Guide Book — Knowledge Vault Mobile App

> A course-style knowledge-transfer (KT) manual for the **Knowledge Vault Android app**.
> Written for people who have **never seen this feature before**, it starts from the
> absolute basics and builds — chapter by chapter — up to advanced topics like the CI
> build pipeline, release signing, and extending the app to iOS.

Each chapter is self-contained and ordered from **easy → complex**, so you can read it
front-to-back as a course, or jump to the one topic you need. Every chapter ends with
**Key takeaways**, a short **Check yourself** quiz, and a **🎬 Video script hint** to
help you turn the chapter into a short explainer video.

---

## How this book is organized

- **Chapters** are the big learning units (one topic area each).
- **Sections** (`##`) break a chapter into logical parts.
- **Topics** (`###`) are the smallest teachable units — usually one idea, one screen,
  or one command. Great candidates for a single 2–4 minute video.

---

## Table of contents

| # | Chapter | What you'll learn | Level |
|---|---------|-------------------|-------|
| — | [Preface](./00-preface.md) | Who this book is for, prerequisites, how to use it | — |
| 1 | [Getting Oriented](./chapter-01-getting-oriented.md) | What the app is, **where it lives in the repo**, key vocabulary | 🟢 Beginner |
| 2 | [The Big Idea — A WebView Shell](./chapter-02-the-big-idea.md) | The one concept that explains everything | 🟢 Beginner |
| 3 | [Architecture & Tech Stack](./chapter-03-architecture-and-stack.md) | How web + native + backend fit together | 🟢 Beginner |
| 4 | [Reading the Code](./chapter-04-reading-the-code.md) | A guided tour of every source file | 🟡 Intermediate |
| 5 | [Get the APK the Easy Way (CI Build)](./chapter-05-build-the-apk-with-ci.md) | **Download & install the APK** using GitHub Actions | 🟢 Beginner |
| 6 | [Building Locally](./chapter-06-build-locally.md) | **Build the APK on your own machine**, step by step | 🟡 Intermediate |
| 7 | [Configuration & Branding](./chapter-07-configuration-and-branding.md) | Point it at your site; change name, icon, colors | 🟡 Intermediate |
| 8 | [The CI Pipeline in Depth](./chapter-08-ci-pipeline-deep-dive.md) | Every line of the build workflow explained | 🔴 Advanced |
| 9 | [Release & Distribution](./chapter-09-release-and-distribution.md) | Signing, keystores, Play Store, sideloading | 🔴 Advanced |
| 10 | [Extending the App](./chapter-10-extending-the-app.md) | iOS, deep links, offline, native features | 🔴 Advanced |
| 11 | [Troubleshooting & FAQ](./chapter-11-troubleshooting-and-faq.md) | Fixes for the most common problems | 🟡 Intermediate |
| A | [Appendix A — Glossary](./appendix-a-glossary.md) | Every term, in plain English | Reference |
| B | [Appendix B — Quick Reference](./appendix-b-quick-reference.md) | Command & file-map cheat sheet | Reference |

---

## Suggested learning paths

Not everyone needs everything. Pick the track that matches your goal:

### 🎯 "I just want the app on a phone" (non-technical)
> Preface → Chapter 1 → Chapter 5. Done. You never touch code.

### 🎯 "I need to understand how it works" (product / QA / new dev)
> Chapters 1 → 2 → 3 → 4, then skim Chapter 11.

### 🎯 "I need to build, configure, and ship it" (developer / DevOps)
> The whole book, in order. Chapters 6–9 are the hands-on core.

### 🎯 "I'm making the training videos"
> Read every chapter's **🎬 Video script hint**. Each maps to roughly one short video.
> The [suggested video series](#suggested-video-series) below is a ready-made shot list.

---

## Suggested video series

A ready-made playlist you can record from this book. Each item ≈ 2–5 minutes.

1. **What is the Knowledge Vault mobile app?** (Ch. 1)
2. **Where does it live in the code?** — the file map tour (Ch. 1)
3. **Why a WebView shell? The one big idea** (Ch. 2)
4. **How the pieces connect: web, native, backend** (Ch. 3)
5. **Code tour part 1 — the Dart shell (`lib/`)** (Ch. 4)
6. **Code tour part 2 — the Android overlay** (Ch. 4)
7. **Getting the APK from GitHub Actions** (Ch. 5)
8. **Installing the APK on an Android phone** (Ch. 5)
9. **Building the APK on your own laptop** (Ch. 6)
10. **Pointing the app at your own website** (Ch. 7)
11. **Rebranding: name, icon, splash, colors** (Ch. 7)
12. **Inside the CI workflow** (Ch. 8)
13. **Signing the app for the Play Store** (Ch. 9)
14. **Adding iOS / going further** (Ch. 10)
15. **Troubleshooting the top 10 issues** (Ch. 11)

---

## At-a-glance: where is the mobile app?

Short answer, so no one has to hunt for it:

```
apps/mobile/            ← the entire mobile app lives here
.github/workflows/mobile-apk.yml   ← the workflow that builds the APK
```

The full guided answer to *"where is it and how do I build the APK"* is
**[Chapter 1](./chapter-01-getting-oriented.md)** (where) and
**[Chapter 5](./chapter-05-build-the-apk-with-ci.md)** (build & install).

---

*Maintained alongside the code. When the mobile app changes, update the relevant
chapter so the KT stays accurate.*
