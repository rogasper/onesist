import { useState } from "react";
import { ArrowsClockwise, Play } from "@phosphor-icons/react";
import { useFileList, useFileContent } from "~/lib/use-file-data";

export function TimelineViewer({ projectId }: { projectId: string }) {
  const { files } = useFileList("output", projectId);
  const timelineFiles = files
    .filter(
      (f) =>
        f.ext === ".html" &&
        (f.type === "timeline" || /(timeline|gantt|roadmap|schedule|sprint[-_]?plan)/i.test(f.path)),
    )
    .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0) || b.path.localeCompare(a.path));
  const [selected, setSelected] = useState<string | null>(null);
  const activePath = selected ?? timelineFiles[0]?.path ?? null;
  const { content, loading, refresh } = useFileContent(activePath, projectId);

  if (timelineFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-kumo-subtle text-sm gap-2">
        <Play size={28} className="opacity-40" />
        <p>No timeline artifact found</p>
        <p className="text-xs text-kumo-subtle/70 max-w-md text-center">
          Ask the AI agent to generate a timeline (e.g. <code className="text-[11px] bg-kumo-elevated px-1 rounded">output/timeline.html</code>)
          from the task artifacts to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 text-[10px] overflow-x-auto">
          {timelineFiles.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelected(f.path)}
              className={`px-1.5 py-0.5 rounded border shrink-0 transition-colors ${
                activePath === f.path
                  ? "border-kumo-brand bg-kumo-brand/15 text-kumo-default font-medium"
                  : "border-kumo-line text-kumo-subtle hover:text-kumo-default"
              }`}
            >
              {f.path.replace(/^output\//, "")}
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          className="ml-auto flex items-center gap-1.5 px-2 py-1 text-[11px] rounded border border-kumo-line bg-kumo-elevated text-kumo-subtle hover:text-kumo-default transition-colors"
        >
          <ArrowsClockwise size={11} />
          Refresh
        </button>
      </div>
      <div className="flex-1 min-h-0 rounded-lg border border-kumo-line overflow-hidden bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-full text-xs text-kumo-subtle">Loading timeline…</div>
        ) : content ? (
          <iframe
            title={`Timeline: ${activePath}`}
            srcDoc={content}
            sandbox="allow-scripts"
            className="w-full h-full border-0"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-kumo-subtle">Unable to load timeline</div>
        )}
      </div>
    </div>
  );
}
