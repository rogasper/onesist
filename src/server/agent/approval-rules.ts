/**
 * "Izinkan" with a memory: a user can allow a kind of action for the rest of the
 * thread, or for the whole project, instead of answering the same question again.
 *
 *   - a tool (write_file, edit_file, …): allowed for the scope
 *   - a shell command: allowed by its prefix (`bun run`), for the scope
 *
 * A prefix never covers a command that chains anything after it (`;`, `&&`, `|`,
 * redirects, substitutions): `bun run build && rm -rf …` must still ask. Paths that
 * are protected (FR-E3) are never covered by a rule; the caller checks that first.
 *
 * Thread rules live in memory and end with the process. Project rules are stored in
 * the settings table, so they survive a restart.
 */
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { appSettings } from "~/server/db/schema";

export type ApprovalScope = "once" | "thread" | "project";

interface Rules {
  tools: string[];
  bashPrefixes: string[];
}

const threadRules = new Map<string, Rules>();

/** Anything that would run a second command after the first. */
const CHAINING = /[;&|<>`\n\r]|\$\(/;

/** The part of a command a rule can cover: its first word, plus a second word that
 *  looks like a sub-command (`bun run`, `git status`), but not an option or a path.
 *  Null when the command chains anything, so no prefix can be remembered for it. */
export function commandPrefix(command: string): string | null {
  const text = command.trim();
  if (!text || CHAINING.test(text)) return null;
  const words = text.split(/\s+/);
  const first = words[0];
  if (!/^[A-Za-z0-9._-]+$/.test(first)) return null;
  const second = words[1];
  if (second && /^[a-z][a-z-]*$/.test(second)) return `${first} ${second}`;
  return first;
}

function projectRules(projectId: string): Rules {
  const row = db.select().from(appSettings).where(eq(appSettings.key, `approval.rules.${projectId}`)).get() as
    | { value: string }
    | undefined;
  if (!row) return { tools: [], bashPrefixes: [] };
  try {
    const parsed = JSON.parse(row.value) as Partial<Rules>;
    return {
      tools: Array.isArray(parsed.tools) ? parsed.tools.map(String) : [],
      bashPrefixes: Array.isArray(parsed.bashPrefixes) ? parsed.bashPrefixes.map(String) : [],
    };
  } catch {
    return { tools: [], bashPrefixes: [] };
  }
}

function saveProjectRules(projectId: string, rules: Rules): void {
  const key = `approval.rules.${projectId}`;
  const value = JSON.stringify(rules);
  const now = new Date().toISOString();
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  if (existing) db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run();
  else db.insert(appSettings).values({ key, value, updatedAt: now }).run();
}

function threadOf(threadId: string): Rules {
  let rules = threadRules.get(threadId);
  if (!rules) {
    rules = { tools: [], bashPrefixes: [] };
    threadRules.set(threadId, rules);
  }
  return rules;
}

/** Is this call covered by a rule already remembered for the thread or project? */
export function ruleAllows(input: { threadId: string; projectId: string; name: string; args: unknown }): boolean {
  const args = (input.args ?? {}) as { command?: unknown };
  const candidates = [threadOf(input.threadId), projectRules(input.projectId)];
  if (input.name === "bash") {
    const command = typeof args.command === "string" ? args.command : "";
    if (!command.trim() || CHAINING.test(command)) return false;
    return candidates.some((r) => r.bashPrefixes.some((p) => command.trim() === p || command.trim().startsWith(`${p} `)));
  }
  return candidates.some((r) => r.tools.includes(input.name));
}

/**
 * Remembers an approval for the scope. Returns false when nothing could be
 * remembered (a bash command that chains, for instance); the call is still approved
 * for this one time.
 */
export function rememberApproval(input: {
  threadId: string;
  projectId: string;
  name: string;
  args: unknown;
  scope: ApprovalScope;
}): boolean {
  if (input.scope === "once") return false;
  const args = (input.args ?? {}) as { command?: unknown };
  const isBash = input.name === "bash";
  let prefix: string | null = null;
  if (isBash) {
    prefix = commandPrefix(typeof args.command === "string" ? args.command : "");
    if (!prefix) return false;
  }
  if (input.scope === "thread") {
    const rules = threadOf(input.threadId);
    if (isBash) rules.bashPrefixes = [...new Set([...rules.bashPrefixes, prefix!])];
    else rules.tools = [...new Set([...rules.tools, input.name])];
    return true;
  }
  const rules = projectRules(input.projectId);
  if (isBash) rules.bashPrefixes = [...new Set([...rules.bashPrefixes, prefix!])];
  else rules.tools = [...new Set([...rules.tools, input.name])];
  saveProjectRules(input.projectId, rules);
  return true;
}

/** The rules that apply to a project and to a thread, for display. */
export function listRules(input: { threadId: string; projectId: string }): { thread: Rules; project: Rules } {
  return { thread: threadOf(input.threadId), project: projectRules(input.projectId) };
}

/** Test helper: forget the in-memory thread rules. */
export function resetThreadRules(threadId?: string): void {
  if (threadId) threadRules.delete(threadId);
  else threadRules.clear();
}
