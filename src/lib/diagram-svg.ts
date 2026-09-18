/**
 * Premium hand-drawn SVG generators for markdown-native diagrams.
 * Used by:
 *  - MarkdownViewer (```diagram-svg JSON``` or ```svg raw```) — live preview
 *  - docs DOCX export — rasterized to PNG via canvas
 *  - vendor skill `diagram-svg` — agent CLI can write .svg files
 *  - canvas presets (ArchPresets.ts) — Excalidraw insertion
 *
 * Keep this file free of React/DOM deps so it works in both browser and Bun.
 */

export type PipelineStep = {
  label: string;
  sub: string;
  badge?: string;
  bg?: string;
  stroke?: string;
};

export type PipelineOpts = {
  title?: string;
  steps?: PipelineStep[];
  footerNote?: string;
};

export type SidecarOpts = {
  title?: string;
  subtitle?: string;
};

const DEFAULT_PIPELINE_STEPS: PipelineStep[] = [
  { label: "FSD PDF/DOCX", sub: "input/fsd/", badge: "MARKITDOWN", bg: "#e0f2fe", stroke: "#0284c7" },
  { label: "Markdown +", sub: "Split FD1..FDn", badge: "AGENT CLI", bg: "#ffffff", stroke: "#0ea5e9" },
  { label: "Discovery", sub: "Q & Assumption", badge: "ALIGNED?", bg: "#ffffff", stroke: "#0ea5e9" },
  { label: "ERD (DBML)", sub: "output/erd/", badge: "VALIDATE_ERD", bg: "#e0f2fe", stroke: "#0284c7" },
  { label: "Spec API", sub: "+ openapi.yaml", badge: "VALIDATE_SPEC", bg: "#e0f2fe", stroke: "#0284c7" },
  { label: "Tasks +", sub: "Timeline", badge: "COMPARE", bg: "#ffffff", stroke: "#0ea5e9" },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Generate the pipeline SVG string — 900×320, same design as docs/blog/assets/pipeline-mermaid.svg */
export function generatePipelineSvg(opts: PipelineOpts = {}): string {
  const steps = opts.steps?.length ? opts.steps : DEFAULT_PIPELINE_STEPS;
  const title = esc(opts.title || "PIPELINE — FSD → DELIVERY (Artifact-Driven)");
  const sub = "input/fsd → output/erd · spec · task · docs";
  const footer = esc(opts.footerNote || "File adalah kebenaran · UI hanya viewer · Agent baca file langsung, bukan chat history");
  // Top row boxes
  const boxW = 118, boxH = 68, gap = 22, startX = 18, startY = 62;
  let boxes = "";
  steps.slice(0, 6).forEach((s, i) => {
    const bx = startX + i * (boxW + gap);
    const by = startY;
    const bg = esc(s.bg || "#ffffff");
    const stroke = esc(s.stroke || "#0ea5e9");
    const badge = esc(s.badge || "");
    // center text via x + width/2 and text-anchor middle
    boxes += `
  <g>
    <rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" rx="12" fill="${bg}" stroke="${stroke}" stroke-width="1.8"/>
    <text x="${bx + boxW / 2}" y="${by + 24}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="12.5" font-weight="600" fill="#0f172a">${esc(s.label)}</text>
    <text x="${bx + boxW / 2}" y="${by + 42}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10.5" fill="#475569">${esc(s.sub)}</text>
    ${badge ? `<text x="${bx + boxW / 2}" y="${by + 58}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="9" font-weight="700" fill="#0369a1">${badge}</text>` : ""}
  </g>`;
    if (i > 0) {
      const prevX = startX + (i - 1) * (boxW + gap) + boxW;
      const midY = by + boxH / 2;
      const curX = bx;
      boxes += `<line x1="${prevX}" y1="${midY}" x2="${curX}" y2="${midY}" stroke="#64748b" stroke-width="1.6" marker-end="url(#arrow)"/>`;
    }
  });

  const bottomY = 170;
  const docsX = startX + 2 * (boxW + gap);
  const dashX = docsX + boxW + gap;
  const dashW = 304;
  const lastTopX = startX + 5 * (boxW + gap) + boxW / 2;
  const lastTopY = startY + boxH;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="320" viewBox="0 0 900 320" role="img">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>
<rect x="0" y="0" width="900" height="320" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>
<text x="450" y="24" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="13" font-weight="800" fill="#0f172a">${title}</text>
<text x="450" y="40" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="11" fill="#64748b">${esc(sub)}</text>
${boxes}
<!-- Bottom row -->
<g><rect x="${docsX}" y="${bottomY}" width="${boxW}" height="${boxH}" rx="12" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.8"/><text x="${docsX + boxW / 2}" y="${bottomY + 24}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="12" font-weight="600" fill="#0f172a">Technical Docs</text><text x="${docsX + boxW / 2}" y="${bottomY + 42}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10" fill="#475569">output/docs/</text><text x="${docsX + boxW / 2}" y="${bottomY + 58}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="9" font-weight="700" fill="#0369a1">SRS / DOCX</text></g>
<g><rect x="${dashX}" y="${bottomY}" width="${dashW}" height="${boxH}" rx="12" fill="#f0f9ff" stroke="#0ea5e9" stroke-width="1.8"/><text x="${dashX + dashW / 2}" y="${bottomY + 24}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="12" font-weight="600" fill="#0f172a">Onesist Dashboard</text><text x="${dashX + dashW / 2}" y="${bottomY + 42}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10" fill="#475569">ERD · Spec · Tasks · RTM · Timeline</text><text x="${dashX + dashW / 2}" y="${bottomY + 58}" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="9" font-weight="700" fill="#0369a1">FILE WATCHER + SSE</text></g>
<line x1="${lastTopX}" y1="${lastTopY}" x2="${lastTopX}" y2="${bottomY - 14}" stroke="#64748b" stroke-width="1.6" marker-end="url(#arrow)"/>
<line x1="${dashX}" y1="${bottomY + boxH / 2}" x2="${docsX + boxW}" y2="${bottomY + boxH / 2}" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="7 4"/>
<line x1="${docsX + boxW / 2}" y1="${bottomY + boxH / 2}" x2="${docsX + boxW / 2}" y2="${startY + boxH + 14}" stroke="#64748b" stroke-width="1.6" marker-end="url(#arrow)"/>
<text x="${docsX + 6}" y="${startY + boxH + 28}" font-family="Inter, ui-sans-serif" font-size="9" fill="#94a3b8">↺ regenerate jika belum final</text>
<text x="450" y="268" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10" fill="#64748b">${footer}</text>
<text x="450" y="284" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="9.5" fill="#94a3b8">github.com/rogasper/onesist · docs/README.md · vendor/skills/fsd-analyzer</text>
</svg>`;
}

/** Generate the sidecar architecture SVG — 900×360, same as docs/blog/assets/arch-tauri-sidecar.svg */
export function generateSidecarSvg(opts: SidecarOpts = {}): string {
  const title = esc(opts.title || "DESKTOP ARCHITECTURE — Tauri 2 + Bun Sidecar");
  const sub = esc(opts.subtitle || "src-tauri/src/*.rs ↔ onesist-server (Bun) · http://127.0.0.1:{PORT}");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360" viewBox="0 0 900 360" role="img">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>
<rect x="0" y="0" width="900" height="360" rx="16" fill="#f8fafc" stroke="#e2e8f0"/>
<text x="450" y="26" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="13" font-weight="800" fill="#0f172a">${title}</text>
<text x="450" y="42" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="11" fill="#64748b">${sub}</text>
<g><rect x="18" y="62" width="260" height="210" rx="14" fill="#fef3c7" stroke="#d97706" stroke-width="1.8"/><text x="148" y="84" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="12" font-weight="700" fill="#0f172a">Tauri Shell (Rust)</text><text x="148" y="100" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10.2" fill="#475569">src-tauri/src/</text>
<rect x="32" y="112" width="232" height="34" rx="8" fill="#ffffff" stroke="#f59e0b" stroke-width="1.2"/><text x="148" y="132" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">lib.rs · window · app menu</text>
<rect x="32" y="152" width="232" height="34" rx="8" fill="#ffffff" stroke="#f59e0b" stroke-width="1.2"/><text x="148" y="172" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">sidecar.rs · spawn/kill · port 4321→</text>
<rect x="32" y="192" width="232" height="34" rx="8" fill="#ffffff" stroke="#f59e0b" stroke-width="1.2"/><text x="148" y="212" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">tray.rs · close-to-tray</text>
<rect x="32" y="232" width="232" height="28" rx="8" fill="#ffffff" stroke="#f59e0b" stroke-width="1.2"/><text x="148" y="250" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">quit_observer.rs · memory.rs</text></g>
<g><rect x="322" y="62" width="300" height="210" rx="14" fill="#f0f9ff" stroke="#0ea5e9" stroke-width="1.8"/><text x="472" y="84" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="12" font-weight="700" fill="#0f172a">onesist-server (Bun)</text><text x="472" y="100" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10.2" fill="#475569">compiled binary · src/server.ts</text>
<rect x="336" y="112" width="272" height="34" rx="8" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.2"/><text x="472" y="132" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">SSR · TanStack Router · /api/*</text>
<rect x="336" y="152" width="272" height="34" rx="8" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.2"/><text x="472" y="172" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">SQLite WAL + Drizzle · checkpointWal()</text>
<rect x="336" y="192" width="272" height="34" rx="8" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.2"/><text x="472" y="212" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">realtime: SSE + file-watcher.ts</text>
<rect x="336" y="232" width="272" height="28" rx="8" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.2"/><text x="472" y="250" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">services/agent-runner.ts · xterm WS</text></g>
<g><rect x="666" y="62" width="216" height="210" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.6"/><text x="774" y="84" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="12" font-weight="700" fill="#0f172a">WebView</text><text x="774" y="100" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10.2" fill="#475569">OS native (WebKit / WebView2)</text>
<rect x="680" y="118" width="188" height="64" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1.2"/><text x="774" y="138" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">React 19 · Kumo + Tailwind</text><text x="774" y="152" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">MDXEditor · ReactFlow</text><text x="774" y="166" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9.2" fill="#334155">Mermaid · Excalidraw</text>
<text x="774" y="200" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="8.8" font-weight="700" fill="#0369a1">http://127.0.0.1:{PORT}</text><text x="774" y="218" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10.2" fill="#475569">SSR + static assets</text><text x="774" y="248" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10.2" fill="#64748b">No Electron · ~300MB idle</text></g>
<line x1="278" y1="140" x2="322" y2="140" stroke="#64748b" stroke-width="1.6" marker-end="url(#arrow)"/><text x="300" y="134" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="8.5" font-weight="700" fill="#92400e">spawn</text>
<line x1="322" y1="160" x2="278" y2="160" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="7 4" marker-end="url(#arrow)"/><text x="300" y="174" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="8.5" fill="#64748b">watchdog</text>
<line x1="622" y1="140" x2="666" y2="140" stroke="#64748b" stroke-width="1.6" marker-end="url(#arrow)"/><text x="644" y="134" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="8.5" font-weight="700" fill="#0369a1">http</text>
<line x1="666" y1="170" x2="622" y2="170" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="7 4" marker-end="url(#arrow)"/><text x="644" y="184" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="8.5" fill="#64748b">SSE</text>
<g><rect x="18" y="286" width="864" height="56" rx="10" fill="#ffffff" stroke="#e2e8f0"/><text x="450" y="304" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="10" font-weight="700" fill="#0f172a">ENV: SA_DB_PATH · SA_CLIENT_DIR · SA_MIGRATIONS_DIR · SA_ROOT · SA_VENDOR_SKILLS_DIR · SA_DESKTOP=1</text><text x="450" y="320" text-anchor="middle" font-family="ui-monospace, Menlo" font-size="9" fill="#64748b">Ports: HTTP 4321→ (IPv4+IPv6) · Terminal 4331→ · Watchdog: sidecar 3000MB · WebView 6000MB</text><text x="450" y="334" text-anchor="middle" font-family="Inter, ui-sans-serif" font-size="8.8" fill="#94a3b8">Build: bun run build:server → Vite → post-build.mjs → src-tauri/binaries/onesist-server</text></g>
</svg>`;
}

export type DiagramSvgInput = {
  type: "pipeline" | "sidecar";
  title?: string;
  steps?: PipelineStep[];
  footerNote?: string;
  subtitle?: string;
};

/** Parse a ```diagram-svg JSON``` fence. Returns SVG string or null on error. */
export function renderDiagramSvg(code: string): { svg: string | null; error: string | null } {
  const trimmed = code.trim();
  // Raw SVG passthrough: if it starts with <svg, return as-is
  if (trimmed.startsWith("<svg")) {
    return { svg: trimmed, error: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as DiagramSvgInput;
    if (parsed.type === "pipeline") {
      return { svg: generatePipelineSvg({ title: parsed.title, steps: parsed.steps, footerNote: parsed.footerNote }), error: null };
    }
    if (parsed.type === "sidecar") {
      return { svg: generateSidecarSvg({ title: parsed.title, subtitle: parsed.subtitle }), error: null };
    }
    return { svg: null, error: `Unknown diagram type: ${esc((parsed as any).type || "undefined")}. Use "pipeline" or "sidecar".` };
  } catch (e) {
    return { svg: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Light client-side rasterizer: SVG string → PNG data URL via canvas (same pattern as mermaidImage). */
export async function svgToPngDataUrl(svg: string, scale = 2): Promise<string | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const vb = svg.match(/viewBox="\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/);
  let w = vb ? parseFloat(vb[3]) : 0;
  let h = vb ? parseFloat(vb[4]) : 0;
  if (!w || !h) {
    const mw = svg.match(/width="([\d.]+)/);
    const mh = svg.match(/height="([\d.]+)/);
    w = mw ? parseFloat(mw[1]) : 900;
    h = mh ? parseFloat(mh[1]) : 360;
  }
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
