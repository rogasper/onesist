/**
 * One agy turn's command line, and Onesist's permission modes in agy's terms.
 *
 *   bun test src/server/agent/cli/antigravity/args.test.ts
 */
import { expect, test } from "bun:test";
import { agyArgs, agyPolicy, continueText, deniedQuestion, ESCALATE_OPTIONS, promptTooLong } from "./args";

test("a turn prints stream-json with a long timeout; a session and a model are passed when known", () => {
  expect(agyArgs({ text: "halo", sessionId: null, model: null, skipPermissions: false })).toEqual([
    "-p",
    "halo",
    "--output-format",
    "stream-json",
    "--print-timeout",
    "60m",
  ]);
  expect(agyArgs({ text: "lanjut", sessionId: "4cd04889-9baa-49dc-80a0-74254a50372a", model: "gemini-3.8-flash-low", skipPermissions: true })).toEqual([
    "-p",
    "lanjut",
    "--output-format",
    "stream-json",
    "--print-timeout",
    "60m",
    "--conversation",
    "4cd04889-9baa-49dc-80a0-74254a50372a",
    "--model",
    "gemini-3.8-flash-low",
    "--dangerously-skip-permissions",
  ]);
});

test("a prompt that starts with a dash is not read as a flag; newlines and quotes stay as they are", () => {
  expect(agyArgs({ text: "-v tolong cek", sessionId: null, model: null, skipPermissions: false })[1]).toBe(" -v tolong cek");
  expect(agyArgs({ text: '- item "satu"\n- dua', sessionId: null, model: null, skipPermissions: false })[1]).toBe(' - item "satu"\n- dua');
  expect(agyArgs({ text: "a -b", sessionId: null, model: null, skipPermissions: false })[1]).toBe("a -b");
});

test("only Windows has a command-line length limit", () => {
  const long = "x".repeat(30_001);
  expect(promptTooLong(long, "win32")).toBe(true);
  expect(promptTooLong("x".repeat(30_000), "win32")).toBe(false);
  expect(promptTooLong(long, "darwin")).toBe(false);
});

test("permission modes: auto skips, ask asks after a refusal, read-only modes refuse", () => {
  expect(agyPolicy("auto", "agent")).toBe("skip");
  expect(agyPolicy("ask", "agent")).toBe("ask");
  expect(agyPolicy("readonly", "agent")).toBe("deny");
  expect(agyPolicy("no-shell", "agent")).toBe("deny");
  expect(agyPolicy("auto", "ask")).toBe("deny");
  expect(agyPolicy("auto", "plan")).toBe("deny");
  expect(agyPolicy("ask", "plan")).toBe("deny");
});

test("the question names what was refused and says the permission covers the rest of the turn", () => {
  const denied = [
    { action: "command", display_name: "RunCommand" },
    { action: "command", display_name: "RunCommand" },
    { action: "edit" },
  ];
  expect(deniedQuestion(denied)).toBe(
    "Antigravity tidak bisa meminta izin di tengah giliran, jadi tindakan ini ditolak: RunCommand, edit. Izinkan Antigravity menjalankan semua tindakan untuk melanjutkan giliran ini?",
  );
  expect(continueText(denied)).toBe("Izin untuk tindakan yang tadi ditolak (RunCommand, edit) sekarang diberikan. Lanjutkan tugas dari pesan sebelumnya.");
  expect(deniedQuestion([{}])).toContain("ditolak: tindakan.");
  expect(ESCALATE_OPTIONS).toEqual(["Izinkan semua & lanjutkan", "Tolak"]);
});
