/**
 * The thin OpenCode 2 HTTP client against a fake server: paths, bodies, the Basic
 * auth header, error text, the model list and the event stream.
 *
 *   bun test src/server/agent/cli/opencode/client.test.ts
 */
import { afterAll, expect, test } from "bun:test";
import {
  basicAuth, ocCreateSession, ocInfo, ocInterrupt, ocListModels, ocOpenEvents, ocPrompt,
  ocReplyPermission, ocSetModel, ocUpdatePermissions, parseModelRef, type OpenCodeConnection,
} from "./client";

type Call = { method: string; path: string; body: any; auth: string | null };
const calls: Call[] = [];
const enc = new TextEncoder();

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const text = req.method === "GET" ? "" : await req.text();
    calls.push({ method: req.method, path: url.pathname, body: text ? JSON.parse(text) : null, auth: req.headers.get("authorization") });
    if (url.pathname === "/api/info") return Response.json({ version: "2.0.28" });
    if (url.pathname === "/api/session" && req.method === "POST") return Response.json({ data: { id: "ses_new" } });
    if (url.pathname === "/api/model") return Response.json({ location: { directory: "/x" }, data: [{ id: "m1", providerID: "p1", name: "Model Satu" }] });
    if (url.pathname === "/api/session/ses_bad/prompt") return new Response("nope", { status: 500 });
    if (url.pathname === "/api/event") {
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode('data: {"type":"one","data":{"sessionID":"s"}}\n\n: heartbeat\n\ndata: {"type":"tw'));
            c.enqueue(enc.encode('o","data":{}}\n\n'));
            c.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    return new Response(null, { status: 204 });
  },
});
afterAll(() => server.stop(true));

const conn: OpenCodeConnection = { baseUrl: `http://127.0.0.1:${server.port}`, authorization: basicAuth("pw") };
const last = () => calls[calls.length - 1];

test("Basic auth uses the user name opencode", () => {
  expect(basicAuth("pw")).toBe(`Basic ${Buffer.from("opencode:pw").toString("base64")}`);
});

test("model refs are provider/model, split at the first slash", () => {
  expect(parseModelRef("opencode-go/gemini-4")).toEqual({ providerID: "opencode-go", id: "gemini-4" });
  expect(parseModelRef("openrouter/anthropic/claude")).toEqual({ providerID: "openrouter", id: "anthropic/claude" });
  expect(parseModelRef("tanpa-slash")).toBeNull();
  expect(parseModelRef("/x")).toBeNull();
  expect(parseModelRef("x/")).toBeNull();
  expect(parseModelRef(null)).toBeNull();
});

test("info reads the version with the auth header", async () => {
  expect(await ocInfo(conn)).toEqual({ version: "2.0.28" });
  expect(last()).toMatchObject({ method: "GET", path: "/api/info", auth: basicAuth("pw") });
});

test("a session is created in the project folder with its rules and model", async () => {
  const id = await ocCreateSession(conn, {
    title: "Uji", directory: "/proj", permissions: [{ action: "*", resource: "*", effect: "allow" }], model: { providerID: "p1", id: "m1" },
  });
  expect(id).toBe("ses_new");
  expect(last().body).toEqual({
    title: "Uji", location: { directory: "/proj" }, permissions: [{ action: "*", resource: "*", effect: "allow" }], model: { providerID: "p1", id: "m1" },
  });
});

test("without a model the body leaves it out", async () => {
  await ocCreateSession(conn, { title: null, directory: "/proj", permissions: [], model: null });
  expect("model" in last().body).toBe(false);
});

test("session updates, prompt, permission reply and interrupt hit their paths", async () => {
  await ocUpdatePermissions(conn, "ses_1", [{ action: "shell", resource: "*", effect: "ask" }]);
  expect(last()).toMatchObject({ method: "PATCH", path: "/api/session/ses_1", body: { permissions: [{ action: "shell", resource: "*", effect: "ask" }] } });
  await ocSetModel(conn, "ses_1", { providerID: "p1", id: "m1" });
  expect(last()).toMatchObject({ method: "POST", path: "/api/session/ses_1/model", body: { model: { providerID: "p1", id: "m1" } } });
  await ocPrompt(conn, "ses_1", "halo");
  expect(last()).toMatchObject({ method: "POST", path: "/api/session/ses_1/prompt", body: { text: "halo" } });
  await ocReplyPermission(conn, "ses_1", "per_1", "once");
  expect(last()).toMatchObject({ method: "POST", path: "/api/session/ses_1/permission/per_1/reply", body: { decision: "once" } });
  await ocInterrupt(conn, "ses_1");
  expect(last()).toMatchObject({ method: "POST", path: "/api/session/ses_1/interrupt" });
});

test("a failed call throws with the status and the server's text", async () => {
  await expect(ocPrompt(conn, "ses_bad", "x")).rejects.toThrow("HTTP 500");
});

test("models come back with id, provider and name", async () => {
  expect(await ocListModels(conn)).toEqual([{ id: "m1", providerID: "p1", name: "Model Satu" }]);
});

test("the event stream yields events across chunk boundaries", async () => {
  const types: string[] = [];
  for await (const e of await ocOpenEvents(conn, new AbortController().signal)) types.push(e.type);
  expect(types).toEqual(["one", "two"]);
});
