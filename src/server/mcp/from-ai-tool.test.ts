/**
 * AI SDK tools become MCP tools: JSON Schema from zod, arguments validated
 * before execute, any output turned into text, errors passed through.
 *
 *   bun test src/server/mcp/from-ai-tool.test.ts
 */
import { expect, test } from "bun:test";
import { z } from "zod";
import { tool } from "ai";
import { mcpToolFromAi } from "./from-ai-tool";

const echo = tool({
  description: "Gema teks",
  inputSchema: z.object({
    text: z.string().describe("Teks yang diulang"),
    times: z.number().int().min(1).optional(),
  }),
  execute: async ({ text, times }) => text.repeat(times ?? 1),
});

test("the zod input schema becomes a JSON schema without the $schema key", () => {
  const mcp = mcpToolFromAi("x_echo", echo);
  expect(mcp.name).toBe("x_echo");
  expect(mcp.description).toBe("Gema teks");
  const schema = mcp.inputSchema as any;
  expect("$schema" in schema).toBe(false);
  expect(schema.type).toBe("object");
  expect(Object.keys(schema.properties)).toEqual(["text", "times"]);
  expect(schema.properties.text).toEqual({ type: "string", description: "Teks yang diulang" });
  expect(schema.required).toEqual(["text"]);
});

test("valid arguments run the tool and its string comes back as is", async () => {
  expect(await mcpToolFromAi("x_echo", echo).call({ text: "ab", times: 2 })).toBe("abab");
});

test("invalid arguments are refused before execute, naming the field", async () => {
  let ran = false;
  const guarded = tool({
    description: "d",
    inputSchema: z.object({ n: z.number() }),
    execute: async () => { ran = true; return "x"; },
  });
  await expect(mcpToolFromAi("g", guarded).call({ n: "satu" })).rejects.toThrow("Argumen tidak valid: n:");
  expect(ran).toBe(false);
});

test("a non-string result is returned as JSON text", async () => {
  const obj = tool({ description: "d", inputSchema: z.object({}), execute: async () => ({ a: 1 }) });
  expect(JSON.parse(await mcpToolFromAi("o", obj).call({}))).toEqual({ a: 1 });
});

test("an error thrown by the tool reaches the caller", async () => {
  const boom = tool({ description: "d", inputSchema: z.object({}), execute: async (): Promise<string> => { throw new Error("meledak"); } });
  await expect(mcpToolFromAi("b", boom).call({})).rejects.toThrow("meledak");
});
