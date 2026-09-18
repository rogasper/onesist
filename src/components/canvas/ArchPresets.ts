import type { ExcalidrawElementStub } from "./WireframePresets";

// Reuse helper from WireframePresets but duplicate to avoid circular
function randId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const base = (type: string, x: number, y: number, w: number, h: number): ExcalidrawElementStub => ({
  id: randId(),
  type,
  x,
  y,
  width: w,
  height: h,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: { type: 3 },
  seed: Math.floor(Math.random() * 100000),
  version: 1,
  versionNonce: Math.floor(Math.random() * 100000),
  isDeleted: false,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
});

const txt = (text: string, x: number, y: number, fontSize = 14, color = "#1e1e1e"): ExcalidrawElementStub => ({
  ...base("text", x, y, text.length * (fontSize * 0.6), fontSize * 1.3),
  text,
  originalText: text,
  fontSize,
  fontFamily: 1,
  textAlign: "left",
  verticalAlign: "top",
  strokeColor: color,
  roundness: null,
  lineHeight: 1.25,
});

export interface TechNodeOptions {
  label: string;
  sublabel?: string;
  bg?: string;
  stroke?: string;
}

/**
 * Create a tech-stack node: rectangle + label + sublabel.
 * Icon image element is added at runtime via enrich (needs fileId), so this stub only creates placeholder rect+texts.
 * For preset insertion without icon, caller can add image after addFiles.
 */
export function createTechNode(x: number, y: number, opts: TechNodeOptions): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 200;
  const h = 64;
  const box = {
    ...base("rectangle", x, y, w, h),
    backgroundColor: opts.bg || "#ffffff",
    strokeColor: opts.stroke || "#333333",
    roundness: { type: 3 },
    groupIds: [groupId],
  };
  const title = {
    ...txt(opts.label, x + 52, y + 12, 14, "#111827"),
    groupIds: [groupId],
    width: w - 64,
    height: 20,
  };
  const sub = opts.sublabel
    ? {
        ...txt(opts.sublabel, x + 52, y + 34, 11, "#6b7280"),
        groupIds: [groupId],
        width: w - 64,
        height: 14,
      }
    : null;
  // Icon placeholder is a small square that will be replaced by image element when icon is available
  const iconBox = {
    ...base("rectangle", x + 10, y + 12, 32, 32),
    backgroundColor: "#f3f4f6",
    strokeColor: "#e5e7eb",
    roundness: { type: 2 },
    groupIds: [groupId],
  };
  return sub ? [box, iconBox, title, sub] : [box, iconBox, title];
}

// Prebuilt tech nodes with semantic colors
export function createPostgresNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "PostgreSQL", sublabel: "Primary DB", bg: "#f0f9ff", stroke: "#0ea5e9" });
}
export function createRedisNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "Redis", sublabel: "Cache / Session", bg: "#fef2f2", stroke: "#dc2626" });
}
export function createBunNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "Bun Server", sublabel: "API + SSE + SSR", bg: "#fdf8f0", stroke: "#f59e0b" });
}
export function createReactNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "React 19", sublabel: "Web + TanStack Start", bg: "#eff6ff", stroke: "#2563eb" });
}
export function createTauriNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "Tauri 2", sublabel: "Desktop Shell", bg: "#f5f3ff", stroke: "#7c3aed" });
}
export function createKafkaNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "Kafka", sublabel: "Event Streaming", bg: "#faf5ff", stroke: "#7c3aed" });
}
export function createDockerNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "Docker", sublabel: "Container", bg: "#eff6ff", stroke: "#0ea5e9" });
}
export function createNginxNode(x: number, y: number): ExcalidrawElementStub[] {
  return createTechNode(x, y, { label: "Nginx / Traefik", sublabel: "Reverse Proxy", bg: "#f0fdf4", stroke: "#16a34a" });
}

