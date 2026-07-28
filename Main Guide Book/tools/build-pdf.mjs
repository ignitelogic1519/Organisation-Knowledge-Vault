// Rebuilds Knowledge-Vault-Main-Guide-Book.pdf from the Markdown chapters.
//
//   cd "Main Guide Book/tools"
//   npm install                 # markdown-it, mermaid, sharp, playwright (one-off)
//   node build-pdf.mjs
//
// Pipeline: Markdown -> one HTML book (Mermaid diagrams rendered in a real browser,
// screenshots down-sampled to JPEG so the file stays a few MB) -> Chromium print-to-PDF.
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import MarkdownIt from "markdown-it";
import sharp from "sharp";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const BOOK = join(HERE, "..");
const MERMAID = require.resolve("mermaid/dist/mermaid.min.js");
const HTML = join(BOOK, "book.html");
const PDF = join(BOOK, "Knowledge-Vault-Main-Guide-Book.pdf");
const PRINT_IMAGES = join(tmpdir(), "kv-guide-print-images");

// Reading order of the book. Add new chapters here.
const FILES = [
  "README.md",
  "chapter-01-getting-started.md",
  "chapter-02-core-concepts.md",
  "chapter-03-founding-an-organization.md",
  "chapter-04-the-constellation.md",
  "chapter-05-building-your-structure.md",
  "chapter-06-people-and-governance.md",
  "chapter-07-courses.md",
  "chapter-08-the-studio.md",
  "chapter-09-the-library.md",
  "chapter-10-my-learning.md",
  "chapter-11-requests.md",
  "chapter-12-compliance.md",
  "chapter-13-notifications.md",
  "chapter-14-supreme-and-custody.md",
  "chapter-15-help-and-support.md",
  "chapter-16-flow-diagrams.md",
  "chapter-17-plans-and-access.md",
  "chapter-18-knowledge-base-portal.md",
  "appendix-glossary-and-reference.md",
];

// ── Screenshots: 2×-density PNGs are perfect on GitHub and enormous in a PDF ──────
rmSync(PRINT_IMAGES, { recursive: true, force: true });
mkdirSync(PRINT_IMAGES, { recursive: true });
for (const file of readdirSync(join(BOOK, "images")).filter((f) => f.endsWith(".png"))) {
  await sharp(join(BOOK, "images", file))
    .resize({ width: 1600, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, chromaSubsampling: "4:4:4" })
    .toFile(join(PRINT_IMAGES, file.replace(/\.png$/, ".jpg")));
}

// ── Markdown -> HTML ──────────────────────────────────────────────────────────────
const anchorOf = (file) => file.replace(/\.md$/, "").toLowerCase();
const md = new MarkdownIt({ html: true, linkify: false, breaks: false });

// ```mermaid fences become <pre class="mermaid"> for the in-page renderer.
const fence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
  if ((tokens[idx].info || "").trim() === "mermaid") {
    return `<pre class="mermaid">${md.utils.escapeHtml(tokens[idx].content)}</pre>\n`;
  }
  return fence(tokens, idx, opts, env, self);
};

// Cross-chapter .md links become internal anchors, so the PDF's links work offline.
const linkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
  const m = (tokens[idx].attrGet("href") || "").match(/^([a-z0-9-]+\.md)(#.*)?$/i);
  if (m) tokens[idx].attrSet("href", `#${anchorOf(m[1])}`);
  return linkOpen(tokens, idx, opts, env, self);
};

const sections = FILES.map((file) => {
  const body = md
    .render(readFileSync(join(BOOK, file), "utf8"))
    .replace(
      /src="images\/([^"]+)\.png"/g,
      (_, name) => `src="${pathToFileURL(join(PRINT_IMAGES, `${name}.jpg`)).href}"`,
    );
  return `<section class="chapter" id="${anchorOf(file)}">\n${body}\n</section>`;
}).join("\n");

