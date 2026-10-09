/**
 * Regression: a client that reattaches mid-run gets everything produced so far,
 * then the rest, with nothing missed or repeated, and the hub is released when the
 * run closes.
 *
 *   bun test src/server/agent/run-stream.test.ts
 */
import { expect, test } from "bun:test";
import { closeRunStream, hasRunStream, openRunStream, pushRunChunk, subscribeRunStream } from "./run-stream";

async function readAll(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

test("a late subscriber gets the replay, then live chunks, then the end", async () => {
  openRunStream("run_a");
  pushRunChunk("run_a", { n: 1 });
  pushRunChunk("run_a", { n: 2 });

  const sub = subscribeRunStream("run_a")!;
  const reading = readAll(sub);
  pushRunChunk("run_a", { n: 3 });
  closeRunStream("run_a");

  expect(await reading).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test("a subscriber after the run closed gets nothing to follow", () => {
  openRunStream("run_b");
  closeRunStream("run_b");
  expect(subscribeRunStream("run_b")).toBeNull();
  expect(hasRunStream("run_b")).toBe(false);
});

test("two subscribers each see every chunk exactly once", async () => {
  openRunStream("run_c");
  pushRunChunk("run_c", "x");
  const first = readAll(subscribeRunStream("run_c")!);
  pushRunChunk("run_c", "y");
  const second = readAll(subscribeRunStream("run_c")!);
  pushRunChunk("run_c", "z");
  closeRunStream("run_c");

  expect(await first).toEqual(["x", "y", "z"]);
  expect(await second).toEqual(["x", "y", "z"]);
});

test("chunks pushed after close are ignored", () => {
  openRunStream("run_d");
  closeRunStream("run_d");
  pushRunChunk("run_d", "late");
  expect(hasRunStream("run_d")).toBe(false);
});
