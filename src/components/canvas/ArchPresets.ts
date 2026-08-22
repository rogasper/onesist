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
