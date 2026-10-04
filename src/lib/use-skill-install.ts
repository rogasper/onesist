import { useState, useCallback, useEffect, useRef } from "react";

export interface SkillStatus {
  name: string;
  status: string;
  version?: string | null;
  latestVersion?: string | null;
  error?: string | null;
}

export interface SkillInstallState {
  status: "idle" | "installing" | "ready" | "outdated" | "pending" | "failed";
  skills: SkillStatus[] | null;
  error: string | null;
  projectId: string | null;
}

const IDLE: SkillInstallState = { status: "idle", skills: null, error: null, projectId: null };

// The copy is milliseconds of work (4 skills, ~270 KB): `probe-timing.ts`
// measures 8 ms cold. Polling on a 1.5 s interval therefore spent 1.5 s
// pretending to install something that had already finished, so it starts
// immediately and then samples fast enough to catch the result.
const POLL_MS = 250;
const MAX_ATTEMPTS = 120; // ~30 s: the same budget the old 20 x 1.5 s gave

/** Skills the project still needs, by name. Empty means everything is in place. */
export function missingSkillNames(skills: SkillStatus[] | null | undefined): string[] {
  return (skills ?? []).filter((s) => s.status !== "installed").map((s) => s.name);
}

export interface SettleDecision {
  done: boolean;
  status?: SkillInstallState["status"];
  error?: string | null;
}

/**
 * What a status reading means once an install has been requested.
 *
 * The case this exists for: a project with some skills installed and some
 * missing reports `pending` — not `installed`, and not `outdated` either, since
 * that requires *every* skill to be present (`server/routes/projects/skills.ts`).
 * Waiting on `pending` forever is what left the banner saying "Installing…"
 * while nothing ran, so an install request treats "no longer running, still
 * missing skills" as a result, not as something to keep waiting for.
 */
export function settleAfterInstall(next: Pick<SkillInstallState, "status" | "skills" | "error">): SettleDecision {
  if (next.status === "ready") return { done: true, status: "ready", error: null };
  if (next.status === "outdated") return { done: true, status: "outdated", error: next.error ?? null };
  // "installing" is the server's in-memory flag for THIS process, so it is the
  // one status that genuinely means "keep waiting".
  if (next.status === "installing" || next.status === "idle") return { done: false };

  const missing = missingSkillNames(next.skills);
  if (missing.length) {
    return { done: true, status: "failed", error: next.error ?? `Not installed: ${missing.join(", ")}` };
  }
  return { done: true, status: "ready", error: null };
}

export interface SkillNotice {
  tone: "amber" | "blue" | "red";
  text: string;
  /** Null when there is nothing the user can do about the current state. */
  action: string | null;
  /** Only a running install earns a pulsing dot. */
  pulse: boolean;
}

/**
 * Copy for the project banner. `idle` and `ready` have no notice, and the skill
 * names come from the status payload rather than being written into the text —
 * the old hardcoded "(fsd-analyzer, markitdown)" kept naming the two skills that
 * were already installed while the two actually missing were never mentioned.
 */
export function skillNotice(state: SkillInstallState): SkillNotice | null {
  const missing = missingSkillNames(state.skills);
  const list = missing.length ? ` (${missing.join(", ")})` : "";
  switch (state.status) {
    case "installing":
      return { tone: "amber", text: "Installing required project skills…", action: null, pulse: true };
    case "pending":
      return {
        tone: "amber",
        text: `Project skills are not installed yet${list} — AI analysis is unavailable.`,
        action: "Install",
        pulse: false,
      };
    case "outdated":
      return {
        tone: "blue",
        text: "Skill update available — a newer version of the project skills can be installed.",
        action: "Update now",
        pulse: false,
      };
    case "failed":
      return {
        tone: "red",
        text: `Project skills failed to install${list} — AI analysis is unavailable.`,
        action: "Retry install",
        pulse: false,
      };
    default:
      return null;
  }
}

/**
 * Project skill install/status state machine used by the dashboard's
 * "Open Project" flow and the project layout's install banner.
 *
 * - `check(projectId)` — one-shot status fetch.
 * - `start(projectId)` — POST install, then poll /skills immediately and every
 *   250 ms until the result settles or ~30 s pass.
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
      const outdated = d.status === "outdated" || d.skills?.some((s: SkillStatus) => s.status === "outdated");
      return {
        status: (outdated ? "outdated" : d.status) as SkillInstallState["status"],
        skills: d.skills ?? null,
        // `error` is the server's stored reason for the last failed install;
        // without it a failure could only be reported as "something failed".
        error: d.error ?? d.skills?.find((s: SkillStatus) => s.status === "failed")?.error ?? null,
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
    const poll = async () => {
      attempts += 1;
      const next = await readStatus(projectId);
      const decision = settleAfterInstall(next);
      const timedOut = !decision.done && attempts >= MAX_ATTEMPTS;
      setState((prev) => ({
        ...prev,
        skills: next.skills,
        status: decision.done ? (decision.status as SkillInstallState["status"]) : timedOut ? "failed" : prev.status,
        error: decision.done
          ? (decision.error ?? null)
          : timedOut
            ? `Installation did not finish in ${Math.round((MAX_ATTEMPTS * POLL_MS) / 1000)} s${missingSkillNames(next.skills).length ? ` — not installed: ${missingSkillNames(next.skills).join(", ")}` : ""}`
            : prev.error,
      }));
      if (decision.done || timedOut) clearTimer();
    };
    // Sample once right away — the install is a directory copy that finishes in
    // single-digit milliseconds, so the first reading usually already has the answer.
    void poll();
    timerRef.current = setInterval(() => { void poll(); }, POLL_MS);
  }, [readStatus, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setState(IDLE);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { state, check, start, reset };
}
