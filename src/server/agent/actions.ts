/**
 * Composer actions resolved per project (PRD FR-C14).
 *
 * The four built-in actions live in `lib/chat-actions.ts` and act as the
 * fallback. A project may override/extend them with a file inside its own
 * workspace: `.agents/onesist-actions.json`. Reasons for that shape:
 *
 *  - The workspace is where this app keeps everything else that belongs to a
 *    project (skills under `.agents/skills/`, artifacts under `input`/`output`),
 *    so a team's conventions travel with the repo instead of living in a DB row
 *    that only exists on one machine.
 *  - It is therefore also **untrusted content**: the file arrives from a repo,
 *    possibly someone else's, and the runtime has write tools, `bash` and
 *    `web_fetch` (FR-K1). Actions never auto-send anything — they only fill the
 *    composer, so the user always sees the exact sentence before it is sent —
 *    and the UI marks where each action came from.
 *
 * Reading it must never break the composer: a missing, unreadable or invalid
 * file degrades to the built-ins, and every rejected entry is counted so the UI
 * can say something concrete instead of failing silently.
 */
import fs from "node:fs";
import path from "node:path";
import { CHAT_ACTIONS, type ChatAction } from "~/lib/chat-actions";

export const PROJECT_ACTIONS_REL_PATH = ".agents/onesist-actions.json";

/** Caps. A project file is data from a repo, so nothing here may be unbounded. */
export const ACTION_LIMITS = {
  actions: 20,
  id: 40,
  label: 40,
  hint: 120,
  prompt: 2000,
} as const;

export interface ResolvedAction extends ChatAction {
  /** `project` = came from the project's action file, `builtin` = shipped default. */
  source: "builtin" | "project";
}

export interface ResolvedActions {
  actions: ResolvedAction[];
  projectFile: {
    present: boolean;
    /** Human-readable reason the file was ignored (already Indonesian: it is
     *  shown to the user). `null` when the file was used, or absent. */
    problem: string | null;
    /** How many entries were dropped for being invalid. */
    rejected: number;
  };
}

/** Control characters would corrupt the textarea; newlines and tabs are kept so
 *  multi-line prompts still work. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const stripped = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!stripped) return null;
  return stripped.slice(0, max);
}

function cleanId(value: unknown): string | null {
  const id = cleanText(value, ACTION_LIMITS.id);
  if (!id) return null;
  return /^[a-z0-9][a-z0-9._-]*$/i.test(id) ? id : null;
}

/** Validates one entry from the project file. Returns `null` for anything that
 *  does not fully make sense — a half-valid action is worse than no action. */
function normalizeAction(raw: unknown): ChatAction | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const id = cleanId(entry.id);
  const label = cleanText(entry.label, ACTION_LIMITS.label);
  const prompt = cleanText(entry.prompt, ACTION_LIMITS.prompt);
  if (!id || !label || !prompt) return null;
  const hint = cleanText(entry.hint, ACTION_LIMITS.hint);
  return { id, label, hint: hint ?? "", prompt };
}

export function resolveChatActions(root: string): ResolvedActions {
  const builtins: ResolvedAction[] = CHAT_ACTIONS.map((a) => ({ ...a, source: "builtin" as const }));
  const full = path.join(root, PROJECT_ACTIONS_REL_PATH);
  const absent: ResolvedActions = { actions: builtins, projectFile: { present: false, problem: null, rejected: 0 } };

  let rawText: string;
  try {
    rawText = fs.readFileSync(full, "utf-8");
  } catch {
    // Not existing is the normal case, not an error.
    return absent;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err: any) {
    return {
      actions: builtins,
      projectFile: { present: true, problem: `Berkas aksi project tidak bisa dibaca sebagai JSON (${err?.message ?? err}).`, rejected: 0 },
    };
  }

  // Accept both `{ "actions": [...] }` and a bare array — hand-written files
  // get this wrong often enough that tolerating it is cheaper than explaining.
  const list = Array.isArray(parsed) ? parsed : Array.isArray((parsed as any)?.actions) ? (parsed as any).actions : null;
  if (!list) {
    return {
      actions: builtins,
      projectFile: { present: true, problem: 'Berkas aksi project harus berisi array pada field "actions".', rejected: 0 },
    };
  }

  const projectActions: ResolvedAction[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const raw of list.slice(0, ACTION_LIMITS.actions * 2)) {
    const action = normalizeAction(raw);
    if (!action || seen.has(action.id)) {
      rejected++;
      continue;
    }
    seen.add(action.id);
    projectActions.push({ ...action, source: "project" });
    if (projectActions.length >= ACTION_LIMITS.actions) break;
  }

  if (!projectActions.length) {
    return {
      actions: builtins,
      projectFile: { present: true, problem: "Tidak ada aksi sah di berkas aksi project; memakai aksi bawaan.", rejected },
    };
  }

  // Project actions come first — they are this project's own conventions — and a
  // built-in whose id the project already defines steps aside instead of
  // appearing twice.
  const merged = [...projectActions, ...builtins.filter((b) => !seen.has(b.id))];
  return {
    actions: merged,
    projectFile: { present: true, problem: rejected ? `${rejected} aksi di berkas project dilewati karena tidak lengkap.` : null, rejected },
  };
}
