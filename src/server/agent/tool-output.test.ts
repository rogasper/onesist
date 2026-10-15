/**
 * Tool output limits: what is cut when stored, what is shortened for the transcript,
 * and how a card finds the whole output again.
 *
 *   bun test src/server/agent/tool-output.test.ts
 */
import { expect, test } from "bun:test";
import {
  TOOL_OUTPUT_STORE_MAX_CHARS, TOOL_OUTPUT_VIEW_MAX_CHARS, capToolOutputsForStore, findToolOutput,
  isToolPart, outputSize, pruneToolOutputsForView, shortenOutput,
} from "./tool-output";

const big = (n: number) => "x".repeat(n);

test("tool parts are the AI SDK's tool-* and dynamic-tool parts", () => {
  expect(isToolPart({ type: "tool-read_file" })).toBe(true);
  expect(isToolPart({ type: "dynamic-tool" })).toBe(true);
  expect(isToolPart({ type: "text" })).toBe(false);
  expect(isToolPart(null)).toBe(false);
});

test("a short output is left exactly as it is", () => {
  const output = { exitCode: 0, stdout: "ok" };
  expect(shortenOutput(output, 100, "dipotong")).toBe(output);
  expect(shortenOutput("pendek", 100, "dipotong")).toBe("pendek");
});

test("a long string is cut with a note saying how much is missing", () => {
  const out = shortenOutput(big(150), 100, "dipotong") as string;
  expect(out.startsWith(big(100))).toBe(true);
  expect(out).toContain("dipotong: 50 karakter tidak ditampilkan");
});

test("a long object keeps its short fields and cuts its long ones", () => {
  const out = shortenOutput({ exitCode: 2, ok: false, savedPath: null, stdout: big(5000), lines: [big(5000)] }, 1000, "dipendekkan") as any;
  expect(out.exitCode).toBe(2);
  expect(out.ok).toBe(false);
  expect(out.savedPath).toBeNull();
  expect(typeof out.stdout).toBe("string");
  expect(out.stdout).toContain("dipendekkan");
  expect(typeof out.lines).toBe("string");
  expect(outputSize(out)).toBeLessThan(1500);
});

test("storing cuts only tool outputs over the store limit, and says so", () => {
  const parts = [
    { type: "text", text: big(300_000) },
    { type: "tool-bash", toolCallId: "t1", output: big(TOOL_OUTPUT_STORE_MAX_CHARS + 10) },
    { type: "tool-read_file", toolCallId: "t2", output: "kecil" },
  ];
  const stored = capToolOutputsForStore(parts) as any[];
  expect(stored[0]).toBe(parts[0]);
  expect(stored[1].output.length).toBeLessThan(TOOL_OUTPUT_STORE_MAX_CHARS + 100);
  expect(stored[1].outputTruncated).toEqual({ originalChars: TOOL_OUTPUT_STORE_MAX_CHARS + 10 });
  expect(stored[2]).toBe(parts[2]);
  expect(capToolOutputsForStore("bukan array")).toBe("bukan array");
});

test("the transcript view shortens big outputs, marks them, and leaves the input untouched", () => {
  const messages = [
    { id: "m1", role: "assistant", parts: [{ type: "tool-bash", toolCallId: "t1", output: { exitCode: 1, stdout: big(TOOL_OUTPUT_VIEW_MAX_CHARS + 1) } }] },
    { id: "m2", role: "assistant", parts: [{ type: "tool-read_file", toolCallId: "t2", output: "kecil" }] },
  ];
  const view: any[] = pruneToolOutputsForView(messages);
  expect(view[0].parts[0].outputOmitted).toEqual({ chars: outputSize(messages[0].parts[0].output) });
  expect((view[0].parts[0].output as { exitCode: number }).exitCode).toBe(1);
  expect(outputSize(view[0].parts[0].output)).toBeLessThan(3_000);
  expect(view[1].parts[0]).toBe(messages[1].parts[0]);
  expect((messages[0].parts[0].output as { stdout: string }).stdout.length).toBe(TOOL_OUTPUT_VIEW_MAX_CHARS + 1);
});

test("a card finds the whole output of its tool call", () => {
  const messages = [{ parts: [{ type: "text", text: "hai" }, { type: "tool-bash", toolCallId: "t9", output: { stdout: "semua" } }] }];
  expect(findToolOutput(messages, "t9")).toEqual({ found: true, output: { stdout: "semua" } });
  expect(findToolOutput(messages, "tidak-ada")).toEqual({ found: false, output: undefined });
});
