/**
 * A CLI runtime's status as the UI shows it, and one status request per provider per
 * page load (a failed one is forgotten so the next look retries). Settings forces a
 * fresh probe when it opens; the model picker reuses what is known.
 */
import { useEffect, useState } from "react";
import type { RuntimeState, RuntimeStatus } from "~/lib/runtime-types";

export const RUNTIME_STATE_LABEL: Record<RuntimeState, string> = {
  ready: "Siap",
  not_installed: "Belum terpasang",
  not_ready: "Belum login",
  error: "Tidak terhubung",
};

export function runtimeStateClass(state: RuntimeState): string {
  if (state === "ready") return "text-kumo-subtle";
  if (state === "not_ready") return "text-amber-500";
  return "text-red-400";
}

const requested = new Map<string, Promise<RuntimeStatus>>();

export function fetchRuntimeStatus(providerId: string, force = false): Promise<RuntimeStatus> {
  if (force) requested.delete(providerId);
  let pending = requested.get(providerId);
  if (!pending) {
    pending = fetch(`/api/providers/${encodeURIComponent(providerId)}/status`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as { status?: RuntimeStatus; error?: string };
        if (!res.ok || !body.status) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body.status;
      })
      .catch((err: unknown): RuntimeStatus => {
        requested.delete(providerId);
        return { state: "error", version: null, message: err instanceof Error ? err.message : "Gagal memeriksa status" };
      });
    requested.set(providerId, pending);
  }
  return pending;
}

/** The status of one provider, or null while unknown / when not enabled. */
export function useRuntimeStatus(providerId: string | null, enabled: boolean, force = false): RuntimeStatus | null {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  useEffect(() => {
    if (!providerId || !enabled) {
      setStatus(null);
      return;
    }
    let alive = true;
    void fetchRuntimeStatus(providerId, force).then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, [providerId, enabled, force]);
  return status;
}