// C4 / HLD containers
export function createC4SystemBox(x: number, y: number, title = "System", desc = "C4 Container System"): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 420;
  const h = 220;
  const box = {
    ...base("rectangle", x, y, w, h),
    backgroundColor: "#ffffff",
    strokeColor: "#1e293b",
    strokeWidth: 2,
    strokeStyle: "dashed" as const,
    roundness: { type: 3 },
    groupIds: [groupId],
  };
  const titleEl = { ...txt(title, x + 16, y + 14, 16, "#0f172a"), groupIds: [groupId] };
  const descEl = { ...txt(desc, x + 16, y + 38, 12, "#64748b"), groupIds: [groupId] };
  return [box, titleEl, descEl];
}

export function createVpcFrame(x: number, y: number, title = "VPC / Cloud Region"): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 560;
  const h = 320;
  const frame = {
    ...base("rectangle", x, y, w, h),
    backgroundColor: "#f8fafc",
    strokeColor: "#8C4FFF",
    strokeWidth: 2,
    strokeStyle: "dashed" as const,
    roundness: { type: 3 },
    groupIds: [groupId],
  };
  const titleEl = { ...txt(title, x + 16, y + 12, 13, "#8C4FFF"), groupIds: [groupId] };
  return [frame, titleEl];
}

export function createMicroserviceLane(x: number, y: number): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 720;
  const h = 180;
  const lane = {
    ...base("rectangle", x, y, w, h),
    backgroundColor: "#ffffff",
    strokeColor: "#e5e7eb",
    roundness: { type: 3 },
    groupIds: [groupId],
  };
  const header = {
    ...base("rectangle", x, y, w, 28),
    backgroundColor: "#f3f4f6",
    strokeColor: "#e5e7eb",
    roundness: { type: 3 },
    groupIds: [groupId],
  };
  const headerTxt = { ...txt("Microservices Layer", x + 12, y + 6, 12, "#374151"), groupIds: [groupId] };
  return [lane, header, headerTxt];
}

// ── Premium hand-drawn pipeline & architecture presets (from blog SVG technique) ──
function arrow(x1: number, y1: number, x2: number, y2: number, groupId: string): any {
  // Excalidraw arrow: type "arrow", with points [[0,0],[dx,dy]]
  return {
    ...base("arrow", x1, y1, Math.abs(x2 - x1) || 10, Math.abs(y2 - y1) || 10),
    groupIds: [groupId],
    strokeColor: "#64748b",
    strokeWidth: 2,
    points: [
      [0, 0],
      [x2 - x1, y2 - y1],
    ] as any,
    lastCommittedPoint: null as any,
    startBinding: null as any,
    endBinding: null as any,
    startArrowhead: null as any,
    endArrowhead: "arrow" as any,
  };
}

function dashedArrow(x1: number, y1: number, x2: number, y2: number, groupId: string): any {
  return { ...arrow(x1, y1, x2, y2, groupId), strokeStyle: "dashed" as const, strokeColor: "#94a3b8" } as any;
}

/**
 * Pipeline preset: FSD → Markdown → Discovery → ERD → Spec → Tasks → Docs → Dashboard
 * Compact 900×280 footprint, premium Kumo + Tailwind colors — extracted from blog pipeline-mermaid.svg.
 */
