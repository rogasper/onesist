/**
 * MCP over JSON-RPC 2.0, stateless: initialize, ping, tools/list, tools/call,
 * notifications, errors, output bounding, and the Origin guard.
 *
 *   bun test src/server/mcp/protocol.test.ts
 */
import { expect, test } from "bun:test";
import {
  LATEST_PROTOCOL_VERSION,
  MCP_RESULT_MAX_CHARS,
  boundText,
  handleMcpMessage,
  isAllowedOrigin,
  type McpTool,
} from "./protocol";

const tools: McpTool[] = [
  { name: "t_ok", description: "selalu berhasil", inputSchema: { type: "object", properties: {} }, call: async () => "hasil" },
  { name: "t_args", description: "gema", inputSchema: { type: "object", properties: {} }, call: async (args) => JSON.stringify(args) },
  { name: "t_fail", description: "selalu gagal", inputSchema: { type: "object", properties: {} }, call: async () => { throw new Error("rusak"); } },
  { name: "t_big", description: "besar", inputSchema: { type: "object", properties: {} }, call: async () => "x".repeat(MCP_RESULT_MAX_CHARS + 500) },
];

const rpc = (method: string, params?: unknown, id: number | string = 1) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });

test("initialize keeps a supported protocol version and names the server", async () => {
  const res = await handleMcpMessage(rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "c", version: "1" } }), tools);
  expect(res?.id).toBe(1);
  const result = res?.result as any;
  expect(result.protocolVersion).toBe("2025-03-26");
  expect(result.serverInfo.name).toBe("onesist");
  expect(result.capabilities.tools).toEqual({ listChanged: false });
});

test("initialize answers an unknown protocol version with the latest one", async () => {
  const res = await handleMcpMessage(rpc("initialize", { protocolVersion: "1999-01-01" }), tools);
  expect((res?.result as any).protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
});

test("a notification (no id) gets no response", async () => {
  expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, tools)).toBeNull();
});

test("ping answers an empty result", async () => {
  expect((await handleMcpMessage(rpc("ping", undefined, "p"), tools))).toEqual({ jsonrpc: "2.0", id: "p", result: {} });
});

test("tools/list describes every tool without exposing the call function", async () => {
  const result = (await handleMcpMessage(rpc("tools/list"), tools))?.result as any;
  expect(result.tools.map((t: any) => t.name)).toEqual(["t_ok", "t_args", "t_fail", "t_big"]);
  expect(Object.keys(result.tools[0]).sort()).toEqual(["description", "inputSchema", "name"]);
});

test("tools/call returns the tool's text and passes the arguments through", async () => {
  const ok = (await handleMcpMessage(rpc("tools/call", { name: "t_ok" }), tools))?.result as any;
  expect(ok).toEqual({ content: [{ type: "text", text: "hasil" }], isError: false });
  const args = (await handleMcpMessage(rpc("tools/call", { name: "t_args", arguments: { a: 1 } }), tools))?.result as any;
  expect(args.content[0].text).toBe('{"a":1}');
});

test("a tool that throws becomes an error result, not a protocol error", async () => {
  const res = await handleMcpMessage(rpc("tools/call", { name: "t_fail" }), tools);
  expect(res?.error).toBeUndefined();
  expect(res?.result).toEqual({ content: [{ type: "text", text: "rusak" }], isError: true });
});

test("a huge tool result is cut to the limit with a note", async () => {
  const text = ((await handleMcpMessage(rpc("tools/call", { name: "t_big" }), tools))?.result as any).content[0].text as string;
  expect(text.startsWith("x".repeat(MCP_RESULT_MAX_CHARS))).toBe(true);
  expect(text).toContain("dipotong");
  expect(text.length).toBeLessThan(MCP_RESULT_MAX_CHARS + 300);
});

test("an unknown tool or non-object arguments are invalid params", async () => {
  expect((await handleMcpMessage(rpc("tools/call", { name: "nope" }), tools))?.error?.code).toBe(-32602);
  expect((await handleMcpMessage(rpc("tools/call", { name: "t_ok", arguments: [1] }), tools))?.error?.code).toBe(-32602);
});

test("an unknown method keeps the request id", async () => {
  expect(await handleMcpMessage(rpc("resources/list", undefined, 7), tools)).toEqual({
    jsonrpc: "2.0", id: 7, error: { code: -32601, message: "Method not found: resources/list" },
  });
});

test("arrays, non-objects and missing jsonrpc are invalid requests", async () => {
  for (const bad of [[rpc("ping")], "ping", 42, null, { id: 1, method: "ping" }]) {
    expect((await handleMcpMessage(bad, tools))?.error?.code).toBe(-32600);
  }
});

test("boundText leaves short text alone", () => {
  expect(boundText("pendek")).toBe("pendek");
  expect(boundText("abcdef", 3).startsWith("abc\n")).toBe(true);
});

test("only local origins, or none at all, are allowed", () => {
  expect(isAllowedOrigin(null)).toBe(true);
  expect(isAllowedOrigin("http://localhost:4321")).toBe(true);
  expect(isAllowedOrigin("http://127.0.0.1:4400")).toBe(true);
  expect(isAllowedOrigin("http://[::1]:4321")).toBe(true);
  expect(isAllowedOrigin("https://evil.example")).toBe(false);
  expect(isAllowedOrigin("http://localhost.evil.example")).toBe(false);
  expect(isAllowedOrigin("not a url")).toBe(false);
});
