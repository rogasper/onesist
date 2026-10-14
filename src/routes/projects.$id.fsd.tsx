import { createFileRoute } from "@tanstack/react-router";
import { FsdView } from "~/components/fsd/FsdView";

export const Route = createFileRoute("/projects/$id/fsd")({
  component: FsdPage,
});

function FsdPage() {
  const { id } = Route.useParams();
  return <FsdView projectId={id} paneId="main" />;
}
