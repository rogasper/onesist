import { createFileRoute } from "@tanstack/react-router";
import { SpecView } from "~/components/spec/SpecView";

export const Route = createFileRoute("/projects/$id/spec")({
  component: SpecPage,
});

function SpecPage() {
  const { id } = Route.useParams();
  return <SpecView key={id} projectId={id} />;
}
