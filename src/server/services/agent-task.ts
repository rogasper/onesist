/**
 * Generate tasks that run as chat threads (they used to run through agent-runner). The
 * prompts are the same ones the old runner sent; the thread runs on the chat's default
 * provider, native or CLI, and writes the artifacts with its own tools.
 */
import { buildOpenapiPrompt, buildRtmPrompt, buildSitPrompt } from "~/lib/agent-prompts";

export const AGENT_TASK_MODES = ["openapi", "rtm", "sit"] as const;
export type AgentTaskMode = (typeof AGENT_TASK_MODES)[number];

const TITLES: Record<AgentTaskMode, string> = {
  openapi: "Generate OpenAPI",
  rtm: "Generate RTM",
  sit: "Generate SIT",
};

/** Named in the prompt's "Running via" line, where the old runner put the CLI's name. */
const RUNNER_NAME = "Onesist chat";

export function isAgentTaskMode(value: unknown): value is AgentTaskMode {
  return typeof value === "string" && (AGENT_TASK_MODES as readonly string[]).includes(value);
}

export function buildAgentTask(root: string, input: { mode: AgentTaskMode; fsd?: string; fds?: string[] }): { title: string; text: string } {
  if (input.mode === "openapi") return { title: TITLES.openapi, text: buildOpenapiPrompt(RUNNER_NAME, root) };
  if (input.mode === "sit") return { title: TITLES.sit, text: buildSitPrompt(RUNNER_NAME, root) };
  return {
    title: input.fsd ? `${TITLES.rtm} · ${input.fsd}` : TITLES.rtm,
    text: buildRtmPrompt(RUNNER_NAME, root, input.fsd, input.fds),
  };
}
