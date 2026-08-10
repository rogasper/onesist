import { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

interface CachedTerminal {
  id: string;
  el: HTMLElement;
  term: Terminal;
  fit: FitAddon;
  destroyed: boolean;
}

let offscreenHolder: HTMLDivElement | null = null;

function getOffscreenHolder(): HTMLDivElement {
  if (!offscreenHolder || !document.body.contains(offscreenHolder)) {
    offscreenHolder = document.createElement("div");
    offscreenHolder.style.position = "fixed";
    offscreenHolder.style.top = "-99999px";
    offscreenHolder.style.left = "-99999px";
    offscreenHolder.style.width = "800px";
    offscreenHolder.style.height = "600px";
    offscreenHolder.style.pointerEvents = "none";
    offscreenHolder.setAttribute("aria-hidden", "true");
    document.body.appendChild(offscreenHolder);
  }
  return offscreenHolder;
}

const cache = new Map<string, CachedTerminal>();
const MAX_PARKED = 8;
const parkOrder: string[] = [];

function evictIfNeeded() {
  while (parkOrder.length > MAX_PARKED) {
    const id = parkOrder.shift()!;
    const entry = cache.get(id);
    if (entry && entry.el.parentElement === getOffscreenHolder()) {
      entry.term.dispose();
      entry.el.remove();
      entry.destroyed = true;
      cache.delete(id);
    }
  }
}

export function getOrCreate(id: string): CachedTerminal | null {
  return cache.get(id) ?? null;
}

export function register(id: string, term: Terminal, fit: FitAddon, el: HTMLElement) {
  const existing = cache.get(id);
  if (existing) {
    existing.term.dispose();
    existing.el.remove();
  }
  cache.set(id, { id, el, term, fit, destroyed: false });
}

function fitWhenReady(entry: CachedTerminal, container: HTMLElement, attempts = 0) {
  if (entry.destroyed || entry.el.parentElement !== container) return;
  const rect = container.getBoundingClientRect();
  const dims = entry.term.dimensions;
  const dimsReady = !!dims && dims.css.cell.width > 0 && dims.css.cell.height > 0;
  if (rect.width >= 50 && rect.height >= 50 && dimsReady) {
    try { entry.fit.fit(); } catch {}
  } else if (attempts < 90) {
    requestAnimationFrame(() => fitWhenReady(entry, container, attempts + 1));
  }
}

export function attach(id: string, container: HTMLElement): { term: Terminal; fit: FitAddon } | null {
  const entry = cache.get(id);
  if (!entry || entry.destroyed) return null;

  if (entry.el.parentElement) {
    entry.el.parentElement.removeChild(entry.el);
  }
  container.appendChild(entry.el);

  fitWhenReady(entry, container);

  return { term: entry.term, fit: entry.fit };
}

export function park(id: string) {
  const entry = cache.get(id);
  if (!entry || entry.destroyed) return;

  if (entry.el.parentElement) {
    entry.el.parentElement.removeChild(entry.el);
  }

  const holder = getOffscreenHolder();
  holder.appendChild(entry.el);

  parkOrder.push(id);
  evictIfNeeded();
}

export function destroy(id: string) {
  const entry = cache.get(id);
  if (!entry) return;

  if (!entry.destroyed) {
    entry.term.dispose();
    entry.el.remove();
    entry.destroyed = true;
  }
  cache.delete(id);
  const idx = parkOrder.indexOf(id);
  if (idx >= 0) parkOrder.splice(idx, 1);
}

export function has(id: string): boolean {
  return cache.has(id) && !cache.get(id)!.destroyed;
}
