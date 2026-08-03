import { execSync } from "node:child_process";

export interface AgentCliConfig {
  name: string;
  command: string;
  minVersion: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

const AGENTS: { name: string; command: string; minVersion: string }[] = [
  { name: "opencode", command: "opencode", minVersion: "1.0.0" },
  { name: "claude-code", command: "claude", minVersion: "2.0.0" },
  { name: "codex", command: "codex", minVersion: "0.1.0" },
];

export function detectAllAgents(): AgentCliConfig[] {
  return AGENTS.map((agent) => {
    try {
      const path = execSync(`which ${agent.command} 2>/dev/null`, { encoding: "utf-8" }).trim();
      if (!path) return { ...agent, found: false, version: null, path: null };
      let version: string | null = null;
      try {
        version = execSync(`${agent.command} --version 2>/dev/null`, { encoding: "utf-8" }).trim().split("\n")[0] || null;
      } catch {}
      return { ...agent, found: true, version, path };
    } catch {
      return { ...agent, found: false, version: null, path: null };
    }
  });
}

export function findFirstAvailableAgent(): AgentCliConfig | null {
  return detectAllAgents().find((a) => a.found) ?? null;
}
