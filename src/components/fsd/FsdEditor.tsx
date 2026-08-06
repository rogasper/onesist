import { useCallback } from "react";
import {
  FloppyDisk, Check, CheckCircle, XCircle,
  Eye, PencilSimple, Columns,
} from "@phosphor-icons/react";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { AppButton } from "~/components/ui/AppButton";
import { MdxEditorClient } from "~/components/fsd/MdxEditorClient";

export type EditorMode = "edit" | "preview" | "split";

interface FsdEditorProps {
  content: string;
  dirty: boolean;
  saving: boolean;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function FsdEditor({ content, dirty, saving, mode, onModeChange, onChange, onSave }: FsdEditorProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      onSave();
    }
  }, [onSave]);

  const modeBtn = (m: EditorMode, icon: React.ReactNode, label: string) => (
    <AppButton
      variant="chip"
      size="xs"
      active={mode === m}
      onClick={() => onModeChange(m)}
      icon={icon}
      className="px-2"
      title={label}
    />
  );

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Editor toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-kumo-line shrink-0 bg-kumo-elevated/30 flex-wrap">
        <div className="flex items-center gap-0.5 ml-auto mr-1">
          {modeBtn("edit", <PencilSimple size={11} />, "Edit")}
          {modeBtn("split", <Columns size={11} />, "Split view")}
          {modeBtn("preview", <Eye size={11} />, "Preview")}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-400/80">
              <XCircle size={10} /> Unsaved changes
            </span>
          ) : saving ? (
            <span className="flex items-center gap-1 text-[10px] text-kumo-subtle">
              <CheckCircle size={10} className="animate-pulse" /> Saving…
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-green-400/70">
              <Check size={10} /> Saved
            </span>
          )}
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors disabled:opacity-40 ${
              dirty
                ? "liquid-wash border-transparent"
                : "border-kumo-line text-kumo-subtle"
            }`}
          >
            <FloppyDisk size={11} />
            Save
          </button>
        </div>
      </div>

      {/* Editor canvas */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {mode !== "preview" && (
          <div className={`h-full ${mode === "split" ? "w-1/2 border-r border-kumo-line" : "w-full"}`}>
            <MdxEditorClient content={content} onChange={onChange} />
          </div>
        )}
        {mode !== "edit" && (
          <div className={`h-full overflow-y-auto ${mode === "split" ? "w-1/2" : "w-full"} bg-kumo-elevated/20`}>
            <div className="max-w-full mx-auto px-8 py-6 spec-markdown text-[13px] leading-relaxed">
              <MarkdownViewer content={content || "*Empty document*"} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
