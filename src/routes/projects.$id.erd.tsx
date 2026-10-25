import { createFileRoute } from "@tanstack/react-router";
import { ErdView } from "~/components/erd/ErdView";

export const Route = createFileRoute("/projects/$id/erd")({
  component: ErdPage,
});

function ErdPage() {
  const { id } = Route.useParams();
  return <ErdView key={id} projectId={id} />;
}
