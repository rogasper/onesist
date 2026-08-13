import { useState, useCallback, useEffect, useRef } from "react";

export interface SkillStatus {
  name: string;
  status: string;
  version?: string | null;
  latestVersion?: string | null;
  error?: string | null;
}

export interface SkillInstallState {
  status: "idle" | "installing" | "ready" | "outdated" | "failed";
  skills: SkillStatus[] | null;
  error: string | null;
  projectId: string | null;
}

const IDLE: SkillInstallState = { status: "idle", skills: null, error: null, projectId: null };

/**
 * Project skill install/status state machine used by the dashboard's
 * "Open Project" flow and the project layout's install banner.
 *
 * - `check(projectId)` — one-shot status fetch.
 * - `start(projectId)` — POST install, then poll /skills every 1.5s (cap 20)
 *   until ready/failed, updating state.
 */
export function useSkillInstall() {
  const [state, setState] = useState<SkillInstallState>(IDLE);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const readStatus = useCallback(async (projectId: string): Promise<SkillInstallState> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/skills`, { cache: "no-store" });
      const d = await res.json();
      const failed = d.skills?.find((s: SkillStatus) => s.status === "failed");
      const outdated = d.status === "outdated" || d.skills?.some((s: SkillStatus) => s.status === "outdated");
      return {
        status: (outdated ? "outdated" : d.status) as SkillInstallState["status"],
        skills: d.skills ?? null,
        error: failed?.error ?? null,
        projectId,
      };
    } catch {
      return { ...IDLE, projectId };
    }
  }, []);

  const check = useCallback(async (projectId: string) => {
    clearTimer();
    setState(await readStatus(projectId));
  }, [readStatus, clearTimer]);

  const start = useCallback(async (projectId: string) => {
    clearTimer();
    setState({ status: "installing", skills: null, error: null, projectId });
    try {
      await fetch(`/api/projects/${projectId}/skills/install`, { method: "POST" });
    } catch {}
    let attempts = 0;
    timerRef.current = setInterval(async () => {
      attempts += 1;
      const next = await readStatus(projectId);
      setState((prev) => ({ ...prev, skills: next.skills }));
      if (next.status === "ready" || next.status === "failed" || attempts >= 20) {
        clearTimer();
        setState((prev) => ({
          ...prev,
          status: next.status === "ready" ? "ready" : "failed",
          error: next.status === "ready" ? null : (next.error ?? "Skill installation failed"),
        }));
      }
    }, 1500);
  }, [readStatus, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setState(IDLE);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { state, check, start, reset };
}
