/**
 * Where the chat route hands a turn to a CLI runtime instead of the native agent.
 * Pictures are not sent to CLI agents yet.
 */
import { parseModelOptions } from "~/lib/model-options";
import type { UIMessage } from "~/server/agent/ai";
import type { ProviderRow } from "~/server/agent/config";
import { cliRuntimeFor } from "~/server/agent/runtime/registry";
import type { CliTurn } from "~/server/agent/runtime/types";
import type { ThreadRow } from "~/server/agent/store";

export function textOfMessage(message: { parts?: unknown[] } | undefined): string {
  return (message?.parts ?? [])
    .map((p: any) => (p?.type === "text" && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function startCliTurn(input: {
  runId: string;
  thread: ThreadRow;
  root: string;
  provider: ProviderRow;
  lastUser: UIMessage | undefined;
}): Promise<CliTurn> {
  const runtime = cliRuntimeFor(input.provider);
  if (!runtime) {
    throw new Error(`Provider CLI "${input.provider.cliAgent ?? "?"}" belum didukung di chat. Saat ini baru OpenCode.`);
  }
  const text = textOfMessage(input.lastUser as any);
  if (!text) throw new Error("Provider CLI baru menerima pesan teks; gambar belum didukung.");
  return runtime.startTurn({
    runId: input.runId,
    thread: input.thread,
    root: input.root,
    provider: input.provider,
    text,
    modelOptions: parseModelOptions(input.thread.modelOptionsJson),
    mcp: null,
  });
}
