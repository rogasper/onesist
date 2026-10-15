/**
 * "Lanjutkan di terminal": the command that opens an OpenCode thread's session in the
 * TUI. Sessions Onesist's own `opencode serve` creates are visible to the user's
 * OpenCode background service (shared storage, checked 2026-10-15 on 2.0.29), so plain
 * `opencode --session <id>` in the project folder continues the thread.
 * A thread in a worktree (Fase 4C) changes directory there first, because its session was made there. Nothing but a
 * well-formed session id and the (quoted) binary reaches the command line.
 */
import type { ProviderRow } from "~/server/agent/config";

const SESSION_ID = /^ses_[A-Za-z0-9]+$/;

function quoteArg(arg: string): string {
  return /[\s"$`\\'&|;<>()]/.test(arg) ? JSON.stringify(arg) : arg;
}

/** A POSIX single-quoted argument: nothing inside is expanded. */
function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function terminalResumeCommand(
  provider: Pick<ProviderRow, "apiStyle" | "cliAgent" | "cliPath">,
  sessionId: string | null,
  /** Fase 4C: the thread's workspace when it is not the project root (the terminal starts there). */
  cwd: string | null = null,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (provider.apiStyle !== "cli" || provider.cliAgent !== "opencode") return null;
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;
  const resume = `${quoteArg(provider.cliPath?.trim() || "opencode")} --session ${sessionId}`;
  if (!cwd) return resume;
  if (platform === "win32") {
    // cmd expands %VAR% even inside quotes, and a path cannot hold a quote: refuse rather than guess.
    if (/["%]/.test(cwd)) return null;
    return `cd /d "${cwd}" && ${resume}`;
  }
  return `cd ${shellQuote(cwd)} && ${resume}`;
}
