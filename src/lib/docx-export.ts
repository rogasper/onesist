import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  TabStopType,
  Header,
  Footer,
} from "docx";
import type { DocMeta } from "~/shared/types";

export interface DocxExportInput {
  contentMd: string;
  /** PNG data URLs (data:image/png;base64,...) keyed by the mermaid marker index. */
  diagramPngs: string[];
  meta: DocMeta;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "mermaid"; code?: string; index?: number };

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];
type Heading = (typeof HeadingLevel)[keyof typeof HeadingLevel];

function splitSections(contentMd: string): string[] {
  return contentMd
    .split(/\r?\n[ \t]*<!--[ \t]*pagebreak[ \t]*-->/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseBlocks(part: string): Block[] {
  const lines = part.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    const text = buf.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    buf.length = 0;
  };

  let paraBuf: string[] = [];
  while (i < lines.length) {
    const line = lines[i];

    // mermaid marker inserted by the frontend renderer
    const marker = line.match(/^\s*<!--\s*MERMAID:(\d+)\s*-->\s*$/i);
    if (marker) {
      flushParagraph(paraBuf);
      blocks.push({ type: "mermaid", index: Number(marker[1]) });
      i++;
      continue;
    }

    // code fence (mermaid or plain)
    if (/^```/.test(line.trim())) {
      flushParagraph(paraBuf);
      const lang = line.trim().slice(3).trim().toLowerCase();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      if (lang === "mermaid") {
        blocks.push({ type: "mermaid", code: code.join("\n") });
      } else if (code.join("\n").trim()) {
        blocks.push({ type: "paragraph", text: code.join("\n") });
      }
      continue;
    }

    // table
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph(paraBuf);
      const rows: string[][] = [];
      let started = false;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        const isSeparator = cells.every((c) => /^:?-{2,}:?$/.test(c));
        if (!isSeparator) {
          const isEmpty = cells.every((c) => c === "");
          if (isEmpty && !started) {
            // Skip empty leading rows (e.g. the "|  |  |" opener some renderers emit).
            i++;
            continue;
          }
          if (!isEmpty) started = true;
          rows.push(cells);
        }
        i++;
      }
      if (rows.length) blocks.push({ type: "table", rows });
      continue;
    }

    // headings
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(paraBuf);
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    // lists
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph(paraBuf);
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/);
        if (!m) break;
        items.push(m[1].trim());
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // blank line → flush paragraph buffer
    if (line.trim() === "") {
      flushParagraph(paraBuf);
      i++;
      continue;
    }

    paraBuf.push(line.trim());
    i++;
  }
  flushParagraph(paraBuf);
  return blocks;
}

/** Split inline markdown into styled TextRuns (**bold**, *italic*, `code`, [text](url)). */
function parseInline(
  text: string,
  opts: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {},
): TextRun[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  const runs: TextRun[] = [];
  for (const tok of tokens) {
    if (!tok) continue;
    let runText = tok;
    let bold = false;
    let italic = false;
    let mono = false;
    if (tok.startsWith("**") && tok.endsWith("**") && tok.length > 4) {
      runText = tok.slice(2, -2);
      bold = true;
    } else if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2) {
      runText = tok.slice(1, -1);
      italic = true;
    } else if (tok.startsWith("`") && tok.endsWith("`") && tok.length > 2) {
      runText = tok.slice(1, -1);
      mono = true;
    } else if (tok.startsWith("[") && tok.endsWith(")")) {
      runText = tok.slice(1, tok.indexOf("]"));
    }
    runs.push(
      new TextRun({
        text: runText,
        bold: opts.bold !== undefined ? opts.bold : bold,
        italics: opts.italic !== undefined ? opts.italic : italic,
        font: mono ? "Consolas" : undefined,
        size: opts.size,
        color: mono ? "6B7280" : opts.color,
      }),
    );
  }
  return runs;
}

function bodyParagraph(
  text: string,
  opts: { alignment?: Align; size?: number; spacingBefore?: number; spacingAfter?: number } = {},
): Paragraph {
  return new Paragraph({
    alignment: opts.alignment,
    spacing: {
      before: opts.spacingBefore ?? 0,
      after: opts.spacingAfter ?? 120,
    },
    children: parseInline(text, opts.size ? { size: opts.size } : {}),
  });
}

const BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "B7B7B7",
};
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// A4 content width (page 11906 − left/right margins 1080×2) in twips.
const CONTENT_WIDTH = 9746;

function buildTable(rows: string[][], { headerShading = "EEF1F4", firstRowBold = true } = {}): Table {
  const colCount = Math.max(...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, ri) => {
      const cells = Array.from({ length: colCount }, (_, ci) => row[ci] ?? "");
      return new TableRow({
        tableHeader: ri === 0,
        children: cells.map(
          (cell) =>
            new TableCell({
              width: { size: 100 / colCount, type: WidthType.PERCENTAGE },
              borders: CELL_BORDERS,
              shading: ri === 0 && headerShading ? { fill: headerShading } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: firstRowBold && ri === 0
                    ? parseInline(cell, { bold: true })
                    : parseInline(cell),
                }),
              ],
            }),
        ),
      });
    }),
  });
}

function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function dataUrlToPng(dataUrl: string): Buffer | null {
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  try {
    return Buffer.from(m[1].replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
}

function mermaidImage(diagramPngs: string[], index?: number, code?: string): Paragraph | null {
  if (index !== undefined && diagramPngs[index]) {
    const buf = dataUrlToPng(diagramPngs[index]);
    if (buf) {
      const size = pngSize(buf);
      // Fit to page width first, then only shrink if the diagram is taller than
      // a single page. min(scaleW, scaleH) would over-shrink tall top-down
      // flowcharts (height binds → width collapses to a tiny strip).
      const maxW = 650; // ≈ A4 content width @96dpi (6.7")
      const maxH = 900; // ≈ A4 content height
      let w = size?.w ?? 600;
      let h = size?.h ?? 400;
      let scale = Math.min(1, maxW / w);
      if (h * scale > maxH) scale = maxH / h;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        children: [
          new ImageRun({
            type: "png",
            data: buf,
            transformation: { width: w, height: h },
          }),
        ],
      });
    }
  }
  // Fallback: keep the diagram as monospace code so content is never lost.
  const text = code?.trim();
  if (text) {
    return new Paragraph({
      children: text.split("\n").map((line) => new TextRun({ text: line, font: "Consolas", size: 18, break: 1 })),
      spacing: { before: 120, after: 120 },
    });
  }
  return new Paragraph({ children: [new TextRun({ text: "[diagram]", italics: true, color: "9CA3AF" })] });
}

function buildHeader(meta: DocMeta): Header {
  // Title line — plain paragraph (no table): left title, CONFIDENTIAL pushed to
  // the right edge via a right tab stop. Bold, normal size.
  const titleLine = new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: `Technical Documentation - ${meta.projectName || ""}`,
        font: "Arial",
        bold: true,
        size: 20,
        color: "1F2937",
      }),
      new TextRun({
        text: "\tCONFIDENTIAL - INTERNAL USE ONLY",
        font: "Arial",
        bold: true,
        size: 20,
        color: "C00000",
      }),
    ],
  });

  // Label/value table below the title — natural width (not forced full).
  const rows = [
    ["Customer Name", meta.customerName || ""],
    ["Project Name", meta.projectName || ""],
    ["Project ID", meta.projectId || ""],
  ];
  const infoTable = new Table({
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: CELL_BORDERS,
            shading: { fill: "F3F4F6" },
            margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: label,
                    font: "Arial",
                    bold: true,
                    size: 18,
                    color: "374151",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders: CELL_BORDERS,
            margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: value,
                    font: "Arial",
                    size: 18,
                    color: "374151",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ),
  });

  return new Header({
    children: [titleLine, infoTable],
  });
}

function buildFooter(meta: DocMeta): Footer {
  const rows = [
    ["Software Requirement Specification", meta.projectName || ""],
    ["Author", meta.author || ""],
  ];
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: CELL_BORDERS,
            shading: { fill: "F3F4F6" },
            margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: label, font: "Arial", bold: true, size: 18, color: "374151" }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: CELL_BORDERS,
            margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: value, font: "Arial", size: 18, color: "374151" }),
                ],
              }),
            ],
          }),
        ],
      }),
    ),
  });
  return new Footer({ children: [table] });
}

function renderSectionBlocks(blocks: Block[], diagramPngs: string[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const lvl = Math.min(Math.max(block.level, 1), 5);
        const size = [0, 44, 36, 30, 26, 22][lvl];
        const heading = [
          HeadingLevel.HEADING_1,
          HeadingLevel.HEADING_2,
          HeadingLevel.HEADING_3,
          HeadingLevel.HEADING_4,
          HeadingLevel.HEADING_5,
        ][lvl - 1] as Heading;
        out.push(
          new Paragraph({
            heading,
            spacing: { before: lvl <= 2 ? 320 : 200, after: 160 },
            children: [new TextRun({ text: block.text, bold: true, size })],
          }),
        );
        break;
      }
      case "paragraph":
        out.push(bodyParagraph(block.text));
        break;
      case "table":
        out.push(buildTable(block.rows));
        break;
      case "list":
        block.items.forEach((item, idx) => {
          out.push(
            new Paragraph({
              bullet: !block.ordered ? { level: 0 } : undefined,
              indent: { left: 360 },
              spacing: { after: 60 },
              children: block.ordered
                ? parseInline(`${idx + 1}. ${item}`)
                : parseInline(item),
            }),
          );
        });
        break;
      case "mermaid": {
        const p = mermaidImage(diagramPngs, block.index, block.code);
        if (p) out.push(p);
        break;
      }
    }
  }
  return out;
}

export async function buildDocx(input: DocxExportInput): Promise<Buffer> {
  const { contentMd, diagramPngs, meta } = input;
  const sections = splitSections(contentMd);

  const header = buildHeader(meta);
  const footer = buildFooter(meta);

  const children: (Paragraph | Table)[] = [];

  sections.forEach((part, idx) => {
    if (idx > 0) children.push(new Paragraph({ children: [new PageBreak()] }));

    const blocks = parseBlocks(part);

    if (idx === 0) {
      // Cover page — centered, larger type. First paragraph = document title.
      blocks.forEach((b, bi) => {
        if (b.type === "heading") {
          const size = b.level === 1 ? 44 : 28;
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 240, after: 160 },
              children: [new TextRun({ text: b.text, bold: true, size })],
            }),
          );
        } else if (b.type === "paragraph") {
          const isTitle = bi === 0;
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: isTitle ? 1600 : 80, after: isTitle ? 120 : 160 },
              children: parseInline(b.text, {
                size: isTitle ? 56 : 26,
                bold: isTitle,
                color: isTitle ? "1F2937" : "374151",
              }),
            }),
          );
        }
      });
    } else {
      children.push(...renderSectionBlocks(blocks, diagramPngs));
    }
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 20 },
        },
      },
    },
    numbering: {
      config: [{ reference: "doc-list", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT }] }],
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT, width: 11906, height: 16838 },
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
