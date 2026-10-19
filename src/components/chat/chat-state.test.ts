/**
 * Regression tests for the chat queue, steering and run-watching rules.
 * Each test names the bug it guards against (see plan/agent-chat/ZCODE-PARITY.md).
 *
 *   bun test src/components/chat/chat-state.test.ts
 */
import { describe, expect, test } from "bun:test";
import {
  afterStreamEnded,
  chatActivity,
  chatErrorReport,
  isDetailFor,
  markTaken,
  providerRetryLabel,
  renderErrorReport,
  RUN_STILL_GOING,
  resendBlock,
  settleSteers,
  threadBadges,
  type SteerItem,
} from "./chat-state";

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
      stoppable: false,
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

test("the status line names the refused request and the attempt after it", () => {
  expect(providerRetryLabel({ status: 429, attempt: 1 })).toBe("penyedia membatasi permintaan (429), percobaan ke 2");
  expect(providerRetryLabel({ status: 503, attempt: 2 })).toBe("penyedia gagal merespons (503), percobaan ke 3");
  expect(providerRetryLabel({ status: 200, attempt: 0 })).toBeNull();
  expect(providerRetryLabel(null)).toBeNull();
});

test("a thread list badge says a run is going, and how many answers it waits for", () => {
  expect(threadBadges(undefined)).toEqual([]);
  expect(threadBadges({ running: false, pendingApprovals: 0, pendingQuestions: 0 })).toEqual([]);
  expect(threadBadges({ running: true, pendingApprovals: 1, pendingQuestions: 0 })).toEqual([
    { tone: "run", label: "Berjalan" },
    { tone: "wait", label: "Menunggu 1 jawaban" },
  ]);
  expect(threadBadges({ running: true, pendingApprovals: 1, pendingQuestions: 2 })[1].label).toBe("Menunggu 3 jawaban");
});

describe("isDetailFor", () => {
  test("a detail is shown only for the thread that is selected", () => {
    expect(isDetailFor({ thread: { id: "thr_a" } }, "thr_a")).toBe(true);
    expect(isDetailFor({ thread: { id: "thr_a" } }, "thr_b")).toBe(false);
  });

  test("nothing is shown without a detail or without a selection", () => {
    expect(isDetailFor(null, "thr_a")).toBe(false);
    expect(isDetailFor({ thread: { id: "thr_a" } }, null)).toBe(false);
  });
});

describe("chatErrorReport", () => {
  test("keeps the message, the stack, and which thread and run failed, so a server log entry can be traced", () => {
    const err = new Error("Maximum update depth exceeded");
    const report = chatErrorReport(err, { threadId: "thr_1", runId: "run_9", streaming: true });
    expect(report.where).toBe("chat-stream");
    expect(report.message).toBe("Maximum update depth exceeded");
    expect(report.stack).toContain("Maximum update depth exceeded");
    expect(report.context).toBe("thread=thr_1 run=run_9 streaming=true");
  });

  test("a failure without a stack or run still produces a readable report", () => {
    const report = chatErrorReport({ message: "Load failed" } as Error, { threadId: "thr_2", runId: null, streaming: false });
    expect(report.stack).toBe("");
    expect(report.context).toBe("thread=thr_2 run=- streaming=false");
  });
});

describe("run recovery", () => {
  test("a run started elsewhere can be stopped", () => {
    expect(chatActivity({ streaming: false, watching: true })).toMatchObject({ runningElsewhere: true, busy: true, stoppable: true });
    expect(chatActivity({ streaming: false, watching: false }).stoppable).toBe(false);
  });
  test("a stream that died while the server still runs is followed, not shown as an error", () => {
    expect(afterStreamEnded({ errored: true, serverRunning: true })).toBe("follow");
  });
  test("a stream error with no run left on the server shows the error", () => {
    expect(afterStreamEnded({ errored: true, serverRunning: false })).toBe("show-error");
  });
  test("a normal end is idle", () => expect(afterStreamEnded({ errored: false, serverRunning: false })).toBe("idle"));
  test("retry and edit wait for the run instead of hitting a 409", () => {
    expect(resendBlock({ busy: false, serverRunning: true })).toBe(RUN_STILL_GOING);
    expect(resendBlock({ busy: true, serverRunning: false })).toBe(RUN_STILL_GOING);
    expect(resendBlock({ busy: false, serverRunning: false })).toBeNull();
  });
});

describe("renderErrorReport", () => {
  test("a render error keeps its message and the component stack in the report", () => {
    const err = new Error("Minified React error #185");
    err.stack = "Error: Minified React error #185\n    at Row";
    const r = renderErrorReport(err, "\n    in MessageRow\n    in ChatSurface", "thread=t1 message=m1");
    expect(r.where).toBe("chat-render");
    expect(r.message).toBe("Minified React error #185");
    expect(r.stack).toContain("at Row");
    expect(r.stack).toContain("component stack:");
    expect(r.stack).toContain("in MessageRow");
    expect(r.context).toBe("thread=t1 message=m1");
  });
  test("a non-Error value is still reported as text", () => {
    expect(renderErrorReport("boom", "", "").message).toBe("boom");
  });
  test("the stack is cut to the server's limit", () => {
    expect(renderErrorReport(new Error("x"), "a".repeat(5000), "").stack.length).toBeLessThanOrEqual(1500);
  });
});
