/**
 * Codex app-server notifications for one thread → AI SDK `TextStreamPart`s. Items are keyed
 * by their `id`; a command is a `bash` tool (its output and exit code in the result). The
 * turn's end emits the finish. Notifications of other threads are dropped here too.
 */
import type { LanguageModelUsage, TextStreamPart, ToolSet } from "~/server/agent/ai";
import { toolOutputText } from "~/server/agent/cli/opencode/stream-mapper";
import type { RpcNotification } from "./rpc";

type Part = TextStreamPart<ToolSet>;

export function createCodexMapper(threadId: string, modelId: string) {
  void modelId; // reserved for finish-step metadata; the turn's finish does not need it yet
  let started = false;
  let done = false;
  let input: number | null = null;
  let output: number | null = null;
  const toolInput = new Map<string, unknown>();
  const begin = (): Part[] => {
    if (started) return [];
    started = true;
    return [{ type: "start" } as Part];
  };
  const totalUsage = (): LanguageModelUsage =>
    ({ inputTokens: input ?? undefined, outputTokens: output ?? undefined, totalTokens: input !== null || output !== null ? (input ?? 0) + (output ?? 0) : undefined, inputTokenDetails: {}, outputTokenDetails: {} }) as any;

  return {
    get done() {
      return done;
    },
    usage() {
      return { inputTokens: input, outputTokens: output };
    },
    map(n: RpcNotification): Part[] {
      if (done || n.params?.threadId !== threadId) return [];
      const p = n.params ?? {};
      switch (n.method) {
        case "item/started": {
          const item = p.item ?? {};
          if (item.type === "agentMessage") return [...begin(), { type: "text-start", id: item.id } as Part];
          if (item.type === "commandExecution") {
            toolInput.set(item.id, { command: item.command });
            return [...begin(), { type: "tool-input-start", id: item.id, toolName: "bash", dynamic: true } as Part, { type: "tool-call", toolCallId: item.id, toolName: "bash", input: { command: item.command }, dynamic: true } as Part];
          }
          return begin();
        }
        case "item/agentMessage/delta":
          return [{ type: "text-delta", id: p.itemId, text: String(p.delta ?? "") } as Part];
        case "item/completed": {
          const item = p.item ?? {};
          if (item.type === "agentMessage") return [{ type: "text-end", id: item.id } as Part];
          if (item.type === "commandExecution") {
            if (item.status === "declined" || item.status === "failed") {
              return [{ type: "tool-error", toolCallId: item.id, toolName: "bash", input: toolInput.get(item.id) ?? {}, error: item.status === "declined" ? "Perintah ditolak." : "Perintah gagal.", dynamic: true } as Part];
            }
            const out = `${item.aggregatedOutput ?? ""}${item.exitCode !== undefined && item.exitCode !== null ? `\nexit=${item.exitCode}` : ""}`;
            return [{ type: "tool-result", toolCallId: item.id, toolName: "bash", input: toolInput.get(item.id) ?? {}, output: toolOutputText(out), dynamic: true } as Part];
          }
          return [];
        }
        case "thread/tokenUsage/updated": {
          const t = p.tokenUsage?.total ?? p.tokenUsage ?? {};
          if (typeof t.inputTokens === "number") input = t.inputTokens;
          if (typeof t.outputTokens === "number") output = t.outputTokens;
          return [];
        }
        case "turn/completed": {
          const turn = p.turn ?? {};
          if (turn.status === "interrupted") return this.finish({ aborted: true });
          if (turn.status === "failed") return this.finish({ error: new Error(String(turn.error?.message ?? "Codex gagal menjalankan permintaan.")) });
          return this.finish({});
        }
        default:
          return [];
      }
    },
    finish(opts: { aborted?: boolean; error?: unknown } = {}): Part[] {
      done = true;
      const parts = begin();
      if (opts.aborted) return [...parts, { type: "abort" } as Part];
      if (opts.error) return [...parts, { type: "error", error: opts.error } as Part, { type: "finish", finishReason: "error", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
      return [...parts, { type: "finish", finishReason: "stop", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
    },
  };
}
