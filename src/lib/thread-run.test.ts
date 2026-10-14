import { afterEach, expect, test } from "bun:test";
import { threadHasRunningTurn } from "./thread-run";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(handler: () => Response | Promise<Response>) {
  globalThis.fetch = (async () => handler()) as unknown as typeof fetch;
}

test("a thread with an active run is reported as busy", async () => {
  stubFetch(() => Response.json({ thread: { id: "thr_a" }, activeRun: "run_1" }));
  expect(await threadHasRunningTurn("thr_a")).toBe(true);
});

test("a thread without an active run is idle", async () => {
  stubFetch(() => Response.json({ thread: { id: "thr_a" }, activeRun: null }));
  expect(await threadHasRunningTurn("thr_a")).toBe(false);
});

test("a failed read counts as idle, so the send reports its own error", async () => {
  stubFetch(() => new Response("nope", { status: 500 }));
  expect(await threadHasRunningTurn("thr_a")).toBe(false);
  stubFetch(() => {
    throw new Error("network down");
  });
  expect(await threadHasRunningTurn("thr_a")).toBe(false);
});
