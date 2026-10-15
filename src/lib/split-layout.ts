/**
 * Split-view layout model for the project page.
 *
 * The main pane is always the route's <Outlet/>; this module only describes the
 * EXTRA panes (0..3) beside it, how they are arranged, and how that state is read
 * from and written to the URL search params `panes`, `pdir` and `pr`.
 * Pure functions only — no React, no DOM — so every rule here is unit-tested.
 */

export const SPLIT_TABS = ["erd", "spec", "tasks", "fsd"] as const;
export type SplitTab = (typeof SPLIT_TABS)[number];

export const SPLIT_TAB_LABELS: Record<SplitTab, string> = {
  erd: "ERD",
  spec: "API Spec",
  tasks: "Tasks",
  fsd: "FSD Analyzer",
};

export const MAX_EXTRA_PANES = 3;
export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
/**
 * Narrowest a side-by-side pane may get. The FSD tab (document list + editor) is unusable below
 * this, so a split never squeezes a pane under it; two minimum panes are the stacking threshold.
 */
export const MIN_PANE_PX = 560;

export type SplitDir = "h" | "v";

export interface SplitState {
  /** Extra panes beside the main one, in screen order. */
  panes: SplitTab[];
  /** Only used with exactly one extra pane: h = side by side, v = top and bottom. */
  dir: SplitDir;
  /** [0] = split between main and the rest, [1] = the second split (stack or grid rows). */
  ratios: [number, number];
}

export const EMPTY_SPLIT: SplitState = { panes: [], dir: "h", ratios: [0.5, 0.5] };

export type Arrangement = "single" | "cols" | "rows" | "main-stack" | "grid" | "stack";

export function isSplitTab(v: unknown): v is SplitTab {
  return typeof v === "string" && (SPLIT_TABS as readonly string[]).includes(v);
}

export function clampRatio(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, v));
}

function toRatio(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0.5;
  return clampRatio(Number(raw));
}

/**
 * Reads the split from search params. TanStack Router JSON-parses each value, so
 * `pr=0.4` arrives as a number and `pr=0.4,0.6` as a string; both are accepted.
 */
export function parseSplitSearch(search: Record<string, unknown>): SplitState {
  const rawPanes = typeof search.panes === "string" ? search.panes.split(",") : [];
  const panes = rawPanes.map((p) => p.trim()).filter(isSplitTab).slice(0, MAX_EXTRA_PANES);
  const dir: SplitDir = search.pdir === "v" ? "v" : "h";
  const rawRatios =
    typeof search.pr === "string" ? search.pr.split(",")
    : typeof search.pr === "number" ? [String(search.pr)]
    : [];
  return { panes, dir, ratios: [toRatio(rawRatios[0]), toRatio(rawRatios[1])] };
}

/** Search params for a split. `undefined` removes the key from the URL. */
export function serializeSplit(state: SplitState): { panes?: string; pdir?: string; pr?: string } {
  if (state.panes.length === 0) return { panes: undefined, pdir: undefined, pr: undefined };
  return {
    panes: state.panes.join(","),
    pdir: state.dir,
    pr: state.ratios.map((r) => r.toFixed(2)).join(","),
  };
}

export function splitStorageKey(projectId: string): string {
  return `onesist:split:${projectId}`;
}

/** Parses what `serializeSplit` produced and was saved as JSON; anything else is an empty split. */
export function readStoredSplit(raw: string | null): SplitState {
  if (!raw) return EMPTY_SPLIT;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_SPLIT;
    return parseSplitSearch(value as Record<string, unknown>);
  } catch {
    return EMPTY_SPLIT;
  }
}

export function addPane(state: SplitState, tab: SplitTab, dir?: SplitDir): SplitState {
  if (state.panes.length >= MAX_EXTRA_PANES) return state;
  return {
    ...state,
    panes: [...state.panes, tab],
    dir: state.panes.length === 0 && dir ? dir : state.dir,
  };
}

export function removePane(state: SplitState, index: number): SplitState {
  if (index < 0 || index >= state.panes.length) return state;
  return { ...state, panes: state.panes.filter((_, i) => i !== index) };
}

export function setPaneTab(state: SplitState, index: number, tab: SplitTab): SplitState {
  if (index < 0 || index >= state.panes.length) return state;
  return { ...state, panes: state.panes.map((p, i) => (i === index ? tab : p)) };
}

export function setRatio(state: SplitState, which: 0 | 1, value: number): SplitState {
  const ratios: [number, number] = [...state.ratios];
  ratios[which] = clampRatio(value);
  return { ...state, ratios };
}

export function arrangementFor(paneCount: number, dir: SplitDir, width: number): Arrangement {
  if (paneCount <= 0) return "single";
  if (width > 0 && width < 2 * MIN_PANE_PX) return "stack";
  if (paneCount === 1) return dir === "h" ? "cols" : "rows";
  if (paneCount === 2) return "main-stack";
  return "grid";
}

/**
 * The ratio moved inside the range where both sides keep `minPx`. When the container cannot hold
 * two minimum panes, the answer is the centre; the workspace stacks in that case anyway.
 */
export function fitRatio(ratio: number, containerPx: number, minPx: number): number {
  if (containerPx < 2 * minPx) return 0.5;
  return Math.min(1 - minPx / containerPx, Math.max(minPx / containerPx, ratio));
}

/** Position of the pointer inside [start, start + size] as a clamped ratio. */
export function ratioFromPointer(pointer: number, start: number, size: number): number {
  if (size <= 0) return 0.5;
  return clampRatio((pointer - start) / size);
}

/** Forgets one pane's unsaved flag: its content is gone (tab changed) or it was replaced. */
export function clearDirty(dirty: Record<number, boolean>, index: number): Record<number, boolean> {
  const next = { ...dirty };
  delete next[index];
  return next;
}

/** Re-keys per-pane dirty flags after pane `removed` is closed, so later panes keep theirs. */
export function shiftDirtyAfterRemove(dirty: Record<number, boolean>, removed: number): Record<number, boolean> {
  const next: Record<number, boolean> = {};
  for (const [key, value] of Object.entries(dirty)) {
    const i = Number(key);
    if (i === removed) continue;
    next[i > removed ? i - 1 : i] = value;
  }
  return next;
}
