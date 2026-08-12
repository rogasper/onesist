import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";

const MdxEditorInner = lazy(() => import("./MdxEditorInner"));

interface MdxEditorClientProps {
  content: string;
  onChange: (value: string) => void;
  projectId: string;
}

const loadingFallback = (
  <div className="h-full flex items-center justify-center text-xs text-kumo-subtle">Loading editor…</div>
);

/**
 * MDXEditor parses markdown as MDX (JSX-aware). Raw `<`/`>` in document content —
 * e.g. SQL comparisons (`uc.layer < 7`), broken HTML from Word exports
 * (`""<a href=""mailto:...@..."" target=""_blank"">`) — are read as JSX tag
 * boundaries and the whole document fails to parse (editor renders empty).
 *
 * These functions escape such characters for the editor and decode them back
 * when the editor emits changes, so files round-trip byte-identical on save.
 */

/** Escapes `<`/`>` that are not inside code spans or fenced code blocks. */
export function escapeMdxContent(markdown: string): string {
  if (!markdown || !markdown.includes("<")) return markdown;
  const out: string[] = [];
  let i = 0;
  let inFence = false;
  let fenceMarker: string | null = null;
  let inCodeSpan = false;
  const n = markdown.length;
  while (i < n) {
    const ch = markdown[i];
    // fenced code blocks ``` or ~~~
    if (!inCodeSpan) {
      const fence = markdown.startsWith("```", i) ? "```" : markdown.startsWith("~~~", i) ? "~~~" : null;
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceMarker = fence;
        } else if (fenceMarker === fence) {
          // closing fence
          const rest = markdown.slice(i);
          if (/^\s*$/.test(rest) || /^```[^\n]*$/.test(rest)) {
            inFence = false;
            fenceMarker = null;
          }
        }
        out.push(ch);
        i += 1;
        continue;
      }
      if (inFence) {
        out.push(ch);
        i += 1;
        continue;
      }
      // inline code span `...` (only simple spans, no nesting)
      if (ch === "`") {
        const next = markdown.indexOf("`", i + 1);
        if (next !== -1) {
          inCodeSpan = true;
          out.push(ch);
          i += 1;
          continue;
        }
      }
    } else if (ch === "`") {
      inCodeSpan = false;
      out.push(ch);
      i += 1;
      continue;
    }
    if (!inFence && !inCodeSpan && (ch === "<" || ch === ">")) {
      out.push(ch === "<" ? "&lt;" : "&gt;");
    } else {
      out.push(ch);
    }
    i += 1;
  }
  return out.join("");
}

/**
 * Reverses {@link escapeMdxContent}: restores `<`/`>` emitted by the editor.
 *
 * MDXEditor serializes the `&lt;`/`&gt;` entities we feed it back as `\<`/`\>`
 * (or as the raw entity when written directly), so both forms must be decoded.
 * A genuine backslash-escape that the user wrote themselves (e.g. `\<` typed in
 * the editor to force a literal `<`) is semantically identical to `<` in the
 * document, so decoding it too keeps the file as-authored.
 */
export function unescapeMdxContent(markdown: string): string {
  if (!markdown) return markdown;
  return markdown
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\</g, "<")
    .replace(/\\>/g, ">");
}

export function MdxEditorClient({ content, onChange, projectId }: MdxEditorClientProps) {
  const [mounted, setMounted] = useState(false);
  const editorRef = useRef<MDXEditorMethods | null>(null);
  // Last escaped value pushed into the editor. Kept in escaped form because
  // MDXEditor serializes our &lt;/&gt; back as \<; comparing raw content here
  // would re-push identical text and lose the cursor/undo state.
  const lastPushed = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const safe = escapeMdxContent(content);
    if (safe === lastPushed.current) return;
    lastPushed.current = safe;
    editorRef.current?.setMarkdown(safe);
  }, [content]);

  if (!mounted) return loadingFallback;

  return (
    <Suspense fallback={loadingFallback}>
      <MdxEditorInner
        ref={editorRef}
        markdown={escapeMdxContent(content)}
        projectId={projectId}
        onChange={(v) => {
          // Remember the escaped baseline the editor now holds (its own
          // serialization of what we pushed), so a later identical content
          // doesn't re-push and clobber user edits.
          lastPushed.current = v;
          onChange(unescapeMdxContent(v));
        }}
        className="mdxeditor-full-height"
      />
    </Suspense>
  );
}
