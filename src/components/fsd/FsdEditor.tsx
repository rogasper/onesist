import { useCallback, useState, useEffect, useRef } from "react";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { MdxEditorClient } from "~/components/mdx/MdxEditorClient";

export type EditorMode = "edit" | "preview" | "split";

interface FsdEditorProps {
  content: string;
  mode: EditorMode;
  onChange: (value: string) => void;
  onSave: () => void;
  projectId: string;
}

export function FsdEditor({ content, mode, onChange, onSave, projectId }: FsdEditorProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      onSave();
    }
  }, [onSave]);

  // Debounce the preview render so typing in the editor (split mode) doesn't
  // re-render the whole MarkdownViewer + re-render every Mermaid diagram on
  // every keystroke (that was the "glitch"). Preview updates 400ms after the
  // user stops typing.
  const [previewContent, setPreviewContent] = useState(content);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (content === previewContent) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPreviewContent(content), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [content, previewContent]);

  return (
    <div className="flex-1 min-h-0 flex" onKeyDown={handleKeyDown}>
      {mode !== "preview" && (
        <div className={`h-full ${mode === "split" ? "w-1/2 border-r border-kumo-line" : "w-full"}`}>
          <MdxEditorClient content={content} onChange={onChange} projectId={projectId} />
        </div>
      )}
      {mode !== "edit" && (
        <div className={`h-full overflow-y-auto ${mode === "split" ? "w-1/2" : "w-full"} bg-kumo-elevated/20`}>
          <div className="max-w-full mx-auto px-8 pt-6 pb-16 spec-markdown text-[13px] leading-relaxed">
            <MarkdownViewer content={previewContent || "*Empty document*"} />
          </div>
        </div>
      )}
    </div>
  );
}
