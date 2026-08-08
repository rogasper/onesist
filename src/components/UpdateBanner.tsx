import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect, useState } from "react";

const IS_TAURI = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type BannerState =
  | { status: "idle" | "checking" | "installing" | "none" }
  | { status: "available"; update: Update }
  | { status: "error"; message: string };

/**
 * In-app auto-update banner. Only active in the Tauri desktop shell; no-ops
 * in the plain web build. Checks once on mount (after the sidecar is serving)
 * and again every 6h while the window stays open.
 */
export function UpdateBanner() {
  const [state, setState] = useState<BannerState>({ status: "idle" });
  const isInstalling = state.status === "installing";

  useEffect(() => {
    if (!IS_TAURI()) return;

    let cancelled = false;
    const checkOnce = async () => {
      try {
        const update = await check();
        if (cancelled) return;
        if (update) {
          setState({ status: "available", update });
        } else {
          setState({ status: "none" });
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    };

    void checkOnce();
    const interval = setInterval(() => void checkOnce(), 6 * 60 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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
