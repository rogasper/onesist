import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "~/lib/ai-client";
import { useFileChanged } from "~/lib/use-file-data";

/**
 * Data hook for the Chat tab (FR-B, FR-C).
 *
 * History is fetched from the DB via `GET /api/chat/threads/:id` — NOT from SSE
 * replay. The stream is only the live display path for the turn in progress,
 * so threads stay intact across restarts and are not limited by a ring buffer.
 */

export interface ThreadSummary {
  id: string;
  projectId: string;
  title: string | null;
  /** ask = menjawab · plan = menyusun rencana read-only (Fase 5.1) ·
   *  agent = boleh memakai tool. */
  mode: "ask" | "agent" | "plan";
  providerId: string | null;
  model: string | null;
  permissionMode: "ask" | "auto" | "no-shell" | "readonly";
  maxSteps: number;
  tokensUsed: number;
  archived: boolean;
  hasSummary: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ThreadFile {
  id: string;
  threadId: string;
  path: string;
  route: string | null;
  op: "create" | "update" | "delete" | "rename";
  source: string;
  linesAdded: number | null;
  linesRemoved: number | null;
  /** Diff computed at write time (FR-C3), in unified diff format. */
  diffJson: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface ThreadToolCall {
  toolCallId: string;
  name: string;
  isError: boolean;
  approval: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

/** Metadata carried by stored messages: tokens and thinking duration (FR-B12). */
export interface MessageMetadata {
  inputTokens?: number;
  outputTokens?: number;
  reasoningMs?: number;
  model?: string;
  status?: "ok" | "error" | "aborted";
  createdAt?: string;
}

export interface ThreadDetail {
  thread: ThreadSummary;
  /** Absolute workspace root — used to open a changed file with the OS. */
  rootPath?: string | null;
  messages: { id: string; role: "user" | "assistant" | "system"; parts: any[]; metadata?: MessageMetadata }[];
  files: ThreadFile[];
  toolCalls: ThreadToolCall[];
  /** Files the agent read whose content no longer matches what it saw (FR-C12). */
  staleReads: { path: string; readAt: string | null }[];
  /** Token split + cost estimate for this thread (Fase 5.5). `estimate` is null
   *  when the provider has no price configured — then tokens are shown alone. */
  usage: { tokensIn: number; tokensOut: number; estimate: { amount: number; currency: "usd"; partial: boolean } | null };
  provider: { id: string; name: string; apiKeyMasked: string | null; source: string; model: string | null } | null;
}

export interface ChatProviderOption {
  id: string;
  name: string;
  model: string | null;
  /** The stored model for this configuration (FR-L4). */
  models?: string[];
  source: string;
  isDefault: boolean;
  apiStyle: string;
  envFallback: boolean;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Balasan tidak terbaca dari ${url}`);
  }
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-thread search (Fase 5.3, FR-B17)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatSearchHit {
  threadId: string;
  threadTitle: string | null;
  messageId: string;
  role: string;
  /** Matched excerpt; terms are wrapped in `\u0001`…`\u0002` (control chars, so
   *  they can never collide with message text) for highlighting. */
  snippet: string;
  rank: number;
  createdAt: string | null;
}

/**
 * Message search across the project's threads, debounced.
 *
 * Short queries are dropped client-side as well as server-side: one or two
 * characters match everything, so firing a request for them would only produce
 * a wall of noise and wasted queries.
 */
export function useChatSearch(projectId: string | undefined, query: string) {
  const [hits, setHits] = useState<ChatSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!projectId || q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ hits: ChatSearchHit[] }>(
          `/api/chat/search?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(q)}`,
        );
        if (!cancelled) setHits(Array.isArray(res.hits) ? res.hits : []);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, query]);

  return { hits, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread list
// ─────────────────────────────────────────────────────────────────────────────

export function useChatThreads(projectId: string | undefined) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await api<{ threads: ThreadSummary[] }>(`/api/chat/threads?projectId=${encodeURIComponent(projectId)}`);
      setThreads(res.threads);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Gagal memuat daftar percakapan");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createThread = useCallback(
    async (init?: { permissionMode?: string; providerId?: string | null; model?: string | null; title?: string }) => {
      const res = await api<{ thread: ThreadSummary }>("/api/chat/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, ...init }),
      });
      await refresh();
      return res.thread;
    },
    [projectId, refresh],
  );

  const updateThread = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const res = await api<{ thread: ThreadSummary }>(`/api/chat/threads/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      await refresh();
      return res.thread;
    },
    [refresh],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      await api(`/api/chat/threads/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { threads, loading, error, refresh, createThread, updateThread, deleteThread };
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread detail
// ─────────────────────────────────────────────────────────────────────────────

export function useChatThread(threadId: string | null) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!threadId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api<ThreadDetail>(`/api/chat/threads/${threadId}`);
      setDetail(res);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Gagal memuat percakapan");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { detail, loading, error, refresh };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────────────────────

/** Per-thread transport. Recreated only when the thread changes so no
 *  request strays into another thread. */
export function useThreadTransport(threadId: string | null) {
  return useMemo(() => {
    if (!threadId) return null;
    return new DefaultChatTransport({
      api: `/api/chat/threads/${threadId}/messages`,
    });
  }, [threadId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval (FR-E4)
// ─────────────────────────────────────────────────────────────────────────────

export interface PendingApproval {
  toolCallId: string;
  name: string;
  preview: string;
  reason?: string;
}

/**
 * Approvals waiting on a decision.
 *
 * The server holds the tool inside a promise in `ask` mode, and there is no SSE
 * event for that — so while the stream is running we poll the approval list
 * periodically. Polling is limited to ONLY while `active` (streaming status) and
 * stops on its own once the stream finishes, so it never becomes a permanent
 * poll that would violate this app's SSE conventions.
 */
export function usePendingApprovals(threadId: string | null, active: boolean) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!threadId || !active) {
      setApprovals([]);
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api<{ approvals: PendingApproval[] }>(`/api/chat/threads/${threadId}/approvals`);
        if (!cancelled) setApprovals(res.approvals);
      } catch {
        /* approvals are not critical display-wise — never disturb the stream */
      }
    };
    void tick();
    timer.current = setInterval(tick, 1200);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [threadId, active]);

  const decide = useCallback(async (toolCallId: string, decision: "approved" | "denied") => {
    // Drop it from the list first so the card disappears immediately, then
    // tell the server.
    setApprovals((prev) => prev.filter((a) => a.toolCallId !== toolCallId));
    const res = await api<{ runId?: string }>(`/api/chat/threads/${threadId}/approvals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolCallId, decision }),
    }).catch(() => null);
    void res;
  }, [threadId]);

  return { approvals, decide };
}

