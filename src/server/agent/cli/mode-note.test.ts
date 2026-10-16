/**
 * The note a CLI agent is given when its thread's mode refuses shell commands: only the prompt the
 * runtime receives carries it, never the transcript.
 *
 *   bun test src/server/agent/cli/mode-note.test.ts
 */
import { expect, test } from "bun:test";
import { modeNote, withModeNote } from "./mode-note";

test("a read-only mode gets a note that shell and file changes are not available", () => {
  const note = modeNote("ask", "ask");
  expect(note).toContain("hanya membaca");
  expect(modeNote("readonly", "agent")).toContain("hanya membaca");
  expect(modeNote("auto", "plan")).toContain("hanya membaca");
});

test("no-shell gets a note that only shell is off", () => {
  const note = modeNote("no-shell", "agent");
  expect(note).toContain("shell");
  expect(note).not.toContain("hanya membaca");
});

test("a mode that allows shell gets no note", () => {
  expect(modeNote("ask", "agent")).toBeNull();
  expect(modeNote("auto", "agent")).toBeNull();
});

test("the note goes in front of the message, and a message without a note is unchanged", () => {
  expect(withModeNote("cat berkas.md", null)).toBe("cat berkas.md");
  const joined = withModeNote("cat berkas.md", "Catatan.");
  expect(joined.startsWith("Catatan.")).toBe(true);
  expect(joined.endsWith("cat berkas.md")).toBe(true);
});
