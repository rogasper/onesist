import { lazy, Suspense, useEffect, useState } from "react";
import type { SplitTab } from "~/lib/split-layout";
import { ListSkeleton } from "~/components/ui/Skeleton";

// Each view is heavy (ReactFlow, MDXEditor, Swagger UI): load it only when a pane opens it.
const ErdView = lazy(() => import("~/components/erd/ErdView").then((m) => ({ default: m.ErdView })));
const SpecView = lazy(() => import("~/components/spec/SpecView").then((m) => ({ default: m.SpecView })));
const TasksView = lazy(() => import("~/components/tasks/TasksView").then((m) => ({ default: m.TasksView })));
const ReviewView = lazy(() => import("~/components/tasks/ReviewView").then((m) => ({ default: m.ReviewView })));
const FsdView = lazy(() => import("~/components/fsd/FsdView").then((m) => ({ default: m.FsdView })));

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
      {tab === "review" && <ReviewView projectId={projectId} />}
    </Suspense>
  );
}
