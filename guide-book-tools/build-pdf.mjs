// Rebuilds a guide book's single-file PDF from its Markdown chapters.
//
//   cd guide-book-tools
//   npm install                       # markdown-it, mermaid, sharp, playwright (one-off)
//   node build-pdf.mjs                # builds every book in books.mjs
//   node build-pdf.mjs main           # or just one, by id
//
// Pipeline: Markdown -> one HTML book (Mermaid diagrams rendered in a real browser,
// screenshots down-sampled to JPEG so the file stays a few MB) -> Chromium print-to-PDF.
//
// Both books share this script. What differs between them — folder, chapter order, title,
// cover text — lives in books.mjs, so adding a third book is a config entry, not a fork.
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import MarkdownIt from "markdown-it";
import sharp from "sharp";
import { chromium } from "playwright";
import { BOOKS } from "./books.mjs";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const MERMAID = require.resolve("mermaid/dist/mermaid.min.js");

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const books = wanted.length ? BOOKS.filter((b) => wanted.includes(b.id)) : BOOKS;
if (books.length === 0) {
  console.error(`No such book. Known ids: ${BOOKS.map((b) => b.id).join(", ")}`);
  process.exit(1);
}

const anchorOf = (file) => file.replace(/\.md$/, "").toLowerCase();

/** Down-sample a book's screenshots: 2×-density PNGs are perfect on GitHub, enormous in a PDF. */
async function prepareImages(bookDir, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const imagesDir = join(bookDir, "images");
  if (!existsSync(imagesDir)) return;
  for (const file of readdirSync(imagesDir).filter((f) => f.endsWith(".png"))) {
    await sharp(join(imagesDir, file))
      .resize({ width: 1600, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, chromaSubsampling: "4:4:4" })
      .toFile(join(outDir, file.replace(/\.png$/, ".jpg")));
  }
}

function makeRenderer() {
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
  return md;
}

const css = (t) => `
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
    background: linear-gradient(150deg, ${t.coverFrom} 0%, ${t.coverVia} 55%, ${t.coverTo} 100%);
    border-radius: 10px; padding: 0 18mm;
  }
  .cover .mark { font-size: 40pt; color: ${t.accent}; line-height: 1; }
  .cover h1 { font-size: 30pt; margin: 6mm 0 2mm; border: 0; padding: 0; color: #14172a; }
  .cover h2 { font-size: 14pt; font-weight: 500; color: #4a4f68; margin: 0 0 12mm; border: 0; }
  .cover p { color: #5a5f78; margin: 1mm 0; font-size: 10.5pt; }
  .cover .rule { width: 34mm; height: 3px; background: linear-gradient(90deg,${t.accent},${t.accent2}); margin: 0 auto 10mm; border-radius: 2px; }
  .cover .warn { margin: 10mm auto 0; max-width: 120mm; padding: 3mm 6mm; border: 1.5px solid #b3261e; border-radius: 6px; color: #8c1d18; font-weight: 700; background: #fdecea; }

  section.chapter { page-break-before: always; }
  section.chapter:first-of-type { page-break-before: avoid; }

  h1 { font-size: 21pt; color: #14172a; margin: 0 0 4mm; padding-bottom: 2.5mm; border-bottom: 2px solid ${t.accent}; }
  h2 { font-size: 14pt; color: #241f4d; margin: 8mm 0 2.5mm; page-break-after: avoid; }
  h3 { font-size: 11.5pt; color: #34305c; margin: 6mm 0 2mm; page-break-after: avoid; }
  p, li { orphans: 2; widows: 2; }
  a { color: ${t.accent}; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #dcdcea; margin: 6mm 0; }

  /* A screenshot never taller than the page it has to fit on: a portrait phone shot at
     full width would be 250mm tall, which pushes it to the next page and leaves the one
     before it half empty. Capping the height (and letting the width follow) keeps the
     text flowing around it. */
  img { max-width: 100%; max-height: 165mm; width: auto; height: auto; display: block; margin: 4mm auto; border: 1px solid #dfe0ec; border-radius: 6px; page-break-inside: avoid; }

  table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #dcdcea; padding: 1.6mm 2.4mm; text-align: left; vertical-align: top; }
  th { background: ${t.tableHead}; color: #2b2750; }
  tr:nth-child(even) td { background: #fafaff; }

  code { font-family: "Liberation Mono", "DejaVu Sans Mono", monospace; font-size: 9pt; background: #f2f2f9; padding: 0.3mm 1mm; border-radius: 3px; }
  pre { background: #f6f6fc; border: 1px solid #e3e3f0; border-radius: 6px; padding: 3mm; overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.6pt; line-height: 1.4; }

  blockquote { margin: 3mm 0; padding: 2mm 4mm; border-left: 3px solid ${t.accent}; background: ${t.quote}; border-radius: 0 6px 6px 0; }
  blockquote p { margin: 1mm 0; }

  pre.mermaid { background: #fbfbff; text-align: center; padding: 4mm 2mm; }
  pre.mermaid svg { max-width: 100%; height: auto; }
`;

async function buildBook(book) {
  const bookDir = join(REPO, book.dir);
  const htmlPath = join(bookDir, "book.html");
  const pdfPath = join(bookDir, book.pdf);
  const printImages = join(tmpdir(), `kv-print-${book.id}`);

  console.log(`\n▸ ${book.subtitle}`);
  await prepareImages(bookDir, printImages);

  const md = makeRenderer();
  const sections = book.files
    .map((file) => {
      const body = md
        .render(readFileSync(join(bookDir, file), "utf8"))
        .replace(
          /src="images\/([^"]+)\.png"/g,
          (_, name) => `src="${pathToFileURL(join(printImages, `${name}.jpg`)).href}"`,
        );
      return `<section class="chapter" id="${anchorOf(file)}">\n${body}\n</section>`;
    })
    .join("\n");

  writeFileSync(
    htmlPath,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Knowledge Vault — ${book.subtitle}</title>
<style>${css(book.theme)}</style>
</head>
<body>
<div class="cover">
  <div class="mark">✦</div>
  <h1>Knowledge Vault</h1>
  <h2>${book.subtitle}</h2>
  <div class="rule"></div>
  ${book.coverLines.map((l) => `<p>${l}</p>`).join("\n  ")}
  <p>${new Date().toISOString().slice(0, 10)}</p>
  ${book.coverWarning ? `<div class="warn">${book.coverWarning}</div>` : ""}
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

  // `npx playwright install chromium` once, or point CHROMIUM_PATH at an existing binary.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("  page error:", String(e).slice(0, 200)));
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  const rendered = await page.evaluate(() => window.__mermaidDone);
  if (rendered !== true) throw new Error(`Mermaid failed: ${rendered}`);
  console.log(`  ✓ ${await page.locator("pre.mermaid svg").count()} diagrams rendered`);
  await page.waitForTimeout(1500);

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#8b8fa6;font-family:sans-serif;padding:0 14mm;display:flex;justify-content:space-between;">' +
      `<span>${book.footer}</span><span class='pageNumber'></span></div>`,
    margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  });
  await browser.close();

  if (existsSync(htmlPath)) unlinkSync(htmlPath);
  rmSync(printImages, { recursive: true, force: true });
  console.log(`  ✓ ${pdfPath}`);
}

for (const book of books) await buildBook(book);
