/**
 * The contract a CLI chat runtime fulfils. Fase 3B covers what the app uses today:
 * status, models with their options, one turn, and capability flags. Steer, fork,
 * resume and the other methods of plan D arrive with the runtimes that need them.
 * The native agent is not behind this contract yet: the chat route runs it directly
 * (compaction, BYOK), and the registry only reports its capabilities.
 */
import type { TextStreamPart, ToolSet } from "~/server/agent/ai";
import type { ProviderRow } from "~/server/agent/config";
import type { ThreadRow } from "~/server/agent/store";
import type { ModelOptionDescriptor, ModelOptions, RuntimeCapabilities, RuntimeStatus } from "~/lib/runtime-types";

export type RuntimeId = "native" | "opencode";

export interface RuntimeModel {
  /** As stored on a thread: `provider/model` for OpenCode. */
  id: string;
  name: string;
  options: ModelOptionDescriptor[];
  /** Context window in tokens; null when the runtime does not say. Sizes a handoff (Fase 4A). */
  contextWindow: number | null;
}

export interface CliTurnInput {
  runId: string;
  thread: ThreadRow;
  root: string;
  provider: ProviderRow;
  /** The new user message; the CLI keeps the earlier conversation in its own session. */
  text: string;
  /** The provider's session for this thread (chat_provider_sessions); null = start a new one. */
  sessionId: string | null;
  /** Called once when the runtime creates a new session. */
  onSessionCreated: (sessionId: string) => void;
  modelOptions: ModelOptions;
  /** Onesist's MCP endpoint for this project, or null when it cannot be offered safely. */
  mcp: { url: string; token: string } | null;
}

export interface CliTurn {
  stream: ReadableStream<TextStreamPart<ToolSet>>;
  usage: Promise<{ inputTokens: number | null; outputTokens: number | null }>;
}

export interface CliRuntime {
  id: Exclude<RuntimeId, "native">;
  capabilities: RuntimeCapabilities;
  probe(provider: ProviderRow): Promise<RuntimeStatus>;
  listModels(provider: ProviderRow, opts?: { force?: boolean }): Promise<RuntimeModel[]>;
  startTurn(input: CliTurnInput): Promise<CliTurn>;
  /** A copy of a session with its whole history, when the runtime can fork natively (Fase 4B). */
  forkSession?(provider: ProviderRow, sessionId: string): Promise<string>;
}
