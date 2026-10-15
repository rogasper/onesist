/**
 * Where the chat route hands a turn to a CLI agent instead of the native agent.
 * Only OpenCode is wired in Fase 3A; pictures are not sent to CLI agents yet.
 */
import type { UIMessage } from "~/server/agent/ai";
import type { ProviderRow } from "~/server/agent/config";
import { updateThread, type ThreadRow } from "~/server/agent/store";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { openCodeTargetOf } from "./opencode/target";
import { startOpenCodeTurn, type OpenCodeTurn } from "./opencode/turn";

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
}): Promise<OpenCodeTurn> {
  const { thread, provider } = input;
  if (provider.cliAgent !== "opencode") {
    throw new Error(`Provider CLI "${provider.cliAgent ?? "?"}" belum didukung di chat. Saat ini baru OpenCode.`);
  }
  const text = textOfMessage(input.lastUser as any);
  if (!text) throw new Error("Provider CLI baru menerima pesan teks; gambar belum didukung.");
  return startOpenCodeTurn({
    runId: input.runId,
    threadId: thread.id,
    projectId: thread.projectId,
    root: input.root,
    ...openCodeTargetOf(provider),
    permissionMode: thread.permissionMode as PermissionMode,
    threadMode: thread.mode as ThreadMode,
    model: thread.model ?? provider.model ?? null,
    text,
    title: thread.title,
    cliSessionId: thread.cliSessionId ?? null,
    onSessionCreated: (sessionId) => updateThread(thread.id, { cliSessionId: sessionId }),
  });
}