export function createPipelinePreset(x: number, y: number): ExcalidrawElementStub[] {
  const groupId = randId();
  const els: ExcalidrawElementStub[] = [];
  const title = { ...txt("PIPELINE — FSD → DELIVERY (Artifact-Driven)", x + 10, y + 8, 11, "#0f172a"), groupIds: [groupId] } as any;
  els.push(title);
  const steps = [
    { label: "FSD PDF/DOCX", sub: "input/fsd/", badge: "MARKITDOWN", bg: "#e0f2fe", stroke: "#0284c7" },
    { label: "Markdown +", sub: "Split FD1..FDn", badge: "AGENT CLI", bg: "#ffffff", stroke: "#0ea5e9" },
    { label: "Discovery", sub: "Q & Assumption", badge: "ALIGNED?", bg: "#ffffff", stroke: "#0ea5e9" },
    { label: "ERD (DBML)", sub: "output/erd/", badge: "VALIDATE_ERD", bg: "#e0f2fe", stroke: "#0284c7" },
    { label: "Spec API", sub: "+ openapi.yaml", badge: "VALIDATE_SPEC", bg: "#e0f2fe", stroke: "#0284c7" },
    { label: "Tasks +", sub: "Timeline", badge: "COMPARE", bg: "#ffffff", stroke: "#0ea5e9" },
  ];
  const startX = x + 10;
  const startY = y + 32;
  const boxW = 118;
  const boxH = 68;
  const gap = 14;
  const boxes: { x: number; y: number }[] = [];
  steps.forEach((s, i) => {
    const bx = startX + i * (boxW + gap);
    const by = startY;
    boxes.push({ x: bx, y: by });
    const outer = {
      ...base("rectangle", bx, by, boxW, boxH),
      backgroundColor: s.bg,
      strokeColor: s.stroke,
      roundness: { type: 3 },
      groupIds: [groupId],
    } as any;
    const label = { ...txt(s.label, bx + boxW / 2 - s.label.length * 3.2, by + 14, 11, "#0f172a"), groupIds: [groupId] } as any;
    label.textAlign = "center";
    const sub = { ...txt(s.sub, bx + boxW / 2 - s.sub.length * 2.8, by + 32, 9, "#475569"), groupIds: [groupId] } as any;
    sub.textAlign = "center";
    const badge = { ...txt(s.badge, bx + boxW / 2 - s.badge.length * 2.4, by + 52, 7, "#0369a1"), groupIds: [groupId] } as any;
    badge.textAlign = "center";
    els.push(outer, label, sub, badge);
    if (i > 0) {
      const prev = boxes[i - 1];
      els.push(arrow(prev.x + boxW, prev.y + boxH / 2, bx, by + boxH / 2, groupId) as any);
    }
  });
  // Bottom row: Docs + Dashboard + looping hint
  const docsX = startX + 2 * (boxW + gap);
  const docsY = startY + boxH + 36;
  const docsBox = {
    ...base("rectangle", docsX, docsY, boxW, boxH),
    backgroundColor: "#ffffff",
    strokeColor: "#0ea5e9",
    roundness: { type: 3 },
    groupIds: [groupId],
  } as any;
  const docsLabel = { ...txt("Technical Docs", docsX + 12, docsY + 14, 10, "#0f172a"), groupIds: [groupId] } as any;
  const docsSub = { ...txt("output/docs/", docsX + 20, docsY + 34, 9, "#475569"), groupIds: [groupId] } as any;
  const docsBadge = { ...txt("SRS / DOCX", docsX + 22, docsY + 52, 7, "#0369a1"), groupIds: [groupId] } as any;
  const dashW = 300;
  const dashX = docsX + boxW + gap;
  const dashBox = {
    ...base("rectangle", dashX, docsY, dashW, boxH),
    backgroundColor: "#f0f9ff",
    strokeColor: "#0ea5e9",
    roundness: { type: 3 },
    groupIds: [groupId],
  } as any;
  const dashLabel = { ...txt("Onesist Dashboard", dashX + 70, docsY + 14, 10, "#0f172a"), groupIds: [groupId] } as any;
  const dashSub = { ...txt("ERD · Spec · Tasks · RTM · Timeline", dashX + 26, docsY + 34, 8, "#475569"), groupIds: [groupId] } as any;
  const dashBadge = { ...txt("FILE WATCHER + SSE", dashX + 64, docsY + 52, 7, "#0369a1"), groupIds: [groupId] } as any;
  els.push(docsBox, docsLabel, docsSub, docsBadge, dashBox, dashLabel, dashSub, dashBadge);
  // Vertical connector from last top box down to bottom row + horizontal dashed feedback
  const lastTop = boxes[boxes.length - 1];
  els.push(arrow(lastTop.x + boxW / 2, lastTop.y + boxH, lastTop.x + boxW / 2, docsY - 14, groupId) as any);
  els.push(dashedArrow(dashX, docsY + boxH / 2, docsX + boxW / 2, docsY + boxH / 2, groupId) as any);
  els.push(arrow(docsX + boxW / 2, docsY + boxH / 2, docsX + boxW / 2, startY + boxH + 14, groupId) as any);
  const hint = { ...txt("↺ regenerate jika belum final", docsX + 2, startY + boxH + 18, 7, "#94a3b8"), groupIds: [groupId] } as any;
  els.push(hint);
  // Footer note
  const footer = { ...txt("File adalah kebenaran · UI hanya viewer", x + 180, docsY + boxH + 26, 8, "#64748b"), groupIds: [groupId] } as any;
  els.push(footer);
  // Outer frame
  const frame = {
    ...base("rectangle", x, y, 860, 240),
    backgroundColor: "#f8fafc",
    strokeColor: "#e2e8f0",
    roundness: { type: 3 },
    groupIds: [groupId],
  } as any;
  els.unshift(frame);
  return els;
}

