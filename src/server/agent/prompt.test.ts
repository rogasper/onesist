/**
 * Regression (#69): system prompt injects Monday MCP external task-card rules whenever
 * a Monday MCP server is connected (by name or URL) and keeps the prompt clean otherwise.
 *
 *   bun test src/server/agent/prompt.test.ts
 */
import { expect, test } from "bun:test";
import { buildSystemPrompt, isMondayMcpServer } from "./prompt";

const BASE_INPUT = {
  projectName: "LoanApp",
  root: "/tmp/loan-app",
  mode: "agent" as const,
  permissionMode: "ask" as const,
  inventory: { byDir: {}, masterPresent: [] },
};

test("isMondayMcpServer matches by server name or monday.com URL", () => {
  expect(isMondayMcpServer({ name: "monday", url: null })).toBe(true);
  expect(isMondayMcpServer({ name: "pm-board", url: "https://mcp.monday.com/mcp" })).toBe(true);
  expect(isMondayMcpServer({ name: "github", url: "https://api.githubcopilot.com/mcp/" })).toBe(false);
});

test("buildSystemPrompt includes Monday MCP formatting rules when Monday MCP is connected", () => {
  const prompt = buildSystemPrompt({
    ...BASE_INPUT,
    externalMcpServers: [{ name: "monday", url: "https://mcp.monday.com/mcp" }],
  });
  expect(prompt).toContain("## Aturan kirim task ke Monday (MCP)");
  expect(prompt).toContain("task_external_card");
  expect(prompt).toContain("monday-task");
  expect(prompt).toContain("subitem");
  expect(prompt).toContain("Monday Update");
  expect(prompt).toContain("Files Scope");
  expect(prompt).toContain("output/");
});

test("buildSystemPrompt omits Monday MCP section when only non-Monday servers are connected", () => {
  const prompt = buildSystemPrompt({
    ...BASE_INPUT,
    externalMcpServers: [{ name: "github", url: "https://api.githubcopilot.com/mcp/" }],
  });
  expect(prompt).toContain("## Server MCP eksternal terhubung");
  expect(prompt).not.toContain("## Aturan kirim task ke Monday (MCP)");
});
