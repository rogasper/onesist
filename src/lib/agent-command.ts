export type AgentCli = "opencode" | "claude" | "codex";

export interface AgentCommandOpts {
  mode: "new" | "resume";
  sessionId?: string;
  prompt?: string;
  model?: string;
  cwd?: string;
}

function isOpencodeSessionId(id: string): boolean {
  return id.startsWith("ses_");
}

function quoteArg(arg: string): string {
  if (!/[ \t"$`\\]/.test(arg)) return arg;
  return JSON.stringify(arg);
}

export function buildAgentCommand(cli: AgentCli, opts: AgentCommandOpts): string {
  switch (cli) {
    case "opencode": {
      const parts = ["opencode"];
      if (opts.prompt) {
        return `opencode run ${quoteArg(opts.prompt)}`;
      }
      if (opts.model) parts.push("--model", opts.model);
      if (opts.mode === "resume" && opts.sessionId && isOpencodeSessionId(opts.sessionId)) {
        parts.push("--session", opts.sessionId);
      }
      return parts.join(" ");
    }
    case "claude": {
      if (opts.prompt) {
        return `claude -p ${quoteArg(opts.prompt)}`;
      }
      const parts = ["claude"];
      if (opts.model) parts.push("--model", opts.model);
      if (opts.mode === "resume" && opts.sessionId) {
        parts.push("--resume", opts.sessionId);
      }
      return parts.join(" ");
    }
    case "codex": {
      if (opts.prompt) {
        return `codex exec ${quoteArg(opts.prompt)}`;
      }
      const parts = ["codex"];
      if (opts.mode === "resume" && opts.sessionId) {
        parts.push("resume", opts.sessionId);
      } else {
        parts.push("--enable", "hooks");
      }
      if (opts.model) parts.push("--model", opts.model);
      return parts.join(" ");
    }
  }
}

export function buildSpawnMessage(cli: AgentCli, opts: AgentCommandOpts) {
  const command = buildAgentCommand(cli, opts);
  const id = opts.sessionId || crypto.randomUUID();
  return {
    id,
    command,
    cwd: opts.cwd || process.cwd(),
    cli,
    mode: opts.mode,
  };
}

export const AGENT_LABELS: Record<AgentCli, string> = {
  opencode: "OpenCode",
  claude: "Claude Code",
  codex: "Codex",
};

export const AGENT_DETECT_ORDER: AgentCli[] = ["opencode", "claude", "codex"];
