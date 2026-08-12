import { spawn } from "node:child_process";
import path from "node:path";
import { eventBus } from "~/server/realtime/events";
import { buildGeneratePrompt, buildGapPrompt, buildTdPrompt, buildOpenapiPrompt, buildRtmPrompt } from "~/lib/agent-prompts";
import { getProjectRoot } from "~/lib/file-router";
import { needsShell, resolveExecutable } from "~/lib/agent-cli";

interface AgentRunConfig {
  sessionId: string;
  command: string;
  mode: "generate" | "gap" | "td" | "openapi" | "rtm";
  fsdFile?: string;
  agentName: string;
  /** Project root to run the agent in (read artifacts from / write outputs to).
   *  Falls back to the dev default root when omitted. */
  root?: string;
  /** Follow-up message that CONTINUES the previous session instead of a fresh run. */
  feedback?: string;
  /** Our sessionId of the run this feedback refers to (maps to the agent CLI's session id). */
  previousSessionId?: string;
}

const RUNNING_AGENTS = new Map<string, { process: ReturnType<typeof spawn>; startTime: number }>();
// Sessions the user explicitly stopped — the `close` handler must NOT report
// them as failures (SIGTERM produces a non-zero exit code that would otherwise
// emit a bogus "✗ Failed: Exited with code -15" after the "stopped" status).
const STOPPED_SESSIONS = new Set<string>();

// Maps OUR sessionId → the agent CLI's session id (opencode `ses_…`, claude
// `session_id`, codex `thread_id`) captured from the JSONL stream, so a
// follow-up "feedback" run can resume the exact same agent session.
const SESSION_IDS = new Map<string, string>();
function captureSessionId(ourId: string, agentSessionId: string | undefined) {
  if (!agentSessionId) return;
  if (SESSION_IDS.size > 50) SESSION_IDS.clear();
  SESSION_IDS.set(ourId, agentSessionId);
}

export function isAgentRunning(sessionId?: string): boolean {
  if (sessionId) return RUNNING_AGENTS.has(sessionId);
  return RUNNING_AGENTS.size > 0;
}

export function getRunningAgents(): { sessionId: string; startTime: number }[] {
  return Array.from(RUNNING_AGENTS.entries()).map(([k, v]) => ({ sessionId: k, startTime: v.startTime }));
}