// ─────────────────────────────────────────────────────────────────────────────
// File attachments (composer)
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadedAttachment {
  path: string;
  name: string;
  size: number;
}

/**
 * Uploads a single file as a conversation attachment.
 *
 * The body is sent raw with the file name in the query (`?filename=<base64>`),
 * following the existing FSD upload pattern — this app uses no `FormData`
 * on any of these paths, and base64 in the query is safe for non-ASCII file names.
 */
export async function uploadAttachment(threadId: string, file: File): Promise<UploadedAttachment> {
  const filename = btoa(unescape(encodeURIComponent(file.name || "lampiran")));
  const res = await fetch(`/api/chat/threads/${threadId}/attachments?filename=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
    cache: "no-store",
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Balasan unggahan tidak terbaca.");
  }
  if (!res.ok) throw new Error(body?.error ?? `Unggahan gagal (HTTP ${res.status}).`);
  return body as UploadedAttachment;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent memory (FR-H)
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryEntryView {
  at: string;
  text: string;
}

export interface MemoryFileView {
  /** Relative for the project file, absolute for the global one (it lives
   *  outside the workspace by design). */
  path: string;
  exists: boolean;
  content: string;
  entries: MemoryEntryView[];
}

export interface MemoryStateView {
  project: MemoryFileView;
  global: MemoryFileView;
  limits: { promptChars: number; entryChars: number; entries: number };
}

/** Both memory files plus the operations the panel needs (FR-H5). Writes return
 *  the fresh state, so the panel renders what was actually stored rather than
 *  what it hoped was stored. */
export function useChatMemory(projectId: string | undefined) {
  const [memory, setMemory] = useState<MemoryStateView | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/memory?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      if (res.ok) setMemory((await res.json()) as MemoryStateView);
    } catch {
      /* the panel is optional context; failing to load must not break chat */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const call = useCallback(
    async (init: RequestInit & { url: string }) => {
      const { url, ...rest } = init;
      try {
        const res = await fetch(url, { cache: "no-store", ...rest });
        const text = await res.text();
        const body = text ? JSON.parse(text) : null;
        if (!res.ok) return { ok: false as const, error: body?.error ?? `HTTP ${res.status}` };
        // Append/replace/delete all answer with the full state.
        if (body?.project) setMemory(body as MemoryStateView);
        return { ok: true as const };
      } catch (err: any) {
        return { ok: false as const, error: err?.message ?? "Gagal menyimpan." };
      }
    },
    [],
  );

  const add = useCallback(
    (scope: "project" | "global", text: string) =>
      call({ url: `/api/chat/memory?projectId=${encodeURIComponent(projectId ?? "")}&scope=${scope}`, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }),
    [call, projectId],
  );

  const remove = useCallback(
    (scope: "project" | "global", index: number) =>
      call({ url: `/api/chat/memory?projectId=${encodeURIComponent(projectId ?? "")}&scope=${scope}&index=${index}`, method: "DELETE" }),
    [call, projectId],
  );

  const replace = useCallback(
    (scope: "project" | "global", content: string) =>
      call({ url: `/api/chat/memory?projectId=${encodeURIComponent(projectId ?? "")}&scope=${scope}`, method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) }),
    [call, projectId],
  );

  return { memory, loading, refresh, add, remove, replace };
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills for the `$` trigger (FR-F4)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatSkillOption {
  name: string;
  /** Truncated description for the popup; the prompt gets its own capped copy. */
  description: string;
  /** Which layer this skill came from — `project` wins a name collision (FR-F5). */
  source: "project" | "claude" | "opencode" | "user" | "vendor";
  references: number;
}

/** Skills for a project, resolved by the same layered lookup the agent's system
 *  prompt uses — so the popup cannot show a different skill than the one in
 *  effect. */
export function useChatSkills(projectId: string | undefined) {
  const [skills, setSkills] = useState<ChatSkillOption[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/chat/skills?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSkills((data.skills ?? []) as ChatSkillOption[]);
      } catch {
        /* the skill list is a convenience — losing it must not break the composer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { skills };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer actions (FR-C14)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedChatAction {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  /** Slash command that inserts `prompt` (FR-5.4). */
  command: string;
  /** `project` = read from `<project>/.agents/onesist-actions.json`, which means
   *  it arrived with the repo and is treated as untrusted content (FR-K1). */
  source: "builtin" | "project";
}

export interface ProjectActionFile {
  present: boolean;
  problem: string | null;
  rejected: number;
}

/**
 * Composer actions for a project. Resolution (project file + fallback +
 * validation) happens on the server; the client only renders what came back,
 * including the `source` marking, so a project file cannot pass itself off as a
 * built-in action.
 */
export function useChatActions(projectId: string | undefined) {
  const [actions, setActions] = useState<ResolvedChatAction[]>([]);
  const [projectFile, setProjectFile] = useState<ProjectActionFile>({ present: false, problem: null, rejected: 0 });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/chat/actions?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setActions((data.actions ?? []) as ResolvedChatAction[]);
        setProjectFile((data.projectFile ?? { present: false, problem: null, rejected: 0 }) as ProjectActionFile);
      } catch {
        /* the action list is a convenience — losing it must not break the composer */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { actions, projectFile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Project files for `@` mention (FR-C10)
// ─────────────────────────────────────────────────────────────────────────────

/** Project artifact file list (input/ + output/ + root) for the `@` popup.
 *  Same endpoint the Docs page uses, so the offered list stays
 *  consistent across the app. */
/**
 * Expands `@name` chips back into `@dir/name` paths before a message is sent.
 *
 * The composer inserts mentions by NAME so the field shows a compact chip; the
 * agent, however, needs a path it can hand to `read_file`. Expansion only
 * happens when the name is unambiguous — with two files of the same name the
 * text is left exactly as typed, which keeps the ambiguity visible instead of
 * silently pointing at one of them. Anything already containing a slash is
 * treated as a hand-typed path and left alone.
 */
export function expandMentions(text: string, files: { name: string; path: string }[]): string {
  if (!text.includes("@") || !files.length) return text;
  return text
    .split(/(\s+)/)
    .map((chunk) => {
      const at = chunk.indexOf("@");
      if (at < 0) return chunk;
      // The `@` must not sit inside a word — an e-mail address is not a mention.
      if (at > 0 && /[\p{L}\p{N}]/u.test(chunk[at - 1])) return chunk;
      const after = chunk.slice(at + 1);
      // Surrounding punctuation belongs to the sentence, not to the mention
      // (`(@name),` must still expand).
      const trailing = after.match(/[,.;:!?)\]}"]+$/)?.[0] ?? "";
      const label = after.slice(0, after.length - trailing.length);
      if (!label || label.includes("/")) return chunk;
      const matches = files.filter((f) => f.name === label);
      if (matches.length !== 1) return chunk;
      return `${chunk.slice(0, at)}@${matches[0].path}${trailing}`;
    })
    .join("");
}

/** Files offered by the `@` trigger. *
 *  Scope is the WHOLE project folder (not just `input/`/`output/`): the chat
 *  agent works on the workspace as the user organised it, and an FSD source is
 *  often in a folder the user created themselves. The only things left out are
 *  machine-output directories and `.agents/skills|agents`, which belong to the
 *  `$` trigger. */
export function useMentionFiles(projectId: string | undefined, root?: string | null) {
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/project-files`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setFiles((data.files ?? []) as { name: string; path: string }[]);
    } catch {
      /* an empty mention popup is fine — not a failure worth surfacing */
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A file created during the conversation (agent, bash CLI, or the user) must be
  // mentionable immediately — without reloading the page and without polling.
  // The listener refreshes on `file:changed` for THIS project's root; when the
  // root is not known yet, any change refreshes (one cheap local request).
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useFileChanged((data) => {
    if (root && data.root && data.root !== root) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(), 500);
  });

  return { files, reload: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers for the model picker
// ─────────────────────────────────────────────────────────────────────────────

export function useChatProviders() {
  const [providers, setProviders] = useState<ChatProviderOption[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ providers: ChatProviderOption[] }>("/api/chat/providers");
      setProviders(res.providers);
    } catch {
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { providers, loading, refresh };
}

/** Joins the text parts of a UI message. */
export function messageText(message: UIMessage | { parts?: any[] }): string {
  return (message.parts ?? [])
    .map((p: any) => (p?.type === "text" ? p.text : ""))
    .join("");
}


/** Formats a cost estimate for display. Small amounts keep four decimals, because
 *  a single cheap turn must not render as "$0.00" — that reads as free. */
export function formatCost(estimate: { amount: number; partial: boolean } | null | undefined): string | null {
  if (!estimate) return null;
  if (estimate.amount === 0) return estimate.partial ? "sebagian" : "$0";
  const digits = estimate.amount < 0.01 ? 4 : 2;
  const text = `$${estimate.amount.toFixed(digits)}`;
  return estimate.partial ? `±${text}` : text;
}

/** Angka token yang cepat dibaca: 8.512 di bawah sepuluh ribu, 12,3 rb di atasnya.
 *  Satu definisi untuk semua permukaan supaya pesan dan footer tidak berbeda
 *  format. */
export function formatTokens(n: number): string {
  if (n < 10_000) return n.toLocaleString("id-ID");
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
