/**
 * Regression tests for the chat queue, steering and run-watching rules.
 * Each test names the bug it guards against (see plan/agent-chat/ZCODE-PARITY.md).
 *
 *   bun test src/components/chat/chat-state.test.ts
 */
import { describe, expect, test } from "bun:test";
import { chatActivity, markTaken, settleSteers, type SteerItem } from "./chat-state";

const steer = (id: string, text = id): SteerItem => ({ id, text });

describe("markTaken", () => {
  test("marks only the steers the server confirmed", () => {
    const out = markTaken([steer("a"), steer("b")], ["b"]);
    expect(out.map((m) => m.taken)).toEqual([undefined, true]);
  });
});

describe("settleSteers", () => {
  test("a steer that is not stored and was not taken goes back to the queue", () => {
    const s = settleSteers([steer("a", "pesan a")], new Set(["x"]), ["x"]);
    expect(s.restore).toEqual(["pesan a"]);
    expect(s.clear).toBe(true);
    expect(s.wait).toBe(false);
  });

  test("a taken steer is never restored, even when the read does not contain it yet", () => {
    // Regression: the stale-read duplicate. A taken steer was re-sent as a new turn
    // because an older read did not list it. The read must wait instead.
    const items = [{ ...steer("a", "pesan a"), taken: true }];
    const s = settleSteers(items, new Set(["x"]), ["x"]);
    expect(s.wait).toBe(true);
    expect(s.restore).toEqual([]);
    expect(s.clear).toBe(false);
  });

  test("a taken steer that is stored is settled without being restored", () => {
    const items = [{ ...steer("a", "pesan a"), taken: true }];
    const s = settleSteers(items, new Set(["a", "x"]), ["x", "a"]);
    expect(s.restore).toEqual([]);
    expect(s.clear).toBe(true);
    expect(s.syncTranscript).toBe(true);
  });

  test("the transcript is not replaced while a streamed reply is still unsaved", () => {
    // The final reply is not in the read yet: keep the streamed copy.
    const s = settleSteers([], new Set(["u1"]), ["u1", "assistant-live"]);
    expect(s.syncTranscript).toBe(false);
    expect(s.clear).toBe(false);
  });

  test("nothing to settle still reports a transcript sync", () => {
    const s = settleSteers([], new Set(["u1"]), ["u1"]);
    expect(s.syncTranscript).toBe(true);
    expect(s.restore).toEqual([]);
  });
});

describe("chatActivity", () => {
  test("idle thread: nothing is busy and nothing is subscribed", () => {
    expect(chatActivity({ streaming: false, watching: false })).toEqual({
      runningElsewhere: false,
      busy: false,
      liveEvents: false,
      approvalsOn: false,
    });
  });

  test("own stream: busy, live events and approvals on", () => {
    const a = chatActivity({ streaming: true, watching: false });
    expect(a.busy).toBe(true);
    expect(a.liveEvents).toBe(true);
    expect(a.approvalsOn).toBe(true);
  });

  test("a run started elsewhere keeps approvals answerable here", () => {
    // Regression: a run parked on a write approval after a thread switch could
    // not be answered, because approvals were only loaded while streaming.
    const a = chatActivity({ streaming: false, watching: true });
    expect(a.runningElsewhere).toBe(true);
    expect(a.busy).toBe(true);
    expect(a.approvalsOn).toBe(true);
    expect(a.liveEvents).toBe(true);
  });

  test("streaming a run this client started is not 'elsewhere'", () => {
    const a = chatActivity({ streaming: true, watching: true });
    expect(a.runningElsewhere).toBe(false);
  });
});
