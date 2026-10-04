import { useEffect } from "react";

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
    const reported = new Set<string>();

    const report = (where: string, message: string, stack?: string) => {
      const key = `${where}:${message}`;
      if (reported.has(key) || reported.size > 20) return;
      reported.add(key);
      void fetch("/api/system/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ where, message, stack }),
        cache: "no-store",
      }).catch(() => {
        /* the server may be exactly what is down — nothing else to do */
      });
    };

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
