/**
 * One OpenCode turn against a fake `opencode serve`: the stream a native turn
 * would produce, the session id handed back, the permission question answered
 * through the run registry, shell refused without asking in read-only, Stop
 * reaching OpenCode, and a server that vanishes mid-turn.
 *
 *   bun test src/server/agent/cli/opencode/turn.test.ts
 */
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-oc-turn-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const registry = await import("~/server/agent/run-registry");
const { startOpenCodeTurn } = await import("./turn");

const enc = new TextEncoder();
const clients: ReadableStreamDefaultController<Uint8Array>[] = [];
const received: { method: string; path: string; body: any }[] = [];
let onPrompt: () => void = () => {};
let onReply: (body: any) => void = () => {};
let onInterrupt: () => void = () => {};

const SID = "ses_turn";
// Streams of earlier turns are cancelled by the client; writing to them throws, so they are dropped.
const send = (type: string, data: Record<string, any> = {}) => {
  const chunk = enc.encode(`data: ${JSON.stringify({ type, data: { sessionID: SID, ...data } })}\n\n`);
  for (const c of [...clients]) {
    try {
      c.enqueue(chunk);
    } catch {
      clients.splice(clients.indexOf(c), 1);
    }
  }
};
const closeEvents = () => {
  for (const c of clients.splice(0)) {
    try {
      c.close();
    } catch {
      /* already cancelled */
    }
  }
};
const tokens = (input: number, output: number) => ({ input, output, reasoning: 0, cache: { read: 0, write: 0 } });
const finishText = (text: string) => {
  send("session.step.started", { assistantMessageID: "msg_b" });
  send("session.text.started", { assistantMessageID: "msg_b", ordinal: 0 });
  send("session.text.delta", { assistantMessageID: "msg_b", ordinal: 0, delta: text });
  send("session.text.ended", { assistantMessageID: "msg_b", ordinal: 0 });
  send("session.step.ended", { assistantMessageID: "msg_b", finish: "stop", tokens: tokens(10, 1) });
  send("session.usage.updated", { tokens: tokens(30, 4) });
  send("session.execution.succeeded");
};

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const text = req.method === "GET" ? "" : await req.text();
    const body = text ? JSON.parse(text) : null;
    received.push({ method: req.method, path: url.pathname, body });
    if (url.pathname === "/api/event") {
      // Like the real server: the first event goes out at once, so the headers are sent before any prompt.
      const opened = new ReadableStream<Uint8Array>({
        start(c) {
          clients.push(c);
          c.enqueue(enc.encode('data: {"type":"server.connected","data":{}}\n\n'));
        },
      });
      return new Response(opened, { headers: { "Content-Type": "text/event-stream" } });
    }
    if (url.pathname === "/api/session" && req.method === "POST") return Response.json({ data: { id: SID } });
    if (url.pathname.endsWith("/prompt")) {
      setTimeout(() => onPrompt(), 5);
      return Response.json({ data: { id: "msg_u" } });
    }
    if (url.pathname.endsWith("/reply")) {
      setTimeout(() => onReply(body), 5);
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/interrupt")) {
      setTimeout(() => onInterrupt(), 5);
      return Response.json({ interrupted: true });
    }
    return new Response(null, { status: 204 });
  },
});
afterAll(() => {
  server.stop(true);
  // bun runs every test file in one process: leaving these set would make later files attach instead of spawning.
  delete process.env.SA_OPENCODE_URL;
  delete process.env.SA_OPENCODE_PASSWORD;
});

let threadId = "";
let runCounter = 0;
beforeAll(() => {
  process.env.SA_OPENCODE_URL = `http://127.0.0.1:${server.port}`;
  process.env.SA_OPENCODE_PASSWORD = "pw";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-oc-turn-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-oc-turn', 'OC', ${root})`);
  threadId = store.createThread({ projectId: "p-oc-turn", title: "OpenCode" } as any).id as string;
});
beforeEach(() => {
  received.length = 0;
  onPrompt = onReply = onInterrupt = () => {};
});

