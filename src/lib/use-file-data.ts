import { useState, useEffect, useCallback, useRef } from "react";

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

export function useFileWatch(routeType: string, onFileChanged?: (path: string) => void) {
  const handlerRef = useRef(onFileChanged);
  handlerRef.current = onFileChanged;
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (!pageVisible) return;
    let es: EventSource | null = null;
    let errors = 0;
    const connect = async () => {
      try {
        const res = await fetch("/api/events/ticket", { method: "POST" });
        const d = await res.json();
        es = new EventSource(`/api/events?ticket=${d.ticket}`);
        es.addEventListener("file:changed", (e) => {
          const data = JSON.parse(e.data);
          if (data.route === routeType) handlerRef.current?.(data.path);
        });
        // WebView/browser EventSource auto-reconnects forever; give up after
        // a handful of failures so we don't accumulate dead streams.
        es.onerror = () => {
          errors += 1;
          if (errors >= 5) es?.close();
        };
      } catch {}
    };
    connect();
    return () => { es?.close(); };
  }, [routeType, pageVisible]);
}

export function useFsdConversion(onEvent?: (data: { sessionId: string; status: string; error?: string | null; contentLength?: number }) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (!pageVisible) return;
    let es: EventSource | null = null;
    let errors = 0;
    const connect = async () => {
      try {
        const res = await fetch("/api/events/ticket", { method: "POST" });
        const d = await res.json();
        es = new EventSource(`/api/events?ticket=${d.ticket}`);
        es.addEventListener("fsd:conversion", (e) => {
          try {
            const payload = JSON.parse(e.data);
            handlerRef.current?.(payload.data ?? payload);
          } catch {}
        });
        es.onerror = () => {
          errors += 1;
          if (errors >= 5) es?.close();
        };
      } catch {}
    };
    connect();
    return () => { es?.close(); };
  }, [pageVisible]);
}