export async function runAgent(config: AgentRunConfig): Promise<void> {
  const { sessionId, command, mode, fsdFile, agentName, root, feedback, previousSessionId } = config;
  const projectRoot = root || getProjectRoot();

  // Resolve the agent CLI's session id from the previous run so a feedback
  // follow-up resumes the exact session (not a fresh one).
  const resumeId = previousSessionId ? SESSION_IDS.get(previousSessionId) : undefined;

  let prompt: string;
  let args: string[];
  let useJson = false;

  if (feedback && feedback.trim()) {
    // FOLLOW-UP: continue the previous session with the feedback as the message
    // (the agent keeps full context — no need to re-read all artifacts).
    prompt = feedback;
    if (agentName === "opencode") {
      args = ["run", feedback, "--auto", "--format", "json", "--dir", projectRoot];
      if (resumeId) args.push("--session", resumeId);
      else args.push("--continue");
      useJson = true;
    } else if (agentName === "claude") {
      args = ["-p", feedback, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--allowedTools", "Bash,Read,Edit,Glob,Grep,WebFetch", "--permission-mode", "acceptEdits"];
      if (resumeId) args.push("--resume", resumeId);
      else args.push("--continue");
      useJson = true;
    } else if (agentName === "codex") {
      args = resumeId
        ? ["exec", "resume", resumeId, feedback, "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"]
        : ["exec", feedback, "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"];
      useJson = true;
    } else {
      args = ["run", feedback, "--auto"];
    }
  } else {
    // FRESH RUN: build the mode-specific prompt, then the per-agent headless args.
    if (mode === "generate" && fsdFile) {
      prompt = buildGeneratePrompt(fsdFile, agentName, root);
    } else if (mode === "gap" && fsdFile) {
      prompt = buildGapPrompt(fsdFile, agentName, root);
    } else if (mode === "td") {
      prompt = buildTdPrompt(agentName, root);
    } else if (mode === "openapi") {
      prompt = buildOpenapiPrompt(agentName, root);
    } else if (mode === "rtm") {
      prompt = buildRtmPrompt(agentName, root);
    } else {
      eventBus.emitAgentError(sessionId, "Invalid mode or missing fsdFile");
      return;
    }

    if (agentName === "opencode") {
      args = ["run", prompt, "--auto"];
      args.push("--format", "json");
      args.push("--dir", projectRoot);
      useJson = true;
    } else if (agentName === "claude") {
      args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--allowedTools", "Bash,Read,Edit,Glob,Grep,WebFetch", "--permission-mode", "acceptEdits"];
      useJson = true;
    } else if (agentName === "codex") {
      args = ["exec", prompt, "--json", "--sandbox", "workspace-write", "--skip-git-repo-check"];
      useJson = true;
    } else {
      args = ["run", prompt, "--auto"];
    }
  }

  eventBus.emitAgentStatus(sessionId, "running", feedback ? "Melanjutkan dengan feedback…" : "Starting agent...");
  // Compact spawn description — NEVER dump the prompt (it can be tens of KB and
  // would flood the AgentStream panel as a giant wall of text).
  const compactArgs = args.map((a) => {
    if (a === prompt) return `<prompt:${prompt.length} chars>`;
    return a.length > 100 ? `${a.slice(0, 80)}…` : a;
  }).join(" ");
  eventBus.emitAgentLog("info", `Spawning: ${command} ${compactArgs}`, sessionId);

  try {
    // Resolve the actual executable: on Windows the agent may be installed as
    // <name>.exe or <name>.cmd (a shell script). spawn() cannot execute a bare
    // .cmd name without shell:true, so resolve the absolute path and let
    // needsShell() decide whether to run it through cmd.exe. With a shell,
    // the executable path must be quoted manually ("C:\Program Files\..."
    // would otherwise be split at the first space).
    const exePath = resolveExecutable(command) || command;
    const runnable = needsShell(exePath) ? `"${exePath}"` : exePath;

    // Clean up orphaned `opencode run` children of this server (left by SSR
    // module reloads wiping RUNNING_AGENTS) so restarts never accumulate
    // hung processes.
    try {
      const { killUntrackedAgentChildren } = await import("~/server/system-instances");
      const tracked = new Set(Array.from(RUNNING_AGENTS.values()).map((a) => a.process.pid).filter((p): p is number => !!p));
      const killed = killUntrackedAgentChildren(process.pid, tracked);
      if (killed > 0) eventBus.emitAgentLog("info", `membersihkan ${killed} proses opencode yatim`, sessionId);
    } catch {}

    const proc = spawn(runnable, args, {
      cwd: projectRoot,
      env: { ...process.env, PATH: process.env.PATH || "" },
      // CRITICAL: stdin MUST be "ignore", not a pipe. An open stdin pipe that is
      // never written to/closed makes opencode hang with ZERO stdout (the model
      // call blocks waiting on stdin) — empirically reproduced: spawn with
      // stdin=pipe → no output for 100s+; stdin=ignore → output in ~40s. None
      // of the headless invocations need stdin (prompt is an argv arg).
      stdio: ["ignore", "pipe", "pipe"],
      shell: needsShell(exePath),
      windowsHide: true,
    });

    RUNNING_AGENTS.set(sessionId, { process: proc, startTime: Date.now() });

    // Stall watchdog: if opencode produces no stdout for a while (model cold
    // start / provider busy / contention), surface it in the stream instead of
    // letting the UI show silence (only keepalives). Repeats every ~45s while
    // silent — frequent enough to confirm it's alive, sparse enough to not spam.
    let lastStdout = Date.now();
    let lastWarn = 0;
    const stallTimer = setInterval(() => {
      const silent = Math.round((Date.now() - lastStdout) / 1000);
      if (silent >= 45 && Date.now() - lastWarn > 45000) {
        lastWarn = Date.now();
        eventBus.emitAgentLog("info", `agent masih berjalan (${silent}s tanpa output) — model/provider sedang sibuk atau ada sesi agent lain yang berbagi model.`, sessionId);
      }
    }, 10000);
    const clearStall = () => clearInterval(stallTimer);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      lastStdout = Date.now();

      if (useJson) {
        // Parse the JSONL event stream for the current agent. Each CLI has its
        // own event shape — see parseAgentLine below.
        for (const line of text.split("\n").filter(Boolean)) {
          try {
            const json = JSON.parse(line);
            // Capture the agent CLI's session id so a follow-up "feedback" run
            // can resume the exact session (opencode `sessionID`, claude
            // `session_id`, codex `thread_id`).
            const agentSid = json.sessionID ?? json.session_id ?? json.thread_id;
            if (agentSid) captureSessionId(sessionId, agentSid);
            const parsed = parseAgentLine(agentName, json);
            if (parsed) eventBus.emitAgentLog(parsed.level, parsed.message, sessionId);
          } catch {
            const trimmed = line.trim();
            if (trimmed) eventBus.emitAgentLog("output", trimmed, sessionId);
          }
        }
      } else {
        // Raw output for unknown agents
        eventBus.emitAgentLog("output", text, sessionId);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      // opencode emits timestamped `level=INFO` boot logs to stderr ("creating
      // instance", "loading config", ...) — pure noise for the UI. Forward only
      // non-INFO lines (warnings/errors) so the stream stays useful.
      const text = chunk.toString("utf-8");
      const kept = text.split("\n").filter((l) => {
        const t = l.trim();
        if (!t) return false;
        if (/level=INFO/.test(t)) return false;
        return true;
      }).join("\n");
      if (kept.trim()) eventBus.emitAgentLog("stderr", kept, sessionId);
    });

    proc.on("close", (code) => {
      clearStall();
      RUNNING_AGENTS.delete(sessionId);
      if (STOPPED_SESSIONS.has(sessionId)) {
        STOPPED_SESSIONS.delete(sessionId);
        return; // "stopped" status already emitted by stopAgent
      }
      if (code === 0) {
        eventBus.emitAgentStatus(sessionId, "completed", "Analysis complete");
        eventBus.emitAgentDone(sessionId);
      } else {
        eventBus.emitAgentError(sessionId, `Agent exited with code ${code}`);
        eventBus.emitAgentStatus(sessionId, "failed", `Exited with code ${code}`);
      }
    });

    proc.on("error", (err) => {
      clearStall();
      RUNNING_AGENTS.delete(sessionId);
      if (STOPPED_SESSIONS.has(sessionId)) {
        STOPPED_SESSIONS.delete(sessionId);
        return;
      }
      eventBus.emitAgentError(sessionId, err.message);
      eventBus.emitAgentStatus(sessionId, "failed", err.message);
    });

  } catch (err: any) {
    eventBus.emitAgentError(sessionId, err.message);
    eventBus.emitAgentStatus(sessionId, "failed", err.message);
  }
}

