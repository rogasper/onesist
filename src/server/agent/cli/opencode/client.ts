/**
 * Minimal OpenCode 2 HTTP client (`opencode serve`): only the calls a chat turn
 * needs. Plain fetch; the API shapes were checked against OpenCode 2.0.28's
 * /openapi.json. Errors carry the status and a short body, never the password.
 */
import type { OcDecision, OcRule } from "./rules";
import { parseSseBlocks, type OpenCodeEvent } from "./sse";

export interface OpenCodeConnection {
  baseUrl: string;
  authorization: string;
}
export interface ModelRef {
  id: string;
  providerID: string;
  /** OpenCode model variant (reasoning effort and the like), e.g. "high". */
  variant?: string;
}
export interface OcModel {
  id: string;
  providerID: string;
  name: string;
  /** Variant ids the model offers; empty when it has none. */
  variants: string[];
  /** Context window in tokens (`limit.context`); null when OpenCode does not say. */
  contextWindow: number | null;
}

export function basicAuth(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}

/** `provider/model` as stored on a thread; the model part may itself contain slashes. */
export function parseModelRef(value: string | null | undefined, variant?: string | null): ModelRef | null {
  if (!value) return null;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  const ref: ModelRef = { providerID: value.slice(0, slash), id: value.slice(slash + 1) };
  if (variant) ref.variant = variant;
  return ref;
}

const seg = (value: string) => encodeURIComponent(value);

async function request(conn: OpenCodeConnection, method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { Authorization: conn.authorization };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (path === "/api/event") headers.Accept = "text/event-stream";
  const res = await fetch(`${conn.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenCode ${method} ${path} gagal (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

export async function ocInfo(conn: OpenCodeConnection, signal?: AbortSignal): Promise<{ version: string }> {
  const body: any = await (await request(conn, "GET", "/api/info", undefined, signal)).json();
  return { version: String(body?.version ?? "") };
}

export async function ocCreateSession(
  conn: OpenCodeConnection,
  input: { title: string | null; directory: string; permissions: OcRule[]; model: ModelRef | null },
): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title,
    location: { directory: input.directory },
    permissions: input.permissions,
  };
  if (input.model) payload.model = input.model;
  const body: any = await (await request(conn, "POST", "/api/session", payload)).json();
  const id = body?.data?.id;
  if (typeof id !== "string" || !id) throw new Error("OpenCode tidak mengembalikan id sesi.");
  return id;
}

export async function ocUpdatePermissions(conn: OpenCodeConnection, sessionId: string, permissions: OcRule[]): Promise<void> {
  await request(conn, "PATCH", `/api/session/${seg(sessionId)}`, { permissions });
}

export async function ocSetModel(conn: OpenCodeConnection, sessionId: string, model: ModelRef): Promise<void> {
  await request(conn, "POST", `/api/session/${seg(sessionId)}/model`, { model });
}

export async function ocPrompt(conn: OpenCodeConnection, sessionId: string, text: string): Promise<void> {
  await request(conn, "POST", `/api/session/${seg(sessionId)}/prompt`, { text });
}

export async function ocReplyPermission(conn: OpenCodeConnection, sessionId: string, requestId: string, decision: OcDecision): Promise<void> {
  await request(conn, "POST", `/api/session/${seg(sessionId)}/permission/${seg(requestId)}/reply`, { decision });
}

/** Answers an OpenCode form (the question tool). `answer` maps each field's key to its value. */
export async function ocReplyForm(conn: OpenCodeConnection, sessionId: string, formId: string, answer: Record<string, unknown>): Promise<void> {
  await request(conn, "POST", `/api/session/${seg(sessionId)}/form/${seg(formId)}/reply`, { answer });
}

/** Declines an OpenCode form; the question tool then ends with `message`. */
export async function ocCancelForm(conn: OpenCodeConnection, sessionId: string, formId: string, message: string): Promise<void> {
  await request(conn, "DELETE", `/api/session/${seg(sessionId)}/form/${seg(formId)}?message=${encodeURIComponent(message)}`);
}

export async function ocInterrupt(conn: OpenCodeConnection, sessionId: string): Promise<void> {
  await request(conn, "POST", `/api/session/${seg(sessionId)}/interrupt`);
}

/** Variant ids from either shape OpenCode has used: an array of `{ id }` or an object keyed by id. */
function variantIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v: any) => (typeof v?.id === "string" ? v.id : null)).filter((v): v is string => !!v);
  if (raw && typeof raw === "object") return Object.keys(raw);
  return [];
}

/** A new session holding a copy of this one's whole history (OpenCode 2 `fork` without `before`). */
export async function ocForkSession(conn: OpenCodeConnection, sessionId: string): Promise<string> {
  const body: any = await (await request(conn, "POST", `/api/session/${seg(sessionId)}/fork`, {})).json();
  const id = body?.data?.id;
  if (typeof id !== "string" || !id) throw new Error("OpenCode tidak mengembalikan id sesi cabang.");
  return id;
}

export async function ocListModels(conn: OpenCodeConnection, signal?: AbortSignal): Promise<OcModel[]> {
  const body: any = await (await request(conn, "GET", "/api/model", undefined, signal)).json();
  const list: any[] = Array.isArray(body?.data) ? body.data : [];
  return list
    .filter((m) => typeof m?.id === "string" && typeof m?.providerID === "string")
    .map((m) => ({
      id: m.id,
      providerID: m.providerID,
      name: typeof m.name === "string" ? m.name : m.id,
      variants: variantIds(m.variants),
      contextWindow: typeof m.limit?.context === "number" && m.limit.context > 0 ? m.limit.context : null,
    }));
}

/**
 * Opens `/api/event` and resolves once the server answered, so a prompt sent after
 * this cannot outrun the subscription. Aborting `signal` ends the iteration.
 */
export async function ocOpenEvents(conn: OpenCodeConnection, signal: AbortSignal): Promise<AsyncGenerator<OpenCodeEvent>> {
  const res = await request(conn, "GET", "/api/event", undefined, signal);
  if (!res.body) throw new Error("OpenCode tidak mengirim aliran event.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  async function* iterate(): AsyncGenerator<OpenCodeEvent> {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBlocks(buffer);
        buffer = rest;
        for (const event of events) yield event;
      }
    } finally {
      reader.releaseLock();
    }
  }
  return iterate();
}

const locationQuery = (directory: string) => `location[directory]=${encodeURIComponent(directory)}`;

/** MCP servers OpenCode has for one folder (the user's own included), with their status. */
export async function ocListMcp(conn: OpenCodeConnection, directory: string): Promise<{ name: string; status: string }[]> {
  const body: any = await (await request(conn, "GET", `/api/mcp?${locationQuery(directory)}`)).json();
  const list: any[] = Array.isArray(body?.data) ? body.data : [];
  return list
    .filter((s) => typeof s?.name === "string")
    .map((s) => ({ name: s.name, status: typeof s.status?.status === "string" ? s.status.status : "" }));
}

/**
 * Adds (or replaces) a remote MCP server for one folder until OpenCode restarts.
 * `codemode: false` keeps every tool its own tool instead of one `execute` wrapper.
 */
export async function ocPutMcp(
  conn: OpenCodeConnection,
  directory: string,
  name: string,
  remote: { url: string; headers: Record<string, string> },
): Promise<void> {
  await request(conn, "PUT", `/api/experimental/mcp/${seg(name)}?${locationQuery(directory)}`, {
    config: { type: "remote", url: remote.url, headers: remote.headers, oauth: false, codemode: false },
  });
}
