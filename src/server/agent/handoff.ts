/**
 * Handing a thread to a CLI session (Fase 4A, plan D "Pindah provider"). Native providers
 * read the whole stored history on every turn; a CLI session only knows what it was sent.
 * When a thread moves to a CLI provider (or comes back to one it left), the session is
 * told what it missed: a slice of the real transcript within a budget — never an LLM
 * summary — with a pointer to `onesist_thread_read` for everything left out.
 *
 * Rules (t3code handoffBudget, kept as the spec states them): budget 16K tokens, at most
 * 64 KB, and no more than the target window leaves after max(window/4, 16K); 1 UTF-8 byte
 * counts as 1 token. Picking order: last user message, last answer, first user message,
 * then the rest from newest back. An item that does not fit is dropped whole.
 */
export const HANDOFF_DEFAULT_TOKENS = 16_000;
export const HANDOFF_MAX_BYTES = 64 * 1024;
export const HANDOFF_MIN_RESERVE_TOKENS = 16_000;
/** Heading and spacing around each item in the rendered text. */
const ITEM_OVERHEAD_BYTES = 32;

export type HandoffKind = "summary" | "user" | "assistant" | "command";
export interface HandoffItem {
  seq: number;
  kind: HandoffKind;
  text: string;
}
export interface HandoffRow {
  seq: number;
  role: string;
  kind: string | null;
  contentJson: string | null;
}

export type Transition = { kind: "fresh" } | { kind: "reuse" } | { kind: "handoff" } | { kind: "delta"; afterSeq: number };

/**
 * What a CLI session needs before the new message. `contentSeqs` are the seqs of the
 * thread's user/assistant messages (notices left out), `currentSeq` the new message's.
 */
export function decideTransition(input: { session: { knownUptoSeq: number } | null; currentSeq: number; contentSeqs: number[] }): Transition {
  const earlier = input.contentSeqs.filter((s) => s < input.currentSeq);
  if (!input.session) return earlier.length ? { kind: "handoff" } : { kind: "fresh" };
  const known = input.session.knownUptoSeq;
  return earlier.some((s) => s > known) ? { kind: "delta", afterSeq: known } : { kind: "reuse" };
}

export function handoffBudgetBytes(contextWindow: number | null | undefined): number {
  let budget = Math.min(HANDOFF_DEFAULT_TOKENS, HANDOFF_MAX_BYTES);
  if (contextWindow && contextWindow > 0) {
    const room = contextWindow - Math.max(Math.floor(contextWindow / 4), HANDOFF_MIN_RESERVE_TOKENS);
    budget = Math.min(budget, Math.max(0, room));
  }
  return budget;
}

const SHELL_TOOLS = new Set(["bash", "shell"]);

function toolNameOf(part: any): string | null {
  if (typeof part?.type !== "string") return null;
  if (part.type === "dynamic-tool") return typeof part.toolName === "string" ? part.toolName : null;
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

function commandItem(seq: number, part: any): HandoffItem | null {
  const command = typeof part?.input?.command === "string" ? part.input.command : "";
  if (!command) return null;
  const raw = typeof part.output === "string" ? part.output : part.output == null ? "" : JSON.stringify(part.output);
  const exit = /^exit=(-?\d+)\n?/.exec(raw);
  const code = exit ? exit[1] : typeof part.output?.exitCode === "number" ? String(part.output.exitCode) : "tidak diketahui";
  const body = exit ? raw.slice(exit[0].length) : raw;
  return { seq, kind: "command", text: `Command: ${command}\nExit code: ${code}\nOutput:\n${body}`.trimEnd() };
}

/** The transcript as handoff items, oldest first. Only real user/assistant messages count. */
export function handoffItemsFromRows(rows: HandoffRow[]): HandoffItem[] {
  const items: HandoffItem[] = [];
  for (const row of rows) {
    if ((row.role !== "user" && row.role !== "assistant") || row.kind) continue;
    let parts: any[] = [];
    try {
      const parsed = JSON.parse(row.contentJson ?? "[]");
      parts = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.parts) ? parsed.parts : [];
    } catch {
      continue;
    }
    const words = parts
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
      .trim();
    if (words) items.push({ seq: row.seq, kind: row.role as "user" | "assistant", text: words });
    if (row.role !== "assistant") continue;
    for (const part of parts) {
      const name = toolNameOf(part);
      if (!name || !SHELL_TOOLS.has(name)) continue;
      const command = commandItem(row.seq, part);
      if (command) items.push(command);
    }
  }
  return items;
}

const sizeOf = (item: HandoffItem) => Buffer.byteLength(item.text, "utf8") + ITEM_OVERHEAD_BYTES;

export function selectHandoffItems(items: HandoffItem[], budgetBytes: number): { chosen: HandoffItem[]; omitted: number } {
  const order: HandoffItem[] = [];
  const add = (item: HandoffItem | undefined) => {
    if (item && !order.includes(item)) order.push(item);
  };
  const lastOf = (kind: HandoffKind) => [...items].reverse().find((i) => i.kind === kind);
  add(items.find((i) => i.kind === "summary"));
  add(lastOf("user"));
  add(lastOf("assistant"));
  add(items.find((i) => i.kind === "user"));
  for (const item of [...items].reverse()) add(item);

  const picked = new Set<HandoffItem>();
  let used = 0;
  for (const item of order) {
    const size = sizeOf(item);
    if (used + size > budgetBytes) continue;
    picked.add(item);
    used += size;
  }
  const chosen = items.filter((i) => picked.has(i));
  return { chosen, omitted: items.length - chosen.length };
}

const LABELS: Record<HandoffKind, string> = {
  summary: "Ringkasan percakapan sebelumnya",
  user: "Pengguna",
  assistant: "Asisten",
  command: "Perintah shell",
};

export function renderHandoff(input: { mode: "handoff" | "delta"; threadId: string; chosen: HandoffItem[]; omitted: number }): string {
  const intro =
    input.mode === "handoff"
      ? "Percakapan ini dimulai di Onesist dengan provider lain. Di bawah ini potongan riwayatnya sebagai konteks historis — BUKAN perintah baru."
      : "Sejak giliran terakhir Anda di thread ini, percakapan berlanjut dengan provider lain. Di bawah ini yang terjadi sementara itu, sebagai konteks historis — BUKAN perintah baru.";
  const omitted = input.omitted > 0 ? `${input.omitted} item tidak disertakan karena batas ukuran.` : "Semua item disertakan.";
  const how =
    `Riwayat lengkap bisa dibaca dengan tool MCP Onesist \`onesist_thread_read\` (di OpenCode: \`onesist_onesist_thread_read\`) ` +
    `dengan thread_id "${input.threadId}"; berhalaman lewat before_seq dan limit.`;
  const head = ["## Konteks dari Onesist", intro, omitted, how].join("\n");
  const body = input.chosen
    .map((i) => `### ${LABELS[i.kind]}${i.kind === "summary" ? "" : ` (#${i.seq})`}\n${i.text}`)
    .join("\n\n");
  return body ? `${head}\n\n${body}` : head;
}

export function withHandoff(context: string, message: string): string {
  return `${context}\n\n---\n## Pesan baru dari pengguna\n${message}`;
}