export function stopAgent(sessionId?: string): boolean {
  // Safety: any entry here belongs to a process that either already closed
  // (removed in `close`) or is about to — never grow without bound.
  if (STOPPED_SESSIONS.size > 100) STOPPED_SESSIONS.clear();
  if (sessionId) {
    const agent = RUNNING_AGENTS.get(sessionId);
    if (!agent) return false;
    STOPPED_SESSIONS.add(sessionId);
    agent.process.kill("SIGTERM");
    RUNNING_AGENTS.delete(sessionId);
    eventBus.emitAgentStatus(sessionId, "stopped", "Manually stopped");
    return true;
  }
  // Stop all
  for (const [sid, agent] of RUNNING_AGENTS) {
    STOPPED_SESSIONS.add(sid);
    agent.process.kill("SIGTERM");
    eventBus.emitAgentStatus(sid, "stopped", "Manually stopped");
  }
  RUNNING_AGENTS.clear();
  return true;
}

function truncate(s: unknown, n = 140): string {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + "…" : str;
}

/** Build a SHORT tool log from the raw tool input — never embed the full JSON
 *  (write/edit content, old/new strings, etc.). Emit only the useful field per
 *  tool so the UI shows `write: output/spec/openapi.yaml`, not a JSON blob. */
function conciseTool(name: string, input: unknown): string {
  let obj: any = input;
  if (typeof input === "string") {
    try { obj = JSON.parse(input); } catch { /* keep raw string */ }
  }
  if (obj && typeof obj === "object") {
    switch (name) {
      case "write":
      case "edit":
      case "read":
      case "create":
      case "patch":
        return `${name}: ${obj.filePath ?? obj.file_path ?? obj.path ?? obj.file ?? ""}`;
      case "bash":
      case "run":
        return `${name}: ${truncate(obj.command ?? "", 120)}`;
      case "glob":
      case "list":
      case "ls":
        return `${name}: ${obj.pattern ?? obj.path ?? ""}`;
      case "todowrite":
      case "todo":
      case "update_todo":
        return `${name}: ${Array.isArray(obj.todos) ? obj.todos.length : 0} todos`;
      case "grep":
      case "search":
        return `${name}: ${obj.pattern ?? obj.query ?? ""}`;
      case "webfetch":
      case "fetch":
        return `${name}: ${obj.url ?? obj.query ?? ""}`;
      default:
        return `${name}: ${truncate(JSON.stringify(obj), 120)}`;
    }
  }
  return `${name}: ${truncate(String(obj ?? ""), 140)}`;
}

