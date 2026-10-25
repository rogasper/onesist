import { lazy, Suspense, useEffect, useState } from "react";
import type { SplitTab } from "~/lib/split-layout";
import { ListSkeleton } from "~/components/ui/Skeleton";

// Each view is heavy (ReactFlow, MDXEditor, Swagger UI): load it only when a pane opens it.
const ErdView = lazy(async () => {
  const m = await import("~/components/erd/ErdView");
  return { default: m.ErdView };
});
const SpecView = lazy(async () => {
  const m = await import("~/components/spec/SpecView");
  return { default: m.SpecView };
});
const TasksView = lazy(async () => {
  const m = await import("~/components/tasks/TasksView");
  return { default: m.TasksView };
});
const FsdView = lazy(async () => {
  const m = await import("~/components/fsd/FsdView");
  return { default: m.FsdView };
});
export interface PaneBodyProps {
  tab: SplitTab;
  projectId: string;
  /** Distinguishes panes for the FSD write lock. */
  paneId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The content of one extra split pane. Rendered on the client only: the views read
 * browser-only APIs and lazy chunks, and a pane restored from the URL must not make
 * the server render them.
 */
export function PaneBody({ tab, projectId, paneId, onDirtyChange }: PaneBodyProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <ListSkeleton />;
  return (
    <Suspense fallback={<ListSkeleton />}>
      {tab === "erd" && <ErdView projectId={projectId} />}
      {tab === "spec" && <SpecView projectId={projectId} />}
      {tab === "tasks" && <TasksView projectId={projectId} />}
      {tab === "fsd" && <FsdView projectId={projectId} paneId={paneId} onDirtyChange={onDirtyChange} />}
    </Suspense>
  );
}
