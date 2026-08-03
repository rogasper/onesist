import { FileText, Cube, Notepad, Code } from "@phosphor-icons/react";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";

interface FsdSession {
  id: string;
  fsdInputPath: string | null;
  fsdContent: string | null;
  mode: string;
  status: string;
  artifactsJson: string | null;
  agentOutput: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FsdSessionViewProps {
  session: FsdSession;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function FsdSessionView({ session, onDelete, onClose }: FsdSessionViewProps) {
  let artifacts: Record<string, string[]> = {};
  try {
    if (session.artifactsJson) artifacts = JSON.parse(session.artifactsJson);
  } catch {}

  const artifactCount = (artifacts.spec?.length ?? 0) + (artifacts.erd?.length ?? 0) + (artifacts.task?.length ?? 0);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-kumo-line shrink-0">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-kumo-default truncate">
            {session.fsdInputPath ?? "FSD Session"}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              session.status === "completed" ? "text-green-400 bg-green-500/15" : "text-amber-400 bg-amber-500/15"
            }`}>{session.status}</span>
            <span className="text-[10px] text-kumo-subtle">mode: {session.mode}</span>
            {artifactCount > 0 && <span className="text-[10px] text-kumo-subtle">{artifactCount} artifacts</span>}
          </div>
        </div>
        <button onClick={() => onDelete(session.id)}
          className="text-[10px] text-red-400/70 hover:text-red-400 px-2 py-1 border border-red-400/20 rounded transition-colors">
          Delete
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {artifactCount > 0 && (
          <div className="px-4 py-3 border-b border-kumo-line/50">
            <div className="text-[10px] text-kumo-subtle uppercase tracking-wider mb-2">Generated artifacts</div>
            <div className="flex flex-wrap gap-2">
              {(artifacts.spec ?? []).map((f: string) => (
                <div key={f} className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 text-blue-400/80 text-[10px]">
                  <Code size={10} /> {f}
                </div>
              ))}
              {(artifacts.erd ?? []).map((f: string) => (
                <div key={f} className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/10 text-purple-400/80 text-[10px]">
                  <Cube size={10} /> {f}
                </div>
              ))}
              {(artifacts.task ?? []).map((f: string) => (
                <div key={f} className="flex items-center gap-1 px-2 py-1 rounded bg-orange-500/10 text-orange-400/80 text-[10px]">
                  <Notepad size={10} /> {f}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-b border-kumo-line/50">
          <div className="text-[10px] text-kumo-subtle uppercase tracking-wider mb-2">FSD input</div>
          <div className="spec-markdown text-[13px] leading-relaxed">
            {session.fsdContent ? (
              <MarkdownViewer content={session.fsdContent} />
            ) : (
              <span className="text-xs text-kumo-subtle italic">No content stored</span>
            )}
          </div>
        </div>

        {session.agentOutput && (
          <div className="px-4 py-3">
            <div className="text-[10px] text-kumo-subtle uppercase tracking-wider mb-2">Agent output</div>
            <div className="spec-markdown text-[13px] leading-relaxed">
              <MarkdownViewer content={session.agentOutput} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
