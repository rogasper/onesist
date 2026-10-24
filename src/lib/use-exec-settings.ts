import { useCallback, useEffect, useState } from "react";
import type { ExecSettings } from "~/shared/types";

/** Loads a project's execution settings and saves partial updates. The server's answer replaces the local copy. */
export function useExecSettings(projectId: string) {
  const [settings, setSettings] = useState<ExecSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectId}/exec-settings`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Gagal memuat pengaturan (${res.status})`);
        return (await res.json()) as ExecSettings;
      })
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat pengaturan");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const save = useCallback(
    async (patch: Partial<ExecSettings>): Promise<boolean> => {
      const res = await fetch(`/api/projects/${projectId}/exec-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Gagal menyimpan pengaturan");
        return false;
      }
      setSettings(data as ExecSettings);
      setError(null);
      return true;
    },
    [projectId],
  );

  return { settings, loading, error, save };
}
