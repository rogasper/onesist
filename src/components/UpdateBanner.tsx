import { check, type Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

const IS_TAURI = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const CHECK_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;

/** Rejects if `p` doesn't settle within `ms` (timer is cleared once it does). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Update check timed out")), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Custom event name used by the sidebar "Check for updates" button. */
export const UPDATE_CHECK_EVENT = "onesist:check-update";

/** Fire a manual update check (dispatched from the sidebar button). */
export function requestUpdateCheck() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UPDATE_CHECK_EVENT));
  }
}

type BannerState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "none" }
  | { status: "available"; update: Update }
  | { status: "downloading"; update: Update; downloaded: number; total: number | null }
  | { status: "downloaded"; update: Update }
  | { status: "installing"; update: Update }
  | { status: "error"; phase: "check" | "install"; message: string };

function fmtBytes(n: number): string {
  return `${(n / 1048576).toFixed(1)} MB`;
}

/**
 * In-app auto-update banner. Only active in the Tauri desktop shell; no-ops
 * in the plain web build. Checks once on mount (after the sidecar is serving)
 * and again every 6h while the window stays open.
 *
 * Unlike a silent no-op, failures surface as a visible banner with a retry
 * button so a broken updater is never indistinguishable from "no update".
 *
 * Flow: available → (Unduh & Pasang) → downloading with progress bar →
 * downloaded ("siap dipasang") → (Install & Restart) → installing → relaunch.
 */
export function UpdateBanner() {
  const [state, setState] = useState<BannerState>({ status: "idle" });

  const checkOnce = useCallback(async () => {
    setState((prev) => (prev.status === "available" ? prev : { status: "checking" }));
    // GitHub's release-asset CDN is intermittently unreachable on some ISPs, so
    // retry a few times with a per-attempt timeout before surfacing an error.
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const update = await withTimeout(check(), CHECK_TIMEOUT_MS);
        setState(update ? { status: "available", update } : { status: "none" });
        return;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 1500));
        }
      }
    }
    setState({ status: "error", phase: "check", message: lastError instanceof Error ? lastError.message : String(lastError) });
  }, []);

  useEffect(() => {
    if (!IS_TAURI()) return;

    // Don't auto-check in dev builds — the updater is irrelevant while
    // developing and the failed-check banner would just add noise.
    const autoCheck = () => {
      if (import.meta.env.DEV) return;
      void checkOnce();
    };

    autoCheck();
    const interval = setInterval(autoCheck, 6 * 60 * 60 * 1000);
    const onManual = () => void checkOnce();
    window.addEventListener(UPDATE_CHECK_EVENT, onManual);
    // Native menu "Check for Update" → Tauri event emitted from lib.rs.
    let unlisten: (() => void) | undefined;
    void listen("onesist:check-update", () => void checkOnce()).then((fn) => {
      unlisten = fn;
    });
    return () => {
      clearInterval(interval);
      window.removeEventListener(UPDATE_CHECK_EVENT, onManual);
      unlisten?.();
    };
  }, [checkOnce]);

  // Download with progress. download() resolves when the package is staged;
  // each chunk adds to `downloaded` so the bar can show a real percentage.
  // `Started.contentLength` is optional — without it the bar is indeterminate.
  const startDownload = useCallback(async (update: Update) => {
    setState({ status: "downloading", update, downloaded: 0, total: null });
    try {
      await update.download((event: DownloadEvent) => {
        if (event.event === "Started") {
          setState((prev) =>
            prev.status === "downloading" ? { ...prev, total: event.data.contentLength ?? null } : prev);
        } else if (event.event === "Progress") {
          setState((prev) =>
            prev.status === "downloading" ? { ...prev, downloaded: prev.downloaded + event.data.chunkLength } : prev);
        } else if (event.event === "Finished") {
          setState({ status: "downloaded", update });
        }
      });
    } catch (e) {
      setState({ status: "error", phase: "install", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const installAndRestart = useCallback(async (update: Update) => {
    setState({ status: "installing", update });
    try {
      await update.install();
      // macOS: install() swaps the .app in place WITHOUT quitting, so the app
      // must be relaunched explicitly — lib.rs skips its hard exit for the
      // restart code (i32::MAX) so Tauri's own restart path can respawn the
      // app. Windows: install() terminates the process inside the updater and
      // the NSIS installer relaunches — this line never runs there.
      await relaunch();
    } catch (e) {
      setState({ status: "error", phase: "install", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  if (state.status === "idle") return null;
  if (state.status === "none") return null;

  if (state.status === "checking") {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-kumo-line bg-kumo-subtle/10">
        <span className="text-sm text-kumo-subtle">Memeriksa update…</span>
      </div>
    );
  }

  if (state.status === "error") {
    // Check errors are usually network reachability (GitHub CDN) — keep the
    // friendly copy. Download/install errors are local — show the real message.
    if (state.phase === "check") {
      return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-red-500/40 bg-red-500/10">
          <span className="text-sm text-red-200 truncate" title={state.message}>
            Tidak dapat terhubung ke server update. Periksa koneksi internet.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void checkOnce()}
              className="px-3 py-1 rounded bg-kumo-subtle text-kumo-default text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={() => setState({ status: "none" })}
              className="text-kumo-subtle hover:text-kumo-default text-xs cursor-pointer"
              aria-label="Tutup banner error"
            >
              ✕
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-red-500/40 bg-red-500/10">
        <span className="text-sm text-red-200 truncate" title={state.message}>
          Gagal memasang update: {state.message}
        </span>
        <button
          type="button"
          onClick={() => setState({ status: "none" })}
          className="text-kumo-subtle hover:text-kumo-default text-xs cursor-pointer shrink-0"
          aria-label="Tutup banner error"
        >
          ✕
        </button>
      </div>
    );
  }

  if (state.status === "downloading") {
    const percent = state.total
      ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
      : null;
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-kumo-line bg-kumo-brand/10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 text-xs text-kumo-default mb-1.5">
            <span>Mengunduh update v{state.update.version}…</span>
            <span className="text-kumo-subtle shrink-0">
              {percent !== null ? `${percent}%` : fmtBytes(state.downloaded)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-kumo-elevated overflow-hidden">
            <div
              className={`h-full bg-kumo-brand transition-all duration-200 ${percent === null ? "animate-pulse" : ""}`}
              style={{ width: percent !== null ? `${percent}%` : "40%" }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "downloaded") {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-kumo-line bg-kumo-brand/10">
        <span className="text-sm text-kumo-default truncate">
          Update v{state.update.version} siap dipasang
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void installAndRestart(state.update)}
            className="px-3 py-1 rounded bg-kumo-brand text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            Install & Restart
          </button>
          <button
            type="button"
            onClick={() => setState({ status: "none" })}
            className="text-kumo-subtle hover:text-kumo-default text-xs cursor-pointer"
            aria-label="Tutup banner update"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "installing") {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-kumo-line bg-kumo-brand/10">
        <span className="text-sm text-kumo-default">Memasang update v{state.update.version}…</span>
      </div>
    );
  }

  // available
  const { update } = state;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-kumo-line bg-kumo-brand/10">
      <span className="text-sm text-kumo-default truncate">
        Update tersedia — v{update.version}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void startDownload(update)}
          className="px-3 py-1 rounded bg-kumo-brand text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
        >
          Unduh & Pasang
        </button>
        <button
          type="button"
          onClick={() => setState({ status: "none" })}
          className="text-kumo-subtle hover:text-kumo-default text-xs cursor-pointer"
          aria-label="Tutup banner update"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
