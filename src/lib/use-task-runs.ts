import { useCallback, useEffect, useState } from "react";
import { subscribe } from "~/lib/event-stream";
import type { RunSummary } from "~/shared/types";

/**
 * The newest run of each task in a project. It reloads when a chat run ends or a question
 * opens or closes; there is no polling.
 */
export function useTaskRuns(projectId: string): { runs: Record<string, RunSummary>; reload: () => void } {
  const [runs, setRuns] = useState<Record<string, RunSummary>>({});

  const reload = useCallback((refresh = false) => {
    const q = refresh ? "?refresh=1" : "";
    fetch(`/api/projects/${projectId}/task-runs${q}`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as RunSummary[]) : []))
      .then((list) => setRuns(Object.fromEntries(list.map((run) => [run.taskId, run]))))
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    // Opening the board refreshes PR states from GitHub once; later changes arrive as events.
    reload(true);
    const offs = ["chat:run", "chat:question", "chat:question-resolved"].map((type) => subscribe(type, () => reload()));
    return () => offs.forEach((off) => off());
  }, [reload]);

  return { runs, reload };
}
