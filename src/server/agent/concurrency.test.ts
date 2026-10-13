/**
 * Regression: two threads of one project run at the same time, and a client that
 * leaves one thread does not stop its run.
 *   - both runs are active together, and both finish with their answer stored
 *   - aborting the client's request does not stop the run; the resume stream replays it
 *
 * A slow OpenAI-compatible model stands in for the provider, so the runs overlap.
 *
 *   bun test src/server/agent/concurrency.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-conc-")), "data.db");

const { handleApiRequest } = await import("~/server/api-router");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A model that streams 12 short chunks (about 0.7 s), then stops. */
const model = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = (await req.json()) as { stream?: boolean };
    if (!body.stream) {
      return Response.json({
        id: "x", object: "chat.completion", created: 0, model: "mock",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        for (let i = 0; i < 12; i++) {
          send({ id: "x", object: "chat.completion.chunk", created: 0, model: "mock", choices: [{ index: 0, delta: { content: `kata${i} ` }, finish_reason: null }] });
          await wait(60);
        }
        send({ id: "x", object: "chat.completion.chunk", created: 0, model: "mock", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 12, total_tokens: 17 } });
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  },
});

async function api(method: string, url: string, body?: unknown): Promise<Response> {
  const res = await handleApiRequest(
    new Request(`http://localhost/api/${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return res!;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-conc-root-"));
const project = (await (await api("POST", "projects", { rootPath: root, name: "concurrency" })).json()) as { id: string };
const provider = (await (
  await api("POST", "providers", {
    name: "mock",
    preset: "custom-openai",
    apiStyle: "completions",
    endpoint: `http://localhost:${model.port}`,
    apiKey: "x",
    model: "mock",
    isDefault: true,
  })
).json()) as { provider: { id: string } };

async function newThread(title: string): Promise<string> {
  const res = await api("POST", "chat/threads", { projectId: project.id, title, providerId: provider.provider.id, mode: "ask", permissionMode: "readonly" });
  return ((await res.json()) as { thread: { id: string } }).thread.id;
}

type Detail = { activeRun: { runId: string } | null; messages: { role: string }[] };
async function detail(threadId: string): Promise<Detail> {
  return (await (await api("GET", `chat/threads/${threadId}`)).json()) as Detail;
}

/** Sends a user message; the returned response carries the run's stream. */
function send(threadId: string, text: string, signal?: AbortSignal): Promise<Response> {
  return handleApiRequest(
    new Request(`http://localhost/api/chat/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ id: `u-${text}`, role: "user", parts: [{ type: "text", text }] }] }),
      signal,
    }),
  ) as Promise<Response>;
}

async function drain(res: Response): Promise<void> {
  const reader = res.body!.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

test("two threads run at the same time and both store their answer", async () => {
  const a = await newThread("A");
  const b = await newThread("B");
  const runA = send(a, "halo A");
  const runB = send(b, "halo B");

  // Both runs are active in the same instant (checked by polling the thread details).
  let bothActive = false;
  for (let i = 0; i < 40 && !bothActive; i++) {
    await wait(50);
    const [dA, dB] = await Promise.all([detail(a), detail(b)]);
    bothActive = !!dA.activeRun && !!dB.activeRun;
  }
  expect(bothActive).toBe(true);

  await Promise.all([drain(await runA), drain(await runB)]);
  for (const id of [a, b]) {
    const d = await detail(id);
    expect(d.activeRun).toBeNull();
    expect(d.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  }
});

test("a client that leaves a thread does not stop its run; the resume stream replays it", async () => {
  const t = await newThread("leave");
  const controller = new AbortController();
  const run = await send(t, "tinggal", controller.signal);
  const reader = run.body!.getReader();
  await reader.read();
  controller.abort();
  await reader.cancel().catch(() => {});

  // Still running on the server after the client left.
  expect((await detail(t)).activeRun).not.toBeNull();

  const resume = await api("GET", `chat/threads/${t}/stream`);
  expect(resume.status).toBe(200);
  await drain(resume);

  for (let i = 0; i < 40; i++) {
    if (!(await detail(t)).activeRun) break;
    await wait(50);
  }
  const d = await detail(t);
  expect(d.activeRun).toBeNull();
  expect(d.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
});
