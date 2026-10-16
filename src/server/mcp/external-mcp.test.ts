import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mcp-test-")), "data.db");

const { db } = await import("~/server/db/client");
const { mcpServers } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const { fetchServerTools, loadMcpToolsForTurn, closeAllMcpClients } = await import("./client");
const { isExternalTool, isServerReadOnly } = await import("../agent/tools");

let mockPort = 0;
let mockServer: any;

beforeAll(async () => {
  mockServer = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const msg = body ? JSON.parse(body) : null;
    const reply = (result: unknown) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg?.id ?? null, result }));
    };
    if (!msg) {
      res.statusCode = 202;
      return res.end();
    }
    if (msg.method === "initialize") {
      return reply({
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "mock-mcp", version: "1" },
        instructions: "Mock server instructions",
      });
    }
    if (msg.method === "notifications/initialized") {
      res.statusCode = 202;
      return res.end();
    }
    if (msg.method === "tools/list") {
      return reply({
        tools: [
          {
            name: "get_repo",
            description: "Get repository details",
            inputSchema: { type: "object", properties: { owner: { type: "string" } }, required: ["owner"] },
          },
        ],
      });
    }
    if (msg.method === "tools/call") {
      return reply({ content: [{ type: "text", text: `repo owner` }], isError: false });
    }
    return reply({});
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  mockPort = (mockServer.address() as any).port;
});

afterAll(async () => {
  await closeAllMcpClients();
  mockServer?.close();
});

test("mcp_servers table persistence and CRUD behavior", () => {
  const rowId = "mcp_test_1";
  db.insert(mcpServers)
    .values({
      id: rowId,
      name: "github",
      preset: "github",
      transport: "http",
      url: `http://127.0.0.1:${mockPort}`,
      authKind: "header",
      authHeader: "Authorization",
      authValue: "Bearer secret",
      readOnly: true,
      enabled: true,
    })
    .run();

  const found = db.select().from(mcpServers).where(eq(mcpServers.id, rowId)).get();
  expect(found).toBeDefined();
  expect(found?.name).toBe("github");
  expect(found?.readOnly).toBe(true);

  expect(isExternalTool("github__get_repo")).toBe(true);
  expect(isExternalTool("read_file")).toBe(false);
  expect(isServerReadOnly("github__get_repo")).toBe(true);
});

test("fetchServerTools connects to mock MCP server and loads tools", async () => {
  const row = db.select().from(mcpServers).where(eq(mcpServers.name, "github")).get()!;
  const { tools, count, instructions } = await fetchServerTools(row as any);
  expect(count).toBe(1);
  expect(tools["get_repo"]).toBeDefined();
  expect(instructions).toBe("Mock server instructions");
});

/**
 * Acquiring a credential and saving it are separate steps: Batal or a preset
 * change must leave no trace, so the value waits under a reference until a row
 * is written.
 */
test("an acquired credential is held by reference and consumed on save", async () => {
  const { putCredential, peekCredential, takeCredential } = await import("./credentials");

  const ref = putCredential({ authKind: "header", authHeader: "Authorization", authValue: "Bearer held" });
  expect(peekCredential(ref)?.authValue).toBe("Bearer held");
  // Peeking must not consume: a test may resolve the same reference again.
  expect(peekCredential(ref)?.authValue).toBe("Bearer held");
  expect(takeCredential(ref)?.authValue).toBe("Bearer held");
  expect(peekCredential(ref)).toBeNull();

  expect(peekCredential("unknown-ref")).toBeNull();
  expect(peekCredential("")).toBeNull();
});

test("a changed credential is not served from the previous connection", async () => {
  let authSeen: string[] = [];
  const observing = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    authSeen.push(String(req.headers.authorization ?? ""));
    const msg = body ? JSON.parse(body) : null;
    const reply = (result: unknown) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg?.id ?? null, result }));
    };
    if (!msg) {
      res.statusCode = 202;
      return res.end();
    }
    if (msg.method === "initialize") {
      return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "auth-probe", version: "1" } });
    }
    if (msg.method === "notifications/initialized") {
      res.statusCode = 202;
      return res.end();
    }
    if (msg.method === "tools/list") return reply({ tools: [] });
    return reply({});
  });
  await new Promise<void>((r) => observing.listen(0, "127.0.0.1", () => r()));
  const port = (observing.address() as any).port;

  const base = { id: "draft", name: "d", transport: "http" as const, url: `http://127.0.0.1:${port}`, command: null, argsJson: null, envJson: null, authKind: "header" as const, authHeader: "Authorization" };

  await fetchServerTools({ ...base, authValue: "token-one" } as any);
  await fetchServerTools({ ...base, authValue: "token-two" } as any);

  // Both credentials must reach the server: the second call is a new connection,
  // not a reuse of the first.
  expect(authSeen).toContain("Bearer token-one");
  expect(authSeen).toContain("Bearer token-two");

  observing.close();
});
