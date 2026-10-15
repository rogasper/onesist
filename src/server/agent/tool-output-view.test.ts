/**
 * The transcript the UI reads is shortened; the rows the model reads are not.
 *
 *   bun test src/server/agent/tool-output-view.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tool-output-view-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { TOOL_OUTPUT_VIEW_MAX_CHARS } = await import("~/server/agent/tool-output");
const { viewMessages } = await import("~/server/agent/tool-output-view");

test("a 50K tool output reaches the view shortened and the model's rows whole", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tool-output-view-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-tool-view', 'View', ${root})`);
  const thread = store.createThread({ projectId: "p-tool-view", title: "View" } as any);
  store.appendMessage({
    threadId: thread.id,
    role: "assistant",
    id: "tool-output-view-m1",
    parts: [{ type: "tool-bash", toolCallId: "tv1", output: { exitCode: 0, stdout: "z".repeat(50_000) } }],
  });
  const rows = store.listMessages(thread.id);
  const forModel = store.toUIMessages(rows);
  const forView = viewMessages(rows);
  const modelPart: any = forModel.find((m) => m.id === "tool-output-view-m1")!.parts[0];
  const viewPart: any = forView.find((m) => m.id === "tool-output-view-m1")!.parts[0];
  expect(modelPart.output.stdout.length).toBe(50_000);
  expect(JSON.stringify(viewPart.output).length).toBeLessThan(TOOL_OUTPUT_VIEW_MAX_CHARS);
  expect(viewPart.outputOmitted.chars).toBeGreaterThan(50_000);
  expect(viewPart.output.exitCode).toBe(0);
});
