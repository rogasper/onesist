import { Suspense, lazy, useEffect, useState } from "react";
import { ListSkeleton } from "~/components/ui/Skeleton";

const ExcalidrawInner = lazy(() => import("./ExcalidrawInner"));

interface ExcalidrawCanvasProps {
  initialContent: string | null;
  fileName: string;
  projectId: string;
  onSave: (content: string) => Promise<boolean> | boolean;
}

export function ExcalidrawCanvas(props: ExcalidrawCanvasProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-kumo-base text-kumo-subtle gap-3">
        <ListSkeleton rows={3} className="w-64" />
        <span className="text-xs">Initializing Sketch Canvas…</span>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="w-full h-full flex flex-col items-center justify-center bg-kumo-base text-kumo-subtle gap-3">
          <ListSkeleton rows={3} className="w-64" />
          <span className="text-xs">Loading Excalidraw Engine…</span>
        </div>
      }
    >
      <ExcalidrawInner {...props} />
    </Suspense>
  );
}
