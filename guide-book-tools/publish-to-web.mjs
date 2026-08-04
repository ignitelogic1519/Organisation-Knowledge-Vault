// Copies the customer guide book into the web app, where the Help page serves it.
//
//   cd guide-book-tools && node publish-to-web.mjs
//
// Two artefacts land in apps/web/public/guide/:
//   · the PDF, exactly as built;
//   · a single combined Markdown file, for readers who want the text rather than the print
//     layout — cross-chapter links are flattened to plain text (they lead nowhere in one
//     file) and image paths are rewritten to the repository, which is where they live.
//
// The Super Admin book is deliberately NOT published: it never ships with the product.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOKS } from "./books.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const OUT = join(REPO, "apps/web/public/guide");
const IMAGE_BASE =
  "https://raw.githubusercontent.com/ignitelogic1519/Organisation-Knowledge-Vault/main/Main%20Guide%20Book/images/";

const book = BOOKS.find((b) => b.id === "main");
const bookDir = join(REPO, book.dir);
mkdirSync(OUT, { recursive: true });

copyFileSync(join(bookDir, book.pdf), join(OUT, book.pdf));

const combined =
  book.files
    .map((f) =>
      readFileSync(join(bookDir, f), "utf8")
        .replace(/\[([^\]]+)\]\((?:chapter-[a-z0-9-]+\.md|README\.md|appendix[a-z0-9-]*\.md)\)/g, "$1")
        .replace(/images\//g, IMAGE_BASE)
        .trimEnd(),
    )
    .join("\n\n---\n\n") + "\n";
writeFileSync(join(OUT, book.pdf.replace(/\.pdf$/, ".md")), combined);

console.log(`  ✓ published ${book.pdf} and its Markdown to apps/web/public/guide/`);
