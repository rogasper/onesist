/**
 * Regression: a provider that refuses a request (429, 5xx) is retried by the SDK, and
 * the thread must hear about it, so the status line can say so. The first answer
 * that is not a retry ends the retries with attempt 0.
 *
 *   bun test src/server/agent/provider-retry.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The DB client opens its file at import time, so point it at a temp file first.
process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-retry-")), "data.db");

const { eventBus } = await import("~/server/realtime/events");
const { reportProviderAttempt } = await import("~/server/agent/config");

/** Records the retry events of one thread while `run` executes. */
function capture(threadId: string, run: () => void) {
  const seen: { status: number; attempt: number }[] = [];
  const listener = (event: { data: { threadId: string; status: number; attempt: number } }) => {
    if (event.data.threadId === threadId) seen.push({ status: event.data.status, attempt: event.data.attempt });
  };
  eventBus.on("chat:provider-retry", listener);
  try {
    run();
  } finally {
    eventBus.off("chat:provider-retry", listener);
  }
  return seen;
}

test("each refused answer reports the next attempt; a clean answer ends the retries", () => {
  const seen = capture("thr_retry_a", () => {
    reportProviderAttempt("thr_retry_a", 429);
    reportProviderAttempt("thr_retry_a", 503);
    reportProviderAttempt("thr_retry_a", 200);
  });
  expect(seen).toEqual([
    { status: 429, attempt: 1 },
    { status: 503, attempt: 2 },
    { status: 200, attempt: 0 },
  ]);
});

test("a clean answer with no retry running reports nothing", () => {
  const seen = capture("thr_retry_b", () => reportProviderAttempt("thr_retry_b", 200));
  expect(seen).toEqual([]);
});

test("retries are counted per thread", () => {
  const seen = capture("thr_retry_c", () => {
    reportProviderAttempt("thr_retry_other", 429);
    reportProviderAttempt("thr_retry_c", 429);
  });
  expect(seen).toEqual([{ status: 429, attempt: 1 }]);
});
