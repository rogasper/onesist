import { useMemo } from "react";
import { renderDiagramSvg } from "~/lib/diagram-svg";

// Renders:
//  - ```svg          → raw <svg>…</svg> passthrough (hand-written)
//  - ```diagram-svg  → JSON { type: "pipeline"|"sidecar", ... } → generated SVG
// Used by MarkdownViewer; also used standalone in Canvas preview.
export function DiagramSvgBlock({ code, lang }: { code: string; lang: string }) {
  const normalized = lang.toLowerCase();
  const result = useMemo(() => {
    const trimmed = code.trim();
    // Raw SVG: preserve exactly (allow style, no JSON parse)
    if (normalized === "svg" || trimmed.startsWith("<svg")) {
      // Basic safety: must contain <svg
      if (!trimmed.includes("<svg")) {
        return { svg: null as string | null, error: "SVG block must contain <svg>…</svg>" };
      }
      return { svg: trimmed, error: null as string | null };
    }
    // diagram-svg JSON → generator
    return renderDiagramSvg(trimmed);
  }, [code, normalized]);

  if (result.error) {
    return (
      <pre className="my-3 text-[11px] text-red-400 p-2 bg-kumo-elevated rounded border border-kumo-line whitespace-pre-wrap">
        diagram-svg error: {result.error}
        {"\n\n"}Expected JSON, e.g.{"\n"}
        {`{\n  "type": "pipeline",\n  "title": "My Pipeline",\n  "steps": [{ "label": "FSD", "sub": "input/fsd/" }]\n}`}
        {"\n"}or raw SVG in ```svg fence.
      </pre>
    );
  }
  if (!result.svg) return null;
  // SVG is trusted (generated or author-provided). Use innerHTML for crisp vector.
  return (
    <div
      className="my-3 flex justify-center overflow-auto rounded-lg border border-kumo-line bg-white p-2"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
