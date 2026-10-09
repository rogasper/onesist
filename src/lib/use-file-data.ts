import { useState, useEffect, useCallback, useRef } from "react";
import { subscribe } from "~/lib/event-stream";

export interface FileEntry {
  name: string;
  path: string;
  type: string;
  ext: string;
  size: number;
  modifiedAt?: number;
}

function withProject(url: string, projectId?: string): string {
  if (!projectId) return url;
  return url + (url.includes("?") ? "&" : "?") + "projectId=" + projectId;
}

/**
 * Tracks whether the document is visible. WKWebView (Tauri desktop) silently
 * drops long-lived SSE connections when the window is hidden/minimized; closing
 * the EventSource on hidden (and reopening on visible) prevents half-dead
 * connections from accumulating and leaking server+client memory.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(!document.hidden);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return visible;
}

export function useFileList(dir: string, projectId?: string): { files: FileEntry[]; loading: boolean; refresh: () => void } {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(withProject(`/api/files/list?dir=${encodeURIComponent(dir)}`, projectId));
      if (res.ok) setFiles(await res.json());
    } catch {}
    setLoading(false);
  }, [dir, projectId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { files, loading, refresh };
}

export function useFileContent(path: string | null, projectId?: string): { content: string | null; loading: boolean; refresh: () => void } {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!path) { setContent(null); setLoading(false); return; }
    try {
      const res = await fetch(withProject(`/api/files/read?path=${encodeURIComponent(path)}`, projectId));
      if (res.ok) { const d = await res.json(); setContent(d.content); }
    } catch {}
    setLoading(false);
  }, [path, projectId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { content, loading, refresh };
}

/**
 * The `file:changed` payload, whichever shape it arrives in.
 *
 * The SSE route forwards the event-bus envelope verbatim —
 * `{ type, data: { route, path, root }, timestamp }` — while the first version
 * of `useFileWatch` read `route`/`path` off the TOP level. `data.route` was
 * therefore always `undefined`, the route filter never matched, and every
 * consumer of that hook was silently deaf: the ERD canvas (and the sketch
 * canvas) only refreshed after leaving and re-entering the tab (reported
 * 2026-09-18, UJI-MANUAL C9). `useFileChanged` had the unwrap right — this
 * helper is that one definition, shared, and it still accepts a flat payload so
 * neither caller depends on which side of the wire it is talking to.
 *
 * Pure and exported on purpose: the contract between the SSE route and the
 * client is exactly the kind of thing a verification suite should pin down.
 */
export function fileChangedPayload(raw: unknown): { route?: string; path?: string; root?: string } {
  const envelope = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const inner = envelope.data && typeof envelope.data === "object" ? envelope.data : envelope;
  return inner as { route?: string; path?: string; root?: string };
}

export function useFileWatch(routeType: string, onFileChanged?: (path: string) => void) {
  const handlerRef = useRef(onFileChanged);
  handlerRef.current = onFileChanged;
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (!pageVisible) return;
    return subscribe("file:changed", (raw) => {
      const data = fileChangedPayload(raw);
      if (data.route === routeType) handlerRef.current?.(data.path ?? "");
    });
  }, [routeType, pageVisible]);
}

/** Every `file:changed` event, whatever the route.
 *
 *  `useFileWatch` is the per-tab variant (it filters by route); this one exists
 *  for lists that must include files of ANY kind — the composer's `@` popup, for
 *  instance, where a file created a second ago (by the agent, by a bash CLI, or
 *  by the user) has to show up without reloading the page. Refreshing belongs on
 *  this bus rather than on a timer (AGENTS.md: no client-side polling when an
 *  event exists).
 */
export function useFileChanged(onChange?: (data: { route?: string; path?: string; root?: string }) => void) {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (!pageVisible) return;
    return subscribe("file:changed", (raw) => handlerRef.current?.(fileChangedPayload(raw)));
  }, [pageVisible]);
}

export function useFsdConversion(onEvent?: (data: { sessionId: string; status: string; error?: string | null; contentLength?: number }) => void) {  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (!pageVisible) return;
    return subscribe("fsd:conversion", (data) => handlerRef.current?.(data));
  }, [pageVisible]);
}
