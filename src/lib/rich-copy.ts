/**
 * Copy what a viewer shows, not the markdown behind it (U5).
 *
 * Monday and Jira turn pasted HTML into their own formatting, so a copy that carries headings,
 * lists, tables, and links keeps its shape. Markdown syntax (`#`, `**`, `|`) pasted as text
 * shows up literally in those apps. Every copy also carries a plain-text version for targets
 * that read only text.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c] ?? c);
}

/** Elements that end a line of plain text. */
const BLOCK_END = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "pre", "blockquote", "div"]);

/**
 * Plain text from the HTML `renderToStaticMarkup` produced: block elements break lines, lists
 * get bullets or running numbers, table cells are separated by spaces, and entities are decoded.
 * No DOM is needed, which matters because the tests run in Bun.
 */
export function htmlToPlainText(html: string): string {
  const lines: string[] = [];
  let buf = "";
  const flush = () => {
    lines.push(buf);
    buf = "";
  };
  const lists: { kind: string; n: number }[] = [];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      buf += m[4].replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITIES[e] ?? e);
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "br") {
      flush();
    } else if (tag === "ul" || tag === "ol") {
      if (closing) lists.pop();
      else lists.push({ kind: tag, n: 0 });
      flush();
    } else if (tag === "li" && !closing) {
      flush();
      const list = lists[lists.length - 1];
      const indent = "  ".repeat(Math.max(0, lists.length - 1));
      if (list) {
        list.n += 1;
        buf += `${indent}${list.kind === "ol" ? `${list.n}. ` : "- "}`;
      }
    } else if ((tag === "td" || tag === "th") && !closing) {
      if (buf.trim()) buf += "  ";
    } else if (BLOCK_END.has(tag) && closing) {
      flush();
    } else if (BLOCK_END.has(tag) && !closing && buf.trim()) {
      flush();
    }
  }
  flush();
  return lines
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The markdown rendered the way the task viewer shows it, as HTML for the clipboard. */
const COPY_COMPONENTS: Components = {
  // A local or workspace path means nothing in Jira or Monday, so the picture becomes its name.
  img: ({ alt }) => createElement("em", null, `[Gambar: ${alt || "tanpa judul"}]`),
  table: ({ children }) => createElement("table", { border: 1, style: { borderCollapse: "collapse" } }, children),
  th: ({ children }) => createElement("th", { style: { padding: "4px 8px", textAlign: "left" } }, children),
  td: ({ children }) => createElement("td", { style: { padding: "4px 8px" } }, children),
};

export function markdownToHtml(markdown: string): string {
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], components: COPY_COMPONENTS }, markdown));
}

/**
 * Puts HTML and plain text on the clipboard together. Runs inside the button's click, which the
 * webviews require. A one-shot `copy` listener is the fallback where `ClipboardItem` is missing.
 */
export async function copyRich({ html, text }: { html: string; text: string }): Promise<void> {
  const ClipboardItemCtor = (globalThis as { ClipboardItem?: new (items: Record<string, Blob>) => unknown }).ClipboardItem;
  if (ClipboardItemCtor && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItemCtor({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }) as ClipboardItem,
      ]);
      return;
    } catch {
      /* fall through to the copy event */
    }
  }
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/html", html);
    e.clipboardData?.setData("text/plain", text);
    e.preventDefault();
  };
  document.addEventListener("copy", onCopy, { once: true });
  if (!document.execCommand("copy")) {
    document.removeEventListener("copy", onCopy);
    throw new Error("Clipboard tidak bisa diakses");
  }
}
