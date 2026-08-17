export interface ExcalidrawElementStub {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid";
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: number;
  opacity?: number;
  groupIds?: string[];
  frameId?: string | null;
  roundness?: { type: number } | null;
  seed?: number;
  version?: number;
  versionNonce?: number;
  isDeleted?: boolean;
  boundElements?: any[] | null;
  updated?: number;
  link?: string | null;
  locked?: boolean;
  customData?: any;
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  baseline?: number;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
}

function randId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const baseElement = (type: string, x: number, y: number, w: number, h: number): ExcalidrawElementStub => ({
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

const textElement = (text: string, x: number, y: number, fontSize = 16, color = "#1e1e1e"): ExcalidrawElementStub => ({
  ...baseElement("text", x, y, text.length * (fontSize * 0.6), fontSize * 1.3),
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

export function createStickyNote(x: number, y: number, text = "Notes / Annotation", color = "#ffc9c9"): ExcalidrawElementStub[] {
  const groupId = randId();
  const box = {
    ...baseElement("rectangle", x, y, 200, 140),
    backgroundColor: color,
    strokeColor: "#d97706",
    fillStyle: "solid" as const,
    roundness: { type: 2 },
    groupIds: [groupId],
  };
  const txt = {
    ...textElement(text, x + 16, y + 16, 16, "#1e1e1e"),
    groupIds: [groupId],
    width: 168,
    height: 100,
  };
  return [box, txt];
}

export function createBrowserFrame(x: number, y: number, title = "Web Application"): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 720;
  const h = 480;

  // Window border
  const frame = {
    ...baseElement("rectangle", x, y, w, h),
    backgroundColor: "#ffffff",
    strokeColor: "#333333",
    roundness: { type: 3 },
    groupIds: [groupId],
  };

  // Header bar
  const header = {
    ...baseElement("rectangle", x, y, w, 40),
    backgroundColor: "#f3f4f6",
    strokeColor: "#333333",
    roundness: { type: 3 },
    groupIds: [groupId],
  };

  // 3 Window control dots
  const dot1 = {
    ...baseElement("ellipse", x + 14, y + 14, 12, 12),
    backgroundColor: "#ef4444",
    strokeColor: "#dc2626",
    groupIds: [groupId],
  };
  const dot2 = {
    ...baseElement("ellipse", x + 34, y + 14, 12, 12),
    backgroundColor: "#f59e0b",
    strokeColor: "#d97706",
    groupIds: [groupId],
  };
  const dot3 = {
    ...baseElement("ellipse", x + 54, y + 14, 12, 12),
    backgroundColor: "#10b981",
    strokeColor: "#059669",
    groupIds: [groupId],
  };

  // Address Bar
  const addressBar = {
    ...baseElement("rectangle", x + 80, y + 8, w - 100, 24),
    backgroundColor: "#ffffff",
    strokeColor: "#d1d5db",
    roundness: { type: 2 },
    groupIds: [groupId],
  };

  const addressText = {
    ...textElement(`https://app.onesist.internal/ - ${title}`, x + 92, y + 12, 12, "#6b7280"),
    groupIds: [groupId],
  };

  return [frame, header, dot1, dot2, dot3, addressBar, addressText];
}

export function createMobileFrame(x: number, y: number, title = "Mobile App"): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 320;
  const h = 640;

  // Phone body
  const body = {
    ...baseElement("rectangle", x, y, w, h),
    backgroundColor: "#ffffff",
    strokeColor: "#1e1e1e",
    strokeWidth: 3,
    roundness: { type: 3 },
    groupIds: [groupId],
  };

  // Dynamic Island / Notch
  const notch = {
    ...baseElement("rectangle", x + 110, y + 12, 100, 24),
    backgroundColor: "#1e1e1e",
    strokeColor: "#1e1e1e",
    roundness: { type: 3 },
    groupIds: [groupId],
  };

  // Screen Title
  const headerTxt = {
    ...textElement(title, x + 20, y + 55, 18, "#111827"),
    groupIds: [groupId],
  };

  // Bottom home bar
  const homeBar = {
    ...baseElement("rectangle", x + 100, y + h - 16, 120, 6),
    backgroundColor: "#9ca3af",
    strokeColor: "#9ca3af",
    roundness: { type: 3 },
    groupIds: [groupId],
  };

  return [body, notch, headerTxt, homeBar];
}

export function createFormPreset(x: number, y: number): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 360;
  const h = 320;

  const card = {
    ...baseElement("rectangle", x, y, w, h),
    backgroundColor: "#ffffff",
    strokeColor: "#e5e7eb",
    roundness: { type: 3 },
    groupIds: [groupId],
  };

  const title = {
    ...textElement("User Registration", x + 24, y + 20, 18, "#111827"),
    groupIds: [groupId],
  };

  // Field 1
  const label1 = {
    ...textElement("Email Address", x + 24, y + 60, 13, "#4b5563"),
    groupIds: [groupId],
  };
  const input1 = {
    ...baseElement("rectangle", x + 24, y + 82, w - 48, 38),
    backgroundColor: "#f9fafb",
    strokeColor: "#d1d5db",
    roundness: { type: 2 },
    groupIds: [groupId],
  };
  const placeholder1 = {
    ...textElement("name@example.com", x + 36, y + 92, 14, "#9ca3af"),
    groupIds: [groupId],
  };

  // Field 2
  const label2 = {
    ...textElement("Password", x + 24, y + 135, 13, "#4b5563"),
    groupIds: [groupId],
  };
  const input2 = {
    ...baseElement("rectangle", x + 24, y + 157, w - 48, 38),
    backgroundColor: "#f9fafb",
    strokeColor: "#d1d5db",
    roundness: { type: 2 },
    groupIds: [groupId],
  };
  const placeholder2 = {
    ...textElement("••••••••••••", x + 36, y + 167, 14, "#9ca3af"),
    groupIds: [groupId],
  };

  // Submit Button
  const btn = {
    ...baseElement("rectangle", x + 24, y + 225, w - 48, 42),
    backgroundColor: "#2563eb",
    strokeColor: "#1d4ed8",
    roundness: { type: 2 },
    groupIds: [groupId],
  };
  const btnText = {
    ...textElement("Create Account", x + 115, y + 236, 15, "#ffffff"),
    groupIds: [groupId],
  };

  return [card, title, label1, input1, placeholder1, label2, input2, placeholder2, btn, btnText];
}

export function createModalPreset(x: number, y: number): ExcalidrawElementStub[] {
  const groupId = randId();
  const w = 420;
  const h = 240;

  const modalBox = {
    ...baseElement("rectangle", x, y, w, h),
    backgroundColor: "#ffffff",
    strokeColor: "#374151",
    roundness: { type: 3 },
    groupIds: [groupId],
  };

  const title = {
    ...textElement("Confirm Action", x + 24, y + 24, 18, "#111827"),
    groupIds: [groupId],
  };

  const body = {
    ...textElement("Are you sure you want to proceed with this operation? This action cannot be undone.", x + 24, y + 64, 14, "#4b5563"),
    groupIds: [groupId],
    width: w - 48,
    height: 60,
  };

  // Cancel Button
  const cancelBtn = {
    ...baseElement("rectangle", x + w - 210, y + h - 60, 90, 36),
    backgroundColor: "#f3f4f6",
    strokeColor: "#d1d5db",
    roundness: { type: 2 },
    groupIds: [groupId],
  };
  const cancelTxt = {
    ...textElement("Cancel", x + w - 190, y + h - 51, 14, "#374151"),
    groupIds: [groupId],
  };

  // Confirm Button
  const confirmBtn = {
    ...baseElement("rectangle", x + w - 108, y + h - 60, 90, 36),
    backgroundColor: "#dc2626",
    strokeColor: "#b91c1c",
    roundness: { type: 2 },
    groupIds: [groupId],
  };
  const confirmTxt = {
    ...textElement("Delete", x + w - 85, y + h - 51, 14, "#ffffff"),
    groupIds: [groupId],
  };

  return [modalBox, title, body, cancelBtn, cancelTxt, confirmBtn, confirmTxt];
}
