import { createFileRoute } from "@tanstack/react-router";
import { loadProjectRouteData } from "~/lib/project-queries";
import { TasksView } from "~/components/tasks/TasksView";
import type { Task } from "~/shared/types";

export const Route = createFileRoute("/projects/$id/tasks")({
  loader: async ({ params }) => {
    const { project, data } = await loadProjectRouteData(params.id);
    const tasks = ((data.tasks as any[]) || []).filter((t: any) => t.projectId === params.id);
    return { project, tasks: tasks as Task[] };
  },
  component: TasksPage,
});

function TasksPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData() as { project: any; tasks: Task[] };
  return <TasksView projectId={id} initialTasks={loaderData?.tasks ?? []} />;
}
