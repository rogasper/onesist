/**
 * Ready-to-paste MCP configuration for the CLIs Onesist users run.
 *
 *   bun test src/server/mcp/snippets.test.ts
 */
import { expect, test } from "bun:test";
import { mcpEndpointUrl, mcpSnippets } from "./snippets";

const URL_ = "http://127.0.0.1:4321/api/mcp/projects/p1";
const TOKEN = "b".repeat(64);

test("the endpoint URL is built from the request origin", () => {
  expect(mcpEndpointUrl("http://127.0.0.1:4321", "p1")).toBe(URL_);
  expect(mcpEndpointUrl("http://localhost:4321/", "p 1")).toBe("http://localhost:4321/api/mcp/projects/p%201");
});

test("Claude Code gets an `mcp add` command over HTTP with the bearer header", () => {
  expect(mcpSnippets(URL_, TOKEN).claude).toBe(
    `claude mcp add --transport http onesist ${URL_} --header "Authorization: Bearer ${TOKEN}"`,
  );
});

test("OpenCode gets a remote MCP entry under `mcp.servers`, the shape OpenCode 2 writes", () => {
  // Checked against `opencode mcp add` (OpenCode 2.0.28): a flat `mcp.<name>` entry is not read.
  expect(JSON.parse(mcpSnippets(URL_, TOKEN).opencode)).toEqual({
    $schema: "https://opencode.ai/config.json",
    mcp: { servers: { onesist: { type: "remote", url: URL_, headers: { Authorization: `Bearer ${TOKEN}` } } } },
  });
});
