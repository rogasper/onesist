import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

const IS_TAURI = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
    try {
      const update = await check();
      setState(update ? { status: "available", update } : { status: "none" });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    if (!IS_TAURI()) return;

    void checkOnce();
    const interval = setInterval(() => void checkOnce(), 6 * 60 * 60 * 1000);
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
          Gagal memeriksa update: {state.message}
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
