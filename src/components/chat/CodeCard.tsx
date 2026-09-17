import { useState } from "react";
import { ArrowSquareOut, Check, Copy } from "@phosphor-icons/react";

/**
 * Code block card (ADR-001 D8).
 *
 * The design reference shows SQL blocks as a card with header + action
 * icons, not a bare monospace block. The Onesist equivalent is ` ```dbml `,
 * ` ```json `, and ` ```yaml ` — artifact output the agent writes, and
 * precisely the blocks users most often want to open in the right tab.
 */

/** Languages with a destination tab, so the card can offer "open in". */
const ROUTE_FOR_LANG: Record<string, { path: string; label: string }> = {
  dbml: { path: "erd", label: "ERD" },
  json: { path: "spec", label: "API Spec" },
  yaml: { path: "spec", label: "API Spec" },
  sql: { path: "erd", label: "ERD" },
};

export interface CodeCardProps {
  lang: string;
  code: string;
  projectId?: string;
}

/** Languages that are always card-worthy, because their content is an
 *  artifact: ` ```dbml `, ` ```json `, and ` ```yaml ` are output the
 *  agent writes to the workspace. */
const CARD_LANGS = new Set(["dbml", "json", "yaml", "yml", "sql", "csv", "http"]);

/**
 * Is this block card-worthy?
 *
 * Models often write one-to-two-line blocks with no language (` ``` ` then
 * a single path). Giving such fragments a framed card + header fills the
 * answer with boxes and makes it harder to read — so short languageless
 * blocks stay plain code.
 */
export function isCardWorthyCode(lang: string, code: string): boolean {
  const language = (lang ?? "").toLowerCase();
  if (CARD_LANGS.has(language)) return true;
  const lines = code ? code.replace(/\n$/, "").split("\n").length : 0;
  return lines >= 4;
}

export function CodeCard({ lang, code, projectId }: CodeCardProps) {
  const [copied, setCopied] = useState(false);
  const target = ROUTE_FOR_LANG[lang];
  const lines = code ? code.replace(/\n$/, "").split("\n") : [];
  const shown = lines.slice(0, 24);
  const more = lines.length - shown.length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard access may be denied; stay silent, it is not a meaningful failure */
    }
  }

  return (
    <div className="my-2 rounded-xl ring ring-kumo-line overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-kumo-elevated border-b border-kumo-line">
        <span className="text-[11px] font-mono uppercase tracking-wide text-kumo-subtle">{lang || "kode"}</span>
        <span className="text-[11px] text-kumo-subtle">
          {lines.length} baris
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={copy}
            title="Salin"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Tersalin" : "Salin"}
          </button>
          {target && projectId ? (
            <a
              href={`/projects/${projectId}/${target.path}`}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-kumo-brand hover:bg-kumo-tint"
            >
              <ArrowSquareOut size={12} />
              Buka di {target.label}
            </a>
          ) : null}
        </span>
      </div>
      <pre className="px-3 py-2 overflow-x-auto text-[0.8125rem] font-mono text-kumo-default leading-relaxed m-0">
        {shown.join("\n")}
        {more > 0 ? `\n… (${more} baris lagi; salin untuk melihat seluruhnya)` : ""}
      </pre>
    </div>
  );
}

// Marked so the wrapping `pre` in MarkdownViewer does not wrap this card
// in a second `<pre>`.
(CodeCard as unknown as { displayName: string }).displayName = "BareCodeBlock";
