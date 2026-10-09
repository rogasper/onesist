/**
 * Regression: one shared event stream. The registry reports when the first handler arrives
 * and when the last one leaves, which is when the stream must open and close; each handler
 * hears only its own event name.
 *
 *   bun test src/lib/event-stream.test.ts
 */
import { expect, test } from "bun:test";
import { MAX_RETRIES, createRegistry, retryDelayMs } from "./event-stream";

test("the first handler opens the stream and the last one closes it", () => {
  const registry = createRegistry();
  const a = () => {};
  const b = () => {};
  expect(registry.add("chat:run", a)).toEqual({ newName: true, firstOverall: true });
  expect(registry.add("chat:turn", b)).toEqual({ newName: true, firstOverall: false });
  expect(registry.remove("chat:run", a)).toEqual({ lastOverall: false });
  expect(registry.remove("chat:turn", b)).toEqual({ lastOverall: true });
  expect(registry.size()).toBe(0);
});

test("a second handler for a name already listened to is not a new name", () => {
  const registry = createRegistry();
  registry.add("file:changed", () => {});
  expect(registry.add("file:changed", () => {}).newName).toBe(false);
});

test("an event reaches only the handlers of its own name", () => {
  const registry = createRegistry();
  const seen: string[] = [];
  registry.add("chat:run", (d) => seen.push(`run:${d.id}`));
  registry.add("chat:turn", (d) => seen.push(`turn:${d.id}`));
  registry.dispatch("chat:run", { id: 1 });
  expect(seen).toEqual(["run:1"]);
});

test("a removed handler hears nothing more", () => {
  const registry = createRegistry();
  const seen: number[] = [];
  const handler = (d: number) => seen.push(d);
  registry.add("agent:log", handler);
  registry.dispatch("agent:log", 1);
  registry.remove("agent:log", handler);
  registry.dispatch("agent:log", 2);
  expect(seen).toEqual([1]);
});

test("the same handler added twice is counted once", () => {
  const registry = createRegistry();
  const handler = () => {};
  registry.add("chat:queue", handler);
  registry.add("chat:queue", handler);
  expect(registry.size()).toBe(1);
  expect(registry.remove("chat:queue", handler)).toEqual({ lastOverall: true });
});

test("reconnects back off and are given up after the cap", () => {
  expect(retryDelayMs(1)).toBe(1500);
  expect(retryDelayMs(2)).toBe(3000);
  expect(retryDelayMs(4)).toBe(6000);
  expect(retryDelayMs(MAX_RETRIES)).toBe(6000);
  expect(retryDelayMs(MAX_RETRIES + 1)).toBeNull();
  expect(retryDelayMs(0)).toBeNull();
});
