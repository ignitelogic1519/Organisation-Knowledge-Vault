import type { Answers, Block, Step } from "./nas-guide";
import { decisionsSoFar } from "./nas-guide";

/**
 * The guide as a PDF.
 *
 * It was a Markdown file, which was the wrong thing to hand somebody: half the people who
 * receive it open it in a text editor and read the asterisks, and nobody prints one. A PDF
 * opens the same way on every machine, prints, and can be emailed to an IT contractor
 * without a covering explanation of what a .md file is.
 *
 * It is written from the same steps the screen renders, with the reader's own answers
 * already substituted — so the document that arrives in somebody's inbox describes THEIR
 * NAS, THEIR folder and THEIR domain, not a generic one.
 *
 * jsPDF is loaded on demand rather than bundled: it is a few hundred kilobytes, and a
 * reader who never presses Download should never pay for it.
 */

/** jsPDF's built-in fonts are WinAnsi, so a few characters need a plain-text stand-in. */
function ascii(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, "—")
    .replace(/→/g, "->")
    .replace(/✓/g, "[ok]")
    .replace(/✗/g, "[x]")
    .replace(/…/g, "...")
    .replace(/`/g, "");
}

const PAGE = { width: 210, height: 297, margin: 18 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export async function downloadGuidePdf(steps: Step[], answers: Answers, webOrigin: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = PAGE.margin;
  let pageNumber = 1;

  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text("Knowledge Vault — storage setup", PAGE.margin, PAGE.height - 10);
    doc.text(String(pageNumber), PAGE.width - PAGE.margin, PAGE.height - 10, { align: "right" });
    doc.setTextColor(0);
  };

  /** Make room for `needed` millimetres, starting a page if this one is full. */
  const room = (needed: number) => {
    if (y + needed <= PAGE.height - PAGE.margin - 6) return;
    footer();
    doc.addPage();
    pageNumber += 1;
    y = PAGE.margin;
  };

  const write = (
    text: string,
    opts: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      font?: "helvetica" | "courier";
      colour?: [number, number, number];
      indent?: number;
      gap?: number;
      lineHeight?: number;
    } = {},
  ) => {
    const size = opts.size ?? 10;
    const lineHeight = opts.lineHeight ?? size * 0.42 + 1.1;
    const indent = opts.indent ?? 0;
    doc.setFont(opts.font ?? "helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(opts.colour ?? [30, 30, 34]));
    const lines = doc.splitTextToSize(ascii(text), CONTENT_WIDTH - indent) as string[];
    for (const line of lines) {
      room(lineHeight);
      doc.text(line, PAGE.margin + indent, y);
      y += lineHeight;
    }
    y += opts.gap ?? 1.5;
    doc.setTextColor(0);
  };

  /** A tinted panel behind a run of text — warnings, checks and notes. */
  const panel = (title: string, text: string, rgb: [number, number, number]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(ascii(text), CONTENT_WIDTH - 12) as string[];
    const height = lines.length * 4.3 + 9;
    room(height + 3);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(PAGE.margin, y - 3.5, CONTENT_WIDTH, height, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(70);
    doc.text(title.toUpperCase(), PAGE.margin + 4, y + 1.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(35);
    let ly = y + 6.5;
    for (const line of lines) {
      doc.text(line, PAGE.margin + 4, ly);
      ly += 4.3;
    }
    y += height + 3;
    doc.setTextColor(0);
  };

  const code = (label: string, text: string, note?: string) => {
    if (label) write(label, { size: 8.5, style: "bold", colour: [90, 90, 96], gap: 0.8 });
    doc.setFont("courier", "normal");
    doc.setFontSize(8.5);
    // Commands must not be re-wrapped in the middle of a flag, so they are split on
    // their own line breaks and only hard-wrapped if a single line is genuinely too long.
    const lines = ascii(text)
      .split("\n")
      .flatMap((line) => doc.splitTextToSize(line, CONTENT_WIDTH - 8) as string[]);
    const height = lines.length * 3.9 + 6;
    room(height + 2);
    doc.setFillColor(244, 245, 248);
    doc.roundedRect(PAGE.margin, y - 3, CONTENT_WIDTH, height, 1.5, 1.5, "F");
    doc.setTextColor(25, 28, 40);
    let ly = y + 1;
    for (const line of lines) {
      doc.text(line, PAGE.margin + 4, ly);
      ly += 3.9;
    }
    y += height;
    doc.setTextColor(0);
    if (note) write(note, { size: 8.5, style: "italic", colour: [110, 110, 118], gap: 2 });
    else y += 2;
  };

  const table = (head: string[], rows: string[][]) => {
    const colWidth = head.length === 2 ? [CONTENT_WIDTH * 0.32, CONTENT_WIDTH * 0.68] : head.map(() => CONTENT_WIDTH / head.length);
    doc.setFontSize(8.5);
    room(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(90);
    head.forEach((h, i) => {
      const x = PAGE.margin + colWidth.slice(0, i).reduce((s, w) => s + w, 0);
      doc.text(ascii(h), x, y);
    });
    // Clear of the rule, not sitting on it — a header touching its first row reads as a
    // row of its own.
    y += 5.5;
    doc.setDrawColor(215);
    doc.line(PAGE.margin, y - 3.4, PAGE.width - PAGE.margin, y - 3.4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(35);
    for (const row of rows) {
      const cells = row.map((cell, i) => doc.splitTextToSize(ascii(cell), colWidth[i] - 4) as string[]);
      const height = Math.max(...cells.map((c) => c.length)) * 4 + 2;
      room(height);
      cells.forEach((lines, i) => {
        const x = PAGE.margin + colWidth.slice(0, i).reduce((s, w) => s + w, 0);
        lines.forEach((line, n) => doc.text(line, x, y + n * 4));
      });
      y += height;
      doc.setDrawColor(235);
      doc.line(PAGE.margin, y - 1.6, PAGE.width - PAGE.margin, y - 1.6);
    }
    y += 2.5;
    doc.setTextColor(0);
  };

  // ── Cover ─────────────────────────────────────────────────────────────────
  doc.setFillColor(28, 31, 48);
  doc.rect(0, 0, PAGE.width, 62, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Connecting your storage", PAGE.margin, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("A step-by-step setup guide for Knowledge Vault", PAGE.margin, 39);
  doc.setFontSize(9);
  doc.setTextColor(185, 190, 210);
  doc.text(
    `Prepared ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`,
    PAGE.margin,
    50,
  );
  doc.setTextColor(0);
  y = 74;

  write(
    "This document was generated from the setup guide inside Knowledge Vault, with the choices already " +
      "made by whoever sent it to you. It is written to be followed by somebody who has never set up a " +
      "NAS before. If you have, the commands are all here and you can skip the explanations.",
    { size: 10.5, gap: 4 },
  );

  const decisions = decisionsSoFar(answers);
  if (decisions.length > 0) {
    write("The choices made so far", { size: 12, style: "bold", gap: 2 });
    table(["", ""], decisions.map((d) => [d.label, d.value]));
  }

  write("What you will need", { size: 12, style: "bold", gap: 2 });
  write(
    "Administrator access to the machine that will hold the documents, about an hour, and somewhere safe " +
      "to write down three passwords as you create them. Nothing here costs money unless you choose to buy " +
      "a domain name, which is around £10 a year.",
    { gap: 3 },
  );
  panel(
    "Read this first",
    "Once this is connected, that machine holds the only copy of your documents. Knowledge Vault keeps the " +
      "records — who may read what, who has completed what — but never the files themselves. Make sure it is " +
      "backed up somewhere else before you rely on it.",
    [255, 244, 225],
  );

  // ── Steps ─────────────────────────────────────────────────────────────────
  const shown = steps.filter((s) => !s.skipped);
  shown.forEach((step, index) => {
    room(28);
    y += 3;
    doc.setDrawColor(220);
    doc.line(PAGE.margin, y - 2, PAGE.width - PAGE.margin, y - 2);
    y += 4;
    write(`STEP ${index + 1} OF ${shown.length}  ·  ABOUT ${step.minutes} MINUTES`, {
      size: 8,
      style: "bold",
      colour: [130, 130, 140],
      gap: 1,
    });
    write(step.title, { size: 14, style: "bold", gap: 2.5 });

    for (const block of step.blocks) {
      renderBlock(block);
    }
  });

  const skipped = steps.filter((s) => s.skipped);
  if (skipped.length > 0) {
    room(20);
    y += 4;
    write("Steps you can skip", { size: 12, style: "bold", gap: 2 });
    for (const s of skipped) write(`${s.title} — ${s.skipped!.reason}`, { gap: 2 });
  }

  footer();
  doc.save("knowledge-vault-storage-setup.pdf");

  function renderBlock(block: Block) {
    switch (block.kind) {
      case "prose":
        write(block.text, { gap: 2 });
        break;
      case "steps":
        block.items.forEach((item, i) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          room(5);
          doc.setTextColor(200, 90, 60);
          doc.text(`${i + 1}.`, PAGE.margin, y);
          doc.setTextColor(0);
          write(item, { indent: 7, gap: 1 });
        });
        y += 1.5;
        break;
      case "command":
        code(block.label, block.code, block.note);
        break;
      case "note":
        panel("Note", block.text, [238, 242, 250]);
        break;
      case "warn":
        panel("Watch out", block.text, [255, 240, 225]);
        break;
      case "check":
        panel("You should see", block.text, [233, 247, 236]);
        break;
      case "link":
        if (block.text) write(block.text, { gap: 1 });
        write(`${block.label}: ${block.href}`, { size: 9, colour: [40, 90, 190], gap: 2.5 });
        break;
      case "table":
        table(block.head, block.rows);
        break;
      case "choice": {
        const chosen = block.options.find((o) => String(answers[block.field] ?? "") === o.value);
        write(block.question, { size: 10.5, style: "bold", gap: 1 });
        if (chosen) {
          write(`Chosen: ${chosen.label} — ${chosen.blurb}`, { gap: 1.5 });
          if (chosen.cons?.length) {
            write(`Worth knowing: ${chosen.cons.join("; ")}.`, { size: 9, style: "italic", colour: [110, 110, 118], gap: 2 });
          }
        } else {
          write(
            `Not decided yet. The options are: ${block.options.map((o) => `${o.label} (${o.blurb})`).join("; ")}.`,
            { size: 9.5, style: "italic", colour: [110, 110, 118], gap: 2 },
          );
        }
        break;
      }
      case "input": {
        const value = String(answers[block.field] ?? "").trim();
        write(
          value ? `${block.label}  →  ${value}` : `${block.label}  →  ______________________`,
          { size: 10, style: "bold", gap: 1 },
        );
        if (block.help) write(block.help, { size: 9, colour: [110, 110, 118], gap: 2 });
        break;
      }
    }
  }
}
