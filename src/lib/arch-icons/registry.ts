import type { IconManifest, IconShape } from "./types";

let manifestCache: IconManifest | null = null;
let manifestPromise: Promise<IconManifest> | null = null;

export async function loadManifest(): Promise<IconManifest> {
  if (manifestCache) return manifestCache;
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch("/icons/manifest.json", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load icon manifest: ${r.status}`);
      return r.json();
    })
    .then((m) => {
      manifestCache = m;
      return m;
    });
  return manifestPromise;
}

export async function searchIcons(query: string, limit = 50): Promise<IconShape[]> {
  const m = await loadManifest();
  const q = query.trim().toLowerCase();
  if (!q) return m.shapes.slice(0, limit);
  const scored = m.shapes
    .map((s) => {
      const hay = `${s.label} ${s.category} ${s.pack} ${s.keywords.join(" ")}`.toLowerCase();
      let score = 0;
      if (s.label.toLowerCase().includes(q)) score += 10;
      if (s.category.toLowerCase().includes(q)) score += 5;
      if (hay.includes(q)) score += 1;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
  return scored;
}

const dataUrlCache = new Map<string, string>();

/**
 * Fetch SVG file and convert to dataURL base64 for Excalidraw image element.
 */
export async function getIconDataUrl(file: string): Promise<string> {
  const key = file;
  if (dataUrlCache.has(key)) return dataUrlCache.get(key)!;
  const url = `/icons/${file}`;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Icon not found: ${url}`);
  const svgText = await res.text();
  // Ensure svg text is clean and base64 encode (handles unicode)
  const base64 = btoa(unescape(encodeURIComponent(svgText)));
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  dataUrlCache.set(key, dataUrl);
  return dataUrl;
}

/**
 * Prefetch a batch of icons (warm cache).
 */
export async function prefetchIcons(files: string[]) {
  await Promise.all(files.map((f) => getIconDataUrl(f).catch(() => null)));
}

export function getPackList(manifest: IconManifest): string[] {
  return Object.keys(manifest.packs);
}
