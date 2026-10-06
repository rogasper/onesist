import { useEffect } from "react";

/**
 * Fire-and-forget report of a client-side failure into the server log.
 * Deduplicated per message (a render loop must not flood the log file) and
 * never awaited: reporting must never make a failure worse.
 */
const reported = new Set<string>();
export function reportClientError(where: string, message: string, stack?: string): void {
  const key = `${where}:${message}`;
  if (reported.has(key) || reported.size > 50) return;
  reported.add(key);
  void fetch("/api/system/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ where, message, stack }),
    cache: "no-store",
  }).catch(() => {
    /* the server may be exactly what is down — nothing else to do */
  });
}

/**
 * Reports client-side failures into the server log.
 *
 * The WebView's errors are otherwise invisible: a failed fetch reaches the panel
 * as "Load failed" (WebKit's wording) and nothing is written anywhere, so a run
 * that dies mid-stream leaves no evidence of which side dropped it. Errors are
 * deduplicated per message — a render loop must not flood the log file — and the
 * POST is fire-and-forget: reporting must never make a failure worse.
 */
export function useClientErrorReporting(): void {
  useEffect(() => {
    const report = reportClientError;
    const onError = (e: ErrorEvent) => report("window.onerror", e.message || "(tanpa pesan)", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      report("unhandledrejection", String(reason?.message ?? reason ?? "(tanpa pesan)"), reason?.stack);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}
