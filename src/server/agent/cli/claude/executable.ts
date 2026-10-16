/**
 * The Claude Code binary the Agent SDK runs: always the user's own `claude` (their login),
 * passed as `pathToClaudeCodeExecutable`. Never the SDK's bundled copy: a compiled sidecar
 * cannot resolve it (README of @anthropic-ai/claude-agent-sdk), and it is ~250 MB per platform.
 * Windows launcher shims (.cmd/.bat/.ps1) cannot be spawned without a shell, so they are refused.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveExecutable } from "~/lib/agent-cli";

export type ClaudeExecutable = { ok: true; path: string } | { ok: false; error: string };

const WINDOWS_SHIMS = new Set([".cmd", ".bat", ".ps1"]);

export function resolveClaudeExecutable(cliPath: string | null | undefined, platform: NodeJS.Platform = process.platform): ClaudeExecutable {
  const configured = cliPath?.trim() || "";
  const isPath = configured.includes("/") || configured.includes("\\");
  const found = isPath ? (fs.existsSync(configured) ? configured : null) : resolveExecutable(configured || "claude");
  if (!found) {
    return { ok: false, error: `Claude Code tidak ditemukan ("${configured || "claude"}"). Pasang Claude Code atau isi path binary-nya di pengaturan provider.` };
  }
  if (platform === "win32" && WINDOWS_SHIMS.has(path.extname(found).toLowerCase())) {
    return { ok: false, error: `Path Claude Code menunjuk ke skrip peluncur (${path.basename(found)}). Isi path ke claude.exe di pengaturan provider.` };
  }
  return { ok: true, path: found };
}
