import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DefaultChatTransport, type UIMessage } from "~/lib/ai-client";

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
  mode: "ask" | "agent";
  providerId: string | null;
  model: string | null;
  permissionMode: "ask" | "auto" | "readonly";
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
  messages: { id: string; role: "user" | "assistant" | "system"; parts: any[]; metadata?: MessageMetadata }[];
  files: ThreadFile[];
  toolCalls: ThreadToolCall[];
  /** Files the agent read whose content no longer matches what it saw (FR-C12). */
  staleReads: { path: string; readAt: string | null }[];
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
// Composer actions (FR-C14)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedChatAction {
  id: string;
  label: string;
  hint: string;
  prompt: string;
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
export function useMentionFiles(projectId: string | undefined) {
  const [files, setFiles] = useState<{ name: string; path: string }[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/docs/files`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFiles((data.files ?? []) as { name: string; path: string }[]);
      } catch {
        /* an empty mention popup is fine — not a failure worth surfacing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { files };
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
