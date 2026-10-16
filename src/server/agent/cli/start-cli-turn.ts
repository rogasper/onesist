/**
 * Where the chat route hands a turn to a CLI runtime instead of the native agent.
 * Pictures are not sent to CLI agents yet. The session the turn runs in, and what it is
 * told before the new message, come from prepare-turn.ts (Fase 4A).
 */
import { parseModelOptions } from "~/lib/model-options";
import type { UIMessage } from "~/server/agent/ai";
import type { ProviderRow } from "~/server/agent/config";
import { cliRuntimeFor } from "~/server/agent/runtime/registry";
import type { CliRuntime, CliTurn } from "~/server/agent/runtime/types";
import { appendMessage, saveProviderSession, updateThread, type ThreadRow } from "~/server/agent/store";
import { mcpEndpointUrl } from "~/server/mcp/snippets";
import { getMcpToken } from "~/server/mcp/token";
import { selfOrigin } from "~/server/self-origin";
import { prepareCliTurn } from "./prepare-turn";

export function textOfMessage(message: { parts?: unknown[] } | undefined): string {
  return (message?.parts ?? [])
    .map((p: any) => (p?.type === "text" && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** The target model's context window, from the runtime's (cached) model list; null when unknown. */
async function contextWindowOf(runtime: CliRuntime, provider: ProviderRow, model: string | null): Promise<number | null> {
  if (!model) return null;
  try {
    return (await runtime.listModels(provider)).find((m) => m.id === model)?.contextWindow ?? null;
  } catch {
    return null;
  }
}

export async function startCliTurn(
  input: {
    runId: string;
    thread: ThreadRow;
    root: string;
    provider: ProviderRow;
    lastUser: UIMessage | undefined;
  },
  /** For tests: a runtime instead of the provider's own. */
  runtimeOverride?: CliRuntime,
): Promise<CliTurn> {
  const runtime = runtimeOverride ?? cliRuntimeFor(input.provider);
  if (!runtime) {
    throw new Error(`Provider CLI "${input.provider.cliAgent ?? "?"}" belum didukung di chat. Saat ini baru OpenCode dan Antigravity.`);
  }
  const userText = textOfMessage(input.lastUser as any);
  if (!userText) throw new Error("Provider CLI baru menerima pesan teks; gambar belum didukung.");
  const { thread, provider } = input;

  const prepared = prepareCliTurn({
    thread,
    providerId: provider.id,
    userText,
    userMessageId: typeof (input.lastUser as any)?.id === "string" ? (input.lastUser as any).id : null,
    contextWindow: await contextWindowOf(runtime, provider, thread.model ?? provider.model ?? null),
  });

  let sessionId = prepared.sessionId;
  const turn = await runtime.startTurn({
    runId: input.runId,
    thread,
    root: input.root,
    provider,
    text: prepared.text,
    sessionId,
    onSessionCreated: (id) => {
      sessionId = id;
    },
    modelOptions: parseModelOptions(thread.modelOptionsJson),
    mcp: onesistMcpFor(thread.projectId),
  });

  // The runtime took the prompt: the session has now seen the thread up to the new message.
  if (sessionId) {
    saveProviderSession(thread.id, provider.id, sessionId, prepared.currentSeq);
    updateThread(thread.id, { cliSessionId: sessionId });
  }
  if (prepared.transition.kind === "handoff" || prepared.transition.kind === "delta") {
    appendMessage({
      threadId: thread.id,
      role: "system",
      kind: "handoffNotice",
      parts: [
        {
          type: "data-notice",
          data: { kind: "handoff", mode: prepared.transition.kind, provider: provider.name, included: prepared.included, omitted: prepared.omitted },
        },
      ],
    });
  }
  return turn;
}

/** Onesist's MCP endpoint for a project, once a loopback origin has been seen. */
function onesistMcpFor(projectId: string): { url: string; token: string } | null {
  const origin = selfOrigin();
  return origin ? { url: mcpEndpointUrl(origin, projectId), token: getMcpToken() } : null;
}
