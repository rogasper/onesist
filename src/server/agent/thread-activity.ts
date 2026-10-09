/**
 * What is happening on each thread right now, for the thread list (M5 item 23): a run
 * going, an approval waiting, a question waiting. Read from the run registry, so the
 * list can show it from any thread without opening that thread.
 */
export interface ThreadActivity {
  running: boolean;
  pendingApprovals: number;
  pendingQuestions: number;
}

interface RunLike {
  threadId: string;
  status: string;
  pending: { size: number };
  questions: { size: number };
}

const IDLE: ThreadActivity = { running: false, pendingApprovals: 0, pendingQuestions: 0 };

/** Activity per thread, for the runs that are still going. Threads without a run are absent. */
export function threadActivityOf(runs: Iterable<RunLike>): Map<string, ThreadActivity> {
  const out = new Map<string, ThreadActivity>();
  for (const run of runs) {
    if (run.status !== "running") continue;
    const prev = out.get(run.threadId) ?? { ...IDLE };
    out.set(run.threadId, {
      running: true,
      pendingApprovals: prev.pendingApprovals + run.pending.size,
      pendingQuestions: prev.pendingQuestions + run.questions.size,
    });
  }
  return out;
}
