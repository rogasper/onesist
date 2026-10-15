/**
 * Bringing a branch's work back to its parent (Fase 4B, t3code `merge_back` /
 * `fork_delta_summary`). Not a transcript copy: the branch's own messages since the last
 * merge go through the 4A handoff rules (budget, priority, shell commands only, pointer to
 * `onesist_thread_read`) and land in the parent as one user message framed as history, with
 * a divider. A native parent reads it with its history; a CLI parent's session receives it
 * in the next delta. Merging never starts a run, and never lands in the middle of one.
 */
import { handoffBudgetBytes, handoffItemsFromRows, renderHandoff, selectHandoffItems } from "~/server/agent/handoff";
import { getRunForThread } from "~/server/agent/run-registry";
import { appendMessage, getThread, latestSeq, listMessages, updateThread, type ThreadRow } from "~/server/agent/store";

export type MergeResult =
  | { ok: true; parentThreadId: string; included: number; omitted: number }
  | { ok: false; status: number; error: string };

export interface ThreadLineage {
  parentThreadId: string;
  parentTitle: string | null;
  parentMissing: boolean;
  /** The branch's own messages not brought back yet. */
  unmerged: number;
}

const ownWorkFrom = (child: ThreadRow) => child.mergedUptoSeq ?? child.forkedAtSeq ?? 0;

function unmergedRows(child: ThreadRow) {
  const from = ownWorkFrom(child);
  return listMessages(child.id).filter((r) => r.seq > from && (r.role === "user" || r.role === "assistant") && !r.kind);
}

export function threadLineage(thread: ThreadRow): ThreadLineage | null {
  if (!thread.parentThreadId) return null;
  const parent = getThread(thread.parentThreadId);
  return {
    parentThreadId: thread.parentThreadId,
    parentTitle: parent?.title ?? null,
    parentMissing: !parent,
    unmerged: unmergedRows(thread).length,
  };
}

export function mergeBackIntoParent(childId: string): MergeResult {
  const child = getThread(childId);
  if (!child) return { ok: false, status: 404, error: "Thread tidak ditemukan." };
  if (!child.parentThreadId) return { ok: false, status: 400, error: "Thread ini bukan cabang." };
  const parent = getThread(child.parentThreadId);
  if (!parent) return { ok: false, status: 409, error: "Thread induk sudah dihapus." };
  if (getRunForThread(parent.id)) {
    return { ok: false, status: 409, error: "Thread induk sedang menjalankan agent. Coba lagi setelah selesai." };
  }
  const items = handoffItemsFromRows(unmergedRows(child));
  if (!items.length) return { ok: false, status: 409, error: "Belum ada hasil baru di cabang ini untuk dibawa." };

  const title = child.title ?? "Cabang";
  const { chosen, omitted } = selectHandoffItems(items, handoffBudgetBytes(null));
  const text = renderHandoff({ mode: "merge", threadId: child.id, sourceTitle: title, chosen, omitted });
  appendMessage({
    threadId: parent.id,
    role: "system",
    kind: "mergeNotice",
    parts: [{ type: "data-notice", data: { kind: "merge", title, threadId: child.id, included: chosen.length, omitted } }],
  });
  appendMessage({ threadId: parent.id, role: "user", parts: [{ type: "text", text }] });
  updateThread(child.id, { mergedUptoSeq: latestSeq(child.id) });
  return { ok: true, parentThreadId: parent.id, included: chosen.length, omitted };
}