/**
 * Sidecar architecture preset: Tauri Shell ↔ Bun Sidecar ↔ WebView + env bar
 * Extracted from blog arch-tauri-sidecar.svg (src-tauri/src/*.rs).
 */
export function createSidecarPreset(x: number, y: number): ExcalidrawElementStub[] {
  const groupId = randId();
  const els: ExcalidrawElementStub[] = [];
  const title = { ...txt("DESKTOP ARCHITECTURE — Tauri 2 + Bun Sidecar", x + 10, y + 8, 10, "#0f172a"), groupIds: [groupId] } as any;
  const sub = { ...txt("src-tauri/src/*.rs ↔ onesist-server (Bun) · http://127.0.0.1:{PORT}", x + 10, y + 24, 8, "#64748b"), groupIds: [groupId] } as any;
  els.push(title, sub);
  // Three columns
  const colY = y + 42;
  const tauriX = x + 10;
  const bunX = x + 290;
  const webX = x + 610;
  const colH = 170;
  const tauriBox = {
    ...base("rectangle", tauriX, colY, 250, colH),
    backgroundColor: "#fef3c7",
    strokeColor: "#d97706",
    roundness: { type: 3 },
    groupIds: [groupId],
  } as any;
  const bunBox = {
    ...base("rectangle", bunX, colY, 280, colH),
    backgroundColor: "#f0f9ff",
    strokeColor: "#0ea5e9",
    roundness: { type: 3 },
    groupIds: [groupId],
  } as any;
  const webBox = {
    ...base("rectangle", webX, colY, 200, colH),
    backgroundColor: "#ffffff",
    strokeColor: "#e2e8f0",
    roundness: { type: 3 },
    groupIds: [groupId],
  } as any;
  els.push(tauriBox, bunBox, webBox);
  const tauriTitle = { ...txt("Tauri Shell (Rust)", tauriX + 50, colY + 10, 10, "#0f172a"), groupIds: [groupId] } as any;
  const tauriSub = { ...txt("src-tauri/src/", tauriX + 70, colY + 26, 8, "#475569"), groupIds: [groupId] } as any;
  const bunTitle = { ...txt("onesist-server (Bun)", bunX + 62, colY + 10, 10, "#0f172a"), groupIds: [groupId] } as any;
  const bunSub = { ...txt("compiled binary · src/server.ts", bunX + 54, colY + 26, 8, "#475569"), groupIds: [groupId] } as any;
  const webTitle = { ...txt("WebView", webX + 62, colY + 10, 10, "#0f172a"), groupIds: [groupId] } as any;
  const webSub = { ...txt("WebKit / WebView2", webX + 42, colY + 26, 8, "#475569"), groupIds: [groupId] } as any;
  els.push(tauriTitle, tauriSub, bunTitle, bunSub, webTitle, webSub);
  // Inner rows
  const rows = [
    { text: "lib.rs · window · app menu", color: "#f59e0b" },
    { text: "sidecar.rs · spawn/kill · port 4321→", color: "#f59e0b" },
    { text: "tray.rs · close-to-tray", color: "#f59e0b" },
    { text: "quit_observer.rs · memory.rs", color: "#f59e0b" },
  ];
  rows.forEach((r, i) => {
    const ry = colY + 48 + i * 28;
    els.push({ ...base("rectangle", tauriX + 10, ry, 230, 22), backgroundColor: "#ffffff", strokeColor: r.color, roundness: { type: 2 }, groupIds: [groupId] } as any);
    els.push({ ...txt(r.text, tauriX + 16, ry + 5, 7, "#334155"), groupIds: [groupId] } as any);
  });
  const bunRows = [
    { text: "SSR · TanStack Router · /api/*", color: "#0ea5e9" },
    { text: "SQLite WAL + Drizzle · checkpointWal()", color: "#0ea5e9" },
    { text: "realtime: SSE + file-watcher.ts", color: "#0ea5e9" },
    { text: "services/agent-runner.ts · xterm WS", color: "#0ea5e9" },
  ];
  bunRows.forEach((r, i) => {
    const ry = colY + 48 + i * 28;
    els.push({ ...base("rectangle", bunX + 10, ry, 260, 22), backgroundColor: "#ffffff", strokeColor: r.color, roundness: { type: 2 }, groupIds: [groupId] } as any);
    els.push({ ...txt(r.text, bunX + 16, ry + 5, 7, "#334155"), groupIds: [groupId] } as any);
  });
  // WebView inner
  els.push({ ...base("rectangle", webX + 10, colY + 48, 180, 52), backgroundColor: "#f8fafc", strokeColor: "#e2e8f0", roundness: { type: 2 }, groupIds: [groupId] } as any);
  els.push({ ...txt("React 19 · Kumo + Tailwind", webX + 20, colY + 52, 7, "#334155"), groupIds: [groupId] } as any);
  els.push({ ...txt("MDXEditor · ReactFlow", webX + 36, colY + 64, 7, "#334155"), groupIds: [groupId] } as any);
  els.push({ ...txt("Mermaid · Excalidraw", webX + 36, colY + 76, 7, "#334155"), groupIds: [groupId] } as any);
  els.push({ ...txt("http://127.0.0.1:{PORT}", webX + 30, colY + 108, 7, "#0369a1"), groupIds: [groupId] } as any);
  els.push({ ...txt("No Electron · ~300MB idle", webX + 32, colY + 142, 7, "#64748b"), groupIds: [groupId] } as any);
  // Arrows between columns
  els.push(arrow(tauriX + 250, colY + 70, bunX, colY + 70, groupId) as any);
  els.push({ ...txt("spawn", tauriX + 258, colY + 58, 7, "#92400e"), groupIds: [groupId] } as any);
  els.push(dashedArrow(bunX, colY + 90, tauriX + 250, colY + 90, groupId) as any);
  els.push({ ...txt("watchdog", tauriX + 254, colY + 98, 7, "#64748b"), groupIds: [groupId] } as any);
  els.push(arrow(bunX + 280, colY + 70, webX, colY + 70, groupId) as any);
  els.push({ ...txt("http", bunX + 286, colY + 58, 7, "#0369a1"), groupIds: [groupId] } as any);
  els.push(dashedArrow(webX, colY + 90, bunX + 280, colY + 90, groupId) as any);
  els.push({ ...txt("SSE", bunX + 286, colY + 98, 7, "#64748b"), groupIds: [groupId] } as any);
  // Env bar
  const envY = colY + colH + 16;
  els.push({ ...base("rectangle", x + 10, envY, 840, 44), backgroundColor: "#ffffff", strokeColor: "#e2e8f0", roundness: { type: 3 }, groupIds: [groupId] } as any);
  els.push({
    ...txt("ENV: SA_DB_PATH · SA_CLIENT_DIR · SA_MIGRATIONS_DIR · SA_ROOT · SA_VENDOR_SKILLS_DIR · SA_DESKTOP=1", x + 22, envY + 8, 7, "#0f172a"),
    groupIds: [groupId],
  } as any);
  els.push({
    ...txt("Ports: HTTP 4321→ (IPv4+IPv6) · Terminal 4331→ · Watchdog: sidecar 3000MB · WebView 6000MB", x + 22, envY + 22, 6, "#64748b"),
    groupIds: [groupId],
  } as any);
  els.push({
    ...txt("Build: bun run build:server → Vite → post-build.mjs → src-tauri/binaries/onesist-server", x + 22, envY + 34, 6, "#94a3b8"),
    groupIds: [groupId],
  } as any);
  // Outer frame
  const frame = {
    ...base("rectangle", x, y, 860, 300),
    backgroundColor: "#f8fafc",
    strokeColor: "#e2e8f0",
    roundness: { type: 3 },
    groupIds: [groupId],
  } as any;
  els.unshift(frame);
  return els;
}