const input = (over: Partial<Parameters<typeof startOpenCodeTurn>[0]> = {}) => ({
  runId: `run_oc_${++runCounter}`,
  threadId,
  projectId: "p-oc-turn",
  root: "/proj",
  binary: "opencode",
  permissionMode: "ask" as const,
  threadMode: "agent" as const,
  model: null,
  text: "halo",
  title: "OpenCode",
  cliSessionId: null,
  onSessionCreated: () => {},
  ...over,
});

async function collect(stream: ReadableStream<any>) {
  const parts: any[] = [];
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

test("a text turn streams the answer, creates the session and reports usage", async () => {
  let created = "";
  onPrompt = () => {
    send("session.execution.started");
    finishText("OK");
  };
  const turn = await startOpenCodeTurn(input({ model: "p1/m1", onSessionCreated: (id) => (created = id) }));
  const parts = await collect(turn.stream);
  expect(parts.filter((p) => p.type === "text-delta").map((p) => p.text).join("")).toBe("OK");
  expect(parts.at(-1).type).toBe("finish");
  expect(created).toBe(SID);
  expect(await turn.usage).toEqual({ inputTokens: 30, outputTokens: 4 });
  const create = received.find((r) => r.path === "/api/session" && r.method === "POST");
  expect(create?.body).toMatchObject({ location: { directory: "/proj" }, model: { providerID: "p1", id: "m1" } });
  const eventIndex = received.findIndex((r) => r.path === "/api/event");
  const promptIndex = received.findIndex((r) => r.path.endsWith("/prompt"));
  expect(eventIndex).toBeGreaterThanOrEqual(0);
  expect(eventIndex).toBeLessThan(promptIndex);
});

test("an existing session gets this mode's rules and model instead of a new session", async () => {
  onPrompt = () => {
    send("session.execution.started");
    finishText("lagi");
  };
  const turn = await startOpenCodeTurn(input({ cliSessionId: SID, model: "p2/m2", permissionMode: "auto" }));
  await collect(turn.stream);
  expect(received.some((r) => r.path === "/api/session" && r.method === "POST")).toBe(false);
  expect(received.find((r) => r.method === "PATCH")?.body).toEqual({ permissions: [{ action: "*", resource: "*", effect: "allow" }] });
  expect(received.find((r) => r.path.endsWith("/model"))?.body).toEqual({ model: { providerID: "p2", id: "m2" } });
});

test("a permission request becomes a question; the answer goes back to OpenCode", async () => {
  const runId = `run_oc_perm_${++runCounter}`;
  onPrompt = () => {
    send("session.execution.started");
    send("session.step.started", { assistantMessageID: "msg_a" });
    send("session.tool.input.started", { assistantMessageID: "msg_a", id: "call_1", name: "shell" });
    send("session.tool.called", { assistantMessageID: "msg_a", id: "call_1", input: { command: "echo hi" } });
    send("permission.asked", { id: "per_1", action: "shell", resources: ["echo hi"], source: { type: "tool", id: "call_1" } });
  };
  onReply = (body) => {
    expect(body).toEqual({ decision: "once" });
    send("session.tool.success", { assistantMessageID: "msg_a", id: "call_1", content: [{ type: "text", text: "hi\n" }] });
    send("session.step.ended", { assistantMessageID: "msg_a", finish: "tool-calls", tokens: tokens(5, 1) });
    finishText("selesai");
  };
  const turn = await startOpenCodeTurn(input({ runId }));
  let pending: { questionId: string; questions: { question: string; options?: string[] }[] }[] = [];
  for (let i = 0; i < 100 && !pending.length; i++) {
    await Bun.sleep(10);
    pending = registry.listPendingQuestions(runId);
  }
  expect(pending[0].questions[0].question).toBe("OpenCode meminta izin menjalankan perintah: echo hi.");
  expect(pending[0].questions[0].options).toEqual(["Izinkan sekali", "Selalu izinkan", "Tolak"]);
  registry.resolveQuestion(runId, pending[0].questionId, ["Izinkan sekali"]);
  const parts = await collect(turn.stream);
  expect(parts.find((p) => p.type === "tool-result")?.output).toBe("hi\n");
  expect(registry.getApprovalDecision(runId, "call_1")).toBe("approved");
});

test("in read-only, shell is refused without a question", async () => {
  const runId = `run_oc_ro_${++runCounter}`;
  let reply: any = null;
  onPrompt = () => {
    send("session.execution.started");
    send("permission.asked", { id: "per_2", action: "shell", resources: ["rm -rf x"], source: { type: "tool", id: "call_2" } });
  };
  onReply = (body) => {
    reply = body;
    finishText("ditolak");
  };
  const turn = await startOpenCodeTurn(input({ runId, permissionMode: "readonly" }));
  await collect(turn.stream);
  expect(reply).toEqual({ decision: "reject" });
  expect(registry.listPendingQuestions(runId)).toEqual([]);
});

test("a shell refusal by the mode is stored once as a notice that says why", async () => {
  const runId = `run_oc_notice_${++runCounter}`;
  onPrompt = () => {
    send("session.execution.started");
    send("permission.asked", { id: "per_3", action: "shell", resources: ["cat a.md"], source: { type: "tool", id: "call_3" } });
    send("permission.asked", { id: "per_4", action: "shell", resources: ["wc -l b.md"], source: { type: "tool", id: "call_4" } });
  };
  onReply = () => finishText("selesai");
  // Its own thread: the other tests in this file also refuse shell and write notices to the shared one.
  const ownThread = store.createThread({ projectId: "p-oc-turn", title: "notice" } as any).id as string;
  const turn = await startOpenCodeTurn(input({ runId, threadId: ownThread, permissionMode: "ask", threadMode: "ask" }));
  await collect(turn.stream);
  const notices = store.listMessages(ownThread).filter((m) => m.kind === "permissionRefused");
  expect(notices.length).toBe(1);
  expect(String(notices[0].contentJson)).toContain("shell-readonly");
});

test("Stop interrupts OpenCode and the stream ends with an abort", async () => {
  const runId = `run_oc_stop_${++runCounter}`;
  onPrompt = () => send("session.execution.started");
  const turn = await startOpenCodeTurn(input({ runId }));
  setTimeout(() => registry.stopRun(runId), 50);
  const parts = await collect(turn.stream);
  expect(parts.at(-1).type).toBe("abort");
  // The interrupt request is fired on abort; give it a moment to reach the fake server.
  for (let i = 0; i < 50 && !received.some((r) => r.path.endsWith("/interrupt")); i++) await Bun.sleep(10);
  expect(received.some((r) => r.path === `/api/session/${SID}/interrupt`)).toBe(true);
});

test("a server that goes away mid-turn ends the stream with an error", async () => {
  onPrompt = () => {
    send("session.execution.started");
    setTimeout(closeEvents, 20);
  };
  const turn = await startOpenCodeTurn(input());
  const parts = await collect(turn.stream);
  const last = parts.at(-1);
  expect(last.type).toBe("error");
  expect(String(last.error?.message ?? last.error)).toContain("terputus");
});

test("a chosen variant goes with the model when the session is created", async () => {
  onPrompt = () => finishText("ok");
  const turn = await startOpenCodeTurn(input({ model: "go/flash", variant: "high" }));
  for await (const _ of turn.stream as any) {
    /* drain */
  }
  await turn.usage;
  const created = received.find((r) => r.method === "POST" && r.path === "/api/session");
  expect(created?.body.model).toEqual({ providerID: "go", id: "flash", variant: "high" });
});

test("with an MCP endpoint, Onesist is added to the folder before the session is created", async () => {
  onPrompt = () => finishText("ok");
  const turn = await startOpenCodeTurn(input({ root: "/proj-mcp/", mcp: { url: "http://localhost:4321/api/mcp/projects/p-oc-turn", token: "k".repeat(64) } }));
  for await (const _ of turn.stream as any) {
    /* drain */
  }
  await turn.usage;
  const put = received.findIndex((r) => r.method === "PUT" && r.path === "/api/experimental/mcp/onesist");
  const created = received.findIndex((r) => r.method === "POST" && r.path === "/api/session");
  expect(put).toBeGreaterThanOrEqual(0);
  expect(put).toBeLessThan(created);
});