/**
 * Map one JSONL event line from an agent CLI to a UI log entry.
 * Returns null for events that carry nothing worth showing.
 *
 *  - opencode `--format json`: { type:"text|reasoning|tool_use", part:{...} }
 *  - claude  `--output-format stream-json`: stream_event (text_delta),
 *    assistant (thinking/tool_use/text blocks), result (final)
 *  - codex   `--json`: item.started/item.completed (agent_message/reasoning/
 *    command_execution/file_change), error
 */
function parseAgentLine(agentName: string, json: any): { level: string; message: string } | null {
  if (agentName === "opencode") {
    const t = json.type;
    const part = json.part ?? {};
    if (t === "text" || t === "reasoning" || t === "thinking") {
      const content = part.text ?? part.content ?? json.content ?? "";
      return content.trim() ? { level: t === "text" ? "output" : "think", message: content } : null;
    } else if (t === "tool_use") {
      const tool = part.tool ?? part.name ?? json.name ?? "tool";
      const input = part.state?.input ?? part.input ?? json.input;
      return { level: "tool", message: conciseTool(tool, input) };
    } else if (t === "answer") {
      const content = part.text ?? part.content ?? json.content ?? "";
      return content.trim() ? { level: "output", message: content } : null;
    }
    return null;
  }

  if (agentName === "claude") {
    if (json.type === "stream_event") {
      const delta = json.event?.delta;
      if (delta?.type === "text_delta" && delta.text) return { level: "output", message: delta.text };
      return null;
    }
    if (json.type === "result") {
      return json.result ? { level: "output", message: String(json.result) } : null;
    }
    if (json.type === "assistant") {
      for (const block of json.message?.content ?? []) {
        if (block.type === "thinking" && block.thinking) return { level: "think", message: block.thinking };
        if (block.type === "tool_use") {
          return { level: "tool", message: conciseTool(block.name, block.input) };
        }
        if (block.type === "text" && block.text) return { level: "output", message: block.text };
      }
      return null;
    }
    return null;
  }

  if (agentName === "codex") {
    if (json.type === "item.started" || json.type === "item.completed") {
      const item = json.item ?? {};
      if (item.type === "agent_message" && item.text) return { level: "output", message: item.text };
      if (item.type === "reasoning" && item.text) return { level: "think", message: item.text };
      if (item.type === "command_execution") {
        return { level: "tool", message: `bash: ${item.command ?? ""} (${item.status ?? "…"})` };
      }
      if (item.type === "file_change" && item.file_path) return { level: "tool", message: `file: ${item.file_path}` };
      return null;
    }
    if (json.type === "error") return { level: "error", message: json.message ?? String(json) };
    return null;
  }

  return null;
}
