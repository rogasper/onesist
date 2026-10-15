/**
 * How a runtime's state reads in the UI, and the per-page cache of status requests.
 *
 *   bun test src/lib/runtime-status.test.ts
 */
import { afterEach, expect, test } from "bun:test";
import { RUNTIME_STATE_LABEL, fetchRuntimeStatus, runtimeStateClass } from "./runtime-status";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("every state has an Indonesian label and a tone", () => {
  expect(RUNTIME_STATE_LABEL).toEqual({ ready: "Siap", not_installed: "Belum terpasang", not_ready: "Belum login", error: "Tidak terhubung" });
  expect(runtimeStateClass("ready")).toBe("text-kumo-subtle");
  expect(runtimeStateClass("not_ready")).toBe("text-amber-500");
  expect(runtimeStateClass("error")).toBe("text-red-400");
});

test("one request per provider until forced; a failure answers with an error status and is retried", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) throw new Error("jaringan putus");
    return Response.json({ status: { state: "ready", version: "2", message: "ok" } });
  }) as any;
  expect((await fetchRuntimeStatus("prov-status-a")).state).toBe("error");
  expect((await fetchRuntimeStatus("prov-status-a")).state).toBe("ready");
  await fetchRuntimeStatus("prov-status-a");
  expect(calls).toBe(2);
  await fetchRuntimeStatus("prov-status-a", true);
  expect(calls).toBe(3);
});
