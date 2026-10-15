/**
 * A shortened tool card asks the server for its whole output.
 *
 *   bun test src/lib/tool-output-fetch.test.ts
 */
import { afterEach, expect, test } from "bun:test";
import { fetchToolOutput } from "./use-chat";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("the whole output comes from the thread's tool-output route", async () => {
  let asked = "";
  globalThis.fetch = (async (url: string) => {
    asked = url;
    return Response.json({ output: { stdout: "lengkap" } });
  }) as any;
  expect(await fetchToolOutput("thr_1", "call/1")).toEqual({ stdout: "lengkap" });
  expect(asked).toBe("/api/chat/threads/thr_1/tool-output/call%2F1");
});

test("a failed lookup throws with the server's message", async () => {
  globalThis.fetch = (async () => Response.json({ error: "Output tool tidak ditemukan." }, { status: 404 })) as any;
  await expect(fetchToolOutput("thr_1", "x")).rejects.toThrow("Output tool tidak ditemukan.");
});
