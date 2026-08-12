import { check, type Update } from "@tauri-apps/plugin-updater";
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
  | { status: "idle" | "checking" | "installing" | "none" }
  | { status: "available"; update: Update }
  | { status: "error"; message: string };

/**
 * In-app auto-update banner. Only active in the Tauri desktop shell; no-ops
 * in the plain web build. Checks once on mount (after the sidecar is serving)
 * and again every 6h while the window stays open.
 *
 * Unlike a silent no-op, failures surface as a visible banner with a retry
 * button so a broken updater is never indistinguishable from "no update".
 */
export function UpdateBanner() {
  const [state, setState] = useState<BannerState>({ status: "idle" });
  const isInstalling = state.status === "installing";

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
    setState({ status: "error", message: lastError instanceof Error ? lastError.message : String(lastError) });
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

  if (state.status !== "available") return null;

  const { update } = state;

  const install = async () => {
    setState({ status: "installing" });
    try {
      await update.downloadAndInstall(() => {});
      await relaunch();
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-kumo-line bg-kumo-brand/10">
      <span className="text-sm text-kumo-default">
        Update tersedia — v{update.version}
      </span>
      <div className="flex items-center gap-2">
        {isInstalling && (
          <span className="text-xs text-kumo-subtle">Mengunduh & memasang…</span>
        )}
        <button
          type="button"
          onClick={() => void install()}
          disabled={isInstalling}
          className="px-3 py-1 rounded bg-kumo-brand text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
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
