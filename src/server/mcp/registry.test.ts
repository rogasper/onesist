/**
 * The MCP surface of one project: exactly the five read-only tools, in order,
 * each with an object input schema. `app_write` must never appear here.
 *
 *   bun test src/server/mcp/registry.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mcp-registry-")), "data.db");

const { MCP_TOOL_NAMES, buildProjectMcpTools } = await import("./registry");

test("the project surface is the five read-only onesist_ tools, in order", () => {
  const names = buildProjectMcpTools("p-x", os.tmpdir()).map((t) => t.name);
  expect(names).toEqual([...MCP_TOOL_NAMES]);
  expect(names.some((n) => /write|edit|bash|memory/.test(n))).toBe(false);
});

test("every tool has a description and an object input schema", () => {
  for (const t of buildProjectMcpTools("p-x", os.tmpdir())) {
    expect(t.description.length).toBeGreaterThan(10);
    expect((t.inputSchema as any).type).toBe("object");
  }
});
