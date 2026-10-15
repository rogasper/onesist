/**
 * "Lanjutkan di terminal": the command that opens an OpenCode thread's session in the
 * TUI. Sessions Onesist's own `opencode serve` creates are visible to the user's
 * OpenCode background service (shared storage, checked 2026-10-15 on 2.0.29), so plain
 * `opencode --session <id>` in the project folder continues the thread. Nothing but a
 * well-formed session id and the (quoted) binary reaches the command line.
 */
import type { ProviderRow } from "~/server/agent/config";

const SESSION_ID = /^ses_[A-Za-z0-9]+$/;

function quoteArg(arg: string): string {
  return /[\s"$`\\'&|;<>()]/.test(arg) ? JSON.stringify(arg) : arg;
}

export function terminalResumeCommand(
  provider: Pick<ProviderRow, "apiStyle" | "cliAgent" | "cliPath">,
  sessionId: string | null,
): string | null {
  if (provider.apiStyle !== "cli" || provider.cliAgent !== "opencode") return null;
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;
  return `${quoteArg(provider.cliPath?.trim() || "opencode")} --session ${sessionId}`;
}
