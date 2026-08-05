import { spawn } from "node:child_process";
import path from "node:path";
import { eventBus } from "~/server/events";
import { buildGeneratePrompt, buildGapPrompt, buildTdPrompt, buildOpenapiPrompt } from "~/lib/agent-prompts";
import { getProjectRoot } from "~/lib/file-router";

interface AgentRunConfig {
  sessionId: string;
  command: string;
  mode: "generate" | "gap" | "td" | "openapi";
  fsdFile?: string;
  agentName: string;
}

const RUNNING_AGENTS = new Map<string, { process: ReturnType<typeof spawn>; startTime: number }>();

export function isAgentRunning(sessionId?: string): boolean {
  if (sessionId) return RUNNING_AGENTS.has(sessionId);
  return RUNNING_AGENTS.size > 0;
}

export function getRunningAgents(): { sessionId: string; startTime: number }[] {
  return Array.from(RUNNING_AGENTS.entries()).map(([k, v]) => ({ sessionId: k, startTime: v.startTime }));
}

export async function runAgent(config: AgentRunConfig): Promise<void> {
  const { sessionId, command, mode, fsdFile, agentName } = config;
  const projectRoot = getProjectRoot();

  let prompt: string;
  if (mode === "generate" && fsdFile) {
    prompt = buildGeneratePrompt(fsdFile, agentName);
  } else if (mode === "gap" && fsdFile) {
    prompt = buildGapPrompt(fsdFile, agentName);
  } else if (mode === "td") {
    prompt = buildTdPrompt(agentName);
  } else if (mode === "openapi") {
    prompt = buildOpenapiPrompt(agentName);
  } else {
    eventBus.emitAgentError(sessionId, "Invalid mode or missing fsdFile");
    return;
  }

  // Determine whether to use --format json or not based on agent
  const useJson = agentName === "opencode";
  const args = ["run", prompt, "--auto", "--print-logs"];

  if (useJson) args.push("--format", "json");
  args.push("--dir", projectRoot);

  eventBus.emitAgentStatus(sessionId, "running", "Starting agent...");
  eventBus.emitAgentLog("info", `Spawning: ${command} ${args.slice(0, 3).join(" ")}...`, sessionId);

  try {
    const proc = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, PATH: process.env.PATH || "" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    RUNNING_AGENTS.set(sessionId, { process: proc, startTime: Date.now() });

    let outputBuffer = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      outputBuffer += text;

      if (useJson) {
        // Parse JSON lines for opencode
        for (const line of text.split("\n").filter(Boolean)) {
          try {
            const json = JSON.parse(line);
            if (json.type === "thinking" || json.type === "text") {
              eventBus.emitAgentLog("think", json.content || "", sessionId);
            } else if (json.type === "tool_use") {
              eventBus.emitAgentLog("tool", `${json.name}: ${(json.input || "")}`, sessionId);
            } else if (json.type === "answer") {
              eventBus.emitAgentLog("output", json.content || "", sessionId);
            }
          } catch {
            eventBus.emitAgentLog("output", text, sessionId);
          }
        }
      } else {
        // Raw output for other agents
        eventBus.emitAgentLog("output", text, sessionId);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      eventBus.emitAgentLog("stderr", chunk.toString("utf-8"), sessionId);
    });

    proc.on("close", (code) => {
      RUNNING_AGENTS.delete(sessionId);
      if (code === 0) {
        eventBus.emitAgentStatus(sessionId, "completed", "Analysis complete");
        eventBus.emitAgentDone(sessionId);
      } else {
        eventBus.emitAgentError(sessionId, `Agent exited with code ${code}`);
        eventBus.emitAgentStatus(sessionId, "failed", `Exited with code ${code}`);
      }
    });

    proc.on("error", (err) => {
      RUNNING_AGENTS.delete(sessionId);
      eventBus.emitAgentError(sessionId, err.message);
      eventBus.emitAgentStatus(sessionId, "failed", err.message);
    });

  } catch (err: any) {
    eventBus.emitAgentError(sessionId, err.message);
    eventBus.emitAgentStatus(sessionId, "failed", err.message);
  }
}

export function stopAgent(sessionId?: string): boolean {
  if (sessionId) {
    const agent = RUNNING_AGENTS.get(sessionId);
    if (!agent) return false;
    agent.process.kill("SIGTERM");
    RUNNING_AGENTS.delete(sessionId);
    eventBus.emitAgentStatus(sessionId, "stopped", "Manually stopped");
    return true;
  }
  // Stop all
  for (const [sid, agent] of RUNNING_AGENTS) {
    agent.process.kill("SIGTERM");
    eventBus.emitAgentStatus(sid, "stopped", "Manually stopped");
  }
  RUNNING_AGENTS.clear();
  return true;
}
