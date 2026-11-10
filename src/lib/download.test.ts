/**
 * The export dialog must never show the browser's own wording ("Failed to
 * fetch", "Load failed") as if it were the application's error (#59).
 *
 *   bun test src/lib/download.test.ts
 */
import { expect, test } from "bun:test";
import { downloadErrorText, downloadFilename } from "./download";

test("browser network wording becomes an actionable message", () => {
  for (const raw of ["Failed to fetch", "Load failed", "fetch failed", "The operation couldn't be completed"]) {
    expect(downloadErrorText(new TypeError(raw))).toContain("Koneksi ke server terputus");
  }
});

test("a timeout says the server stopped responding", () => {
  const abort = new Error("The operation was aborted.");
  abort.name = "AbortError";
  expect(downloadErrorText(abort)).toContain("batas waktu");
});

test("a server message is kept as it is", () => {
  expect(downloadErrorText(new Error("no such table: tasks"))).toBe("no such table: tasks");
});

test("an empty failure falls back", () => {
  expect(downloadErrorText(null, "Export gagal")).toBe("Export gagal");
  expect(downloadErrorText(new Error("   "), "Export gagal")).toBe("Export gagal");
});

test("the filename comes from the response header, with a fallback", () => {
  const withHeader = new Response("x", {
    headers: { "Content-Disposition": 'attachment; filename="handoff-Demo-v1.zip"' },
  });
  expect(downloadFilename(withHeader, "fallback.zip")).toBe("handoff-Demo-v1.zip");
  expect(downloadFilename(new Response("x"), "fallback.zip")).toBe("fallback.zip");
});
