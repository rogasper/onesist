/**
 * Onesist's permission modes for Claude Code: what is blocked outright, what is asked, and
 * what each answer gives back to the Agent SDK.
 *
 *   bun test src/server/agent/cli/claude/permissions.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The permission module imports the run registry, which opens the database: keep it out of the user's data.db.
process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-claude-perm-")), "data.db");

const { claudePolicy, disallowedToolsFor, makeCanUseTool } = await import("./permissions");

const signal = () => new AbortController().signal;
const asked: string[] = [];
const answering = (answer: string | null) => async (_runId: string, qs: { question: string }[]) => {
  asked.push(qs[0].question);
  return answer === null ? null : [answer];
};

test("modes: auto, ask, no-shell, and read-only for read-only modes and non-agent threads", () => {
  expect(claudePolicy("auto", "agent")).toBe("auto");
  expect(claudePolicy("ask", "agent")).toBe("ask");
  expect(claudePolicy("no-shell", "agent")).toBe("no-shell");
  expect(claudePolicy("readonly", "agent")).toBe("readonly");
  expect(claudePolicy("auto", "plan")).toBe("readonly");
  expect(claudePolicy("ask", "ask")).toBe("readonly");
});

test("read-only blocks write and shell tools before Claude even asks; no-shell blocks shell", () => {
  expect(disallowedToolsFor("readonly")).toEqual(["Bash", "BashOutput", "KillShell", "Edit", "MultiEdit", "Write", "NotebookEdit"]);
  expect(disallowedToolsFor("no-shell")).toEqual(["Bash", "BashOutput", "KillShell"]);
  expect(disallowedToolsFor("ask")).toEqual([]);
  expect(disallowedToolsFor("auto")).toEqual([]);
});

test("ask: the user's answer decides; 'always' hands Claude's own suggestions back", async () => {
  // The SDK suggests a project-level destination; Onesist keeps "always" to this session only.
  const suggestions = [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "pwd" }], behavior: "allow", destination: "localSettings" }] as any;
  const once = makeCanUseTool({ runId: "r", policy: "ask", ask: answering("Izinkan sekali") as any });
  expect(await once("Bash", { command: "pwd" }, { signal: signal() } as any)).toEqual({ behavior: "allow", updatedInput: { command: "pwd" } });
  expect(asked.at(-1)).toBe("Claude Code meminta izin menjalankan perintah: pwd");

  const always = makeCanUseTool({ runId: "r", policy: "ask", ask: answering("Selalu izinkan") as any });
  expect(await always("Bash", { command: "pwd" }, { signal: signal(), suggestions } as any)).toEqual({
    behavior: "allow",
    updatedInput: { command: "pwd" },
    updatedPermissions: [{ ...suggestions[0], destination: "session" }],
  });

  const no = makeCanUseTool({ runId: "r", policy: "ask", ask: answering("Tolak") as any });
  expect(await no("Edit", { file_path: "/ws/a.md" }, { signal: signal() } as any)).toEqual({ behavior: "deny", message: "Ditolak oleh pengguna." });
  expect(asked.at(-1)).toBe("Claude Code meminta izin mengubah berkas: /ws/a.md");
});

test("an unanswered question (run stopped) denies", async () => {
  const unanswered = makeCanUseTool({ runId: "r", policy: "ask", ask: answering(null) as any });
  expect((await unanswered("Bash", { command: "ls" }, { signal: signal() } as any))?.behavior).toBe("deny");
  const aborted = new AbortController();
  aborted.abort();
  expect((await unanswered("Bash", { command: "ls" }, { signal: aborted.signal } as any))?.behavior).toBe("deny");
});

test("auto allows without asking; read-only denies anything but reads without asking; Onesist's MCP tools are always allowed", async () => {
  const before = asked.length;
  const auto = makeCanUseTool({ runId: "r", policy: "auto", ask: answering("Tolak") as any });
  expect((await auto("Write", { file_path: "/ws/x" }, { signal: signal() } as any))?.behavior).toBe("allow");
  const ro = makeCanUseTool({ runId: "r", policy: "readonly", ask: answering("Izinkan sekali") as any });
  expect((await ro("WebFetch", { url: "https://x" }, { signal: signal() } as any))?.behavior).toBe("deny");
  expect((await ro("Read", { file_path: "/ws/a" }, { signal: signal() } as any))?.behavior).toBe("allow");
  expect((await ro("mcp__onesist__onesist_thread_read", {}, { signal: signal() } as any))?.behavior).toBe("allow");
  const noShell = makeCanUseTool({ runId: "r", policy: "no-shell", ask: answering("Izinkan sekali") as any });
  expect((await noShell("Bash", { command: "ls" }, { signal: signal() } as any))?.behavior).toBe("deny");
  expect(asked.length).toBe(before);
});