const css = `
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Liberation Sans", "DejaVu Sans", "Noto Color Emoji", sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: #1c2033; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .cover {
    height: 247mm; display: flex; flex-direction: column; justify-content: center;
    text-align: center; page-break-after: always;
    background: linear-gradient(150deg, #efeefc 0%, #e5e9f7 55%, #eee7fb 100%);
    border-radius: 10px; padding: 0 18mm;
  }
  .cover .mark { font-size: 40pt; color: #6d3ff0; line-height: 1; }
  .cover h1 { font-size: 30pt; margin: 6mm 0 2mm; border: 0; padding: 0; color: #14172a; }
  .cover h2 { font-size: 14pt; font-weight: 500; color: #4a4f68; margin: 0 0 12mm; border: 0; }
  .cover p { color: #5a5f78; margin: 1mm 0; font-size: 10.5pt; }
  .cover .rule { width: 34mm; height: 3px; background: linear-gradient(90deg,#6d3ff0,#b45cf0); margin: 0 auto 10mm; border-radius: 2px; }

  section.chapter { page-break-before: always; }
  section.chapter:first-of-type { page-break-before: avoid; }

  h1 { font-size: 21pt; color: #14172a; margin: 0 0 4mm; padding-bottom: 2.5mm; border-bottom: 2px solid #6d3ff0; }
  h2 { font-size: 14pt; color: #241f4d; margin: 8mm 0 2.5mm; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #34305c; margin: 6mm 0 2mm; page-break-after: avoid; }
  p, li { orphans: 2; widows: 2; }
  a { color: #5b34d6; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #dcdcea; margin: 6mm 0; }

  img { max-width: 100%; height: auto; display: block; margin: 4mm auto; border: 1px solid #dfe0ec; border-radius: 6px; page-break-inside: avoid; }

  table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #dcdcea; padding: 1.6mm 2.4mm; text-align: left; vertical-align: top; }
  th { background: #f1f0fb; color: #2b2750; }
  tr:nth-child(even) td { background: #fafaff; }

  code { font-family: "Liberation Mono", "DejaVu Sans Mono", monospace; font-size: 9pt; background: #f2f2f9; padding: 0.3mm 1mm; border-radius: 3px; }
  pre { background: #f6f6fc; border: 1px solid #e3e3f0; border-radius: 6px; padding: 3mm; overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.6pt; line-height: 1.4; }

  blockquote { margin: 3mm 0; padding: 2mm 4mm; border-left: 3px solid #6d3ff0; background: #f5f3fe; border-radius: 0 6px 6px 0; }
  blockquote p { margin: 1mm 0; }

  pre.mermaid { background: #fbfbff; text-align: center; padding: 4mm 2mm; }
  pre.mermaid svg { max-width: 100%; height: auto; }
`;

writeFileSync(
  HTML,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Knowledge Vault — The Main Guide Book</title>
<style>${css}</style>
</head>
<body>
<div class="cover">
  <div class="mark">✦</div>
  <h1>Knowledge Vault</h1>
  <h2>The Main Guide Book</h2>
  <div class="rule"></div>
  <p>A complete, plain-language guide to using Knowledge Vault</p>
  <p>Chapters 1–18 · flow diagrams · plans, Knowledge Coins &amp; the Knowledge Base portal</p>
  <p>${new Date().toISOString().slice(0, 10)}</p>
</div>
${sections}
<script src="${pathToFileURL(MERMAID).href}"></script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: "neutral", flowchart: { useMaxWidth: true } });
  window.__mermaidDone = mermaid.run({ querySelector: "pre.mermaid" }).then(() => true).catch((e) => String(e));
</script>
</body>
</html>`,
);

// ── HTML -> PDF ───────────────────────────────────────────────────────────────────
// `npx playwright install chromium` once, or point CHROMIUM_PATH at an existing binary.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("  page error:", String(e).slice(0, 200)));
await page.goto(pathToFileURL(HTML).href, { waitUntil: "load" });
const rendered = await page.evaluate(() => window.__mermaidDone);
if (rendered !== true) throw new Error(`Mermaid failed: ${rendered}`);
console.log(`  ✓ ${await page.locator("pre.mermaid svg").count()} diagrams rendered`);
await page.waitForTimeout(1500);

await page.pdf({
  path: PDF,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font-size:8pt;color:#8b8fa6;font-family:sans-serif;padding:0 14mm;display:flex;justify-content:space-between;">' +
    "<span>Knowledge Vault — The Main Guide Book</span><span class='pageNumber'></span></div>",
  margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
});
await browser.close();

if (existsSync(HTML)) unlinkSync(HTML);
rmSync(PRINT_IMAGES, { recursive: true, force: true });
console.log(`  ✓ ${PDF}`);
