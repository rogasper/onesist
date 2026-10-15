/**
 * Bringing a branch's work back from the chat panel.
 *
 *   bun test src/lib/merge-back-fetch.test.ts
 */
import { afterEach, expect, test } from "bun:test";
import { mergeBackThread } from "./use-chat";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a merge back posts to the branch and returns the parent", async () => {
  let asked = "";
  let method = "";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    asked = url;
    method = init?.method ?? "GET";
    return Response.json({ parentThreadId: "thr_induk", included: 2, omitted: 0 });
  }) as any;
  expect(await mergeBackThread("thr_cabang")).toEqual({ parentThreadId: "thr_induk", included: 2, omitted: 0 });
  expect(asked).toBe("/api/chat/threads/thr_cabang/merge-back");
  expect(method).toBe("POST");
});

test("a refused merge throws the server's reason", async () => {
  globalThis.fetch = (async () => Response.json({ error: "Belum ada hasil baru di cabang ini untuk dibawa." }, { status: 409 })) as any;
  await expect(mergeBackThread("thr_cabang")).rejects.toThrow("Belum ada hasil baru");
});
