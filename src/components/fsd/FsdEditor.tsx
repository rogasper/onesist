import { useRef, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import type { ChangeSpec } from "@codemirror/state";
import {
  FloppyDisk, Check, CheckCircle, XCircle, TextT,
  ListBullets, ListNumbers, CheckSquare, CodeBlock, Quotes, Minus, Table, Eye, PencilSimple, Columns,
} from "@phosphor-icons/react";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { AppButton } from "~/components/ui/AppButton";

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

type ToolbarAction = {
  id: string;
  icon: React.ReactNode;
  title: string;
  kind: "line" | "insert";
  apply?: (view: EditorView) => void;
  insert?: string;
};

// Strip existing markdown block markup (heading/list/quote prefixes)
const BLOCK_MARKUP = /^(?:\s{0,3}(?:#{1,6}\s+|>\s?|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\](?:\s+|$))?))/;

function stripBlockMarkup(text: string): string {
  let result = text;
  while (true) {
    const next = result.replace(BLOCK_MARKUP, "");
    if (next === result) return result;
    result = next;
  }
}

function prefixLine(prefix: string, text: string): string {
  if (!text.trim()) return text;
  return `${prefix}${stripBlockMarkup(text)}`;
}

function checklistLine(text: string): string {
  if (!text.trim()) return text;
  const match = text.match(/^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\](?:\s+|$)/);
  const checked = match?.[1]?.toLowerCase() === "x";
  return `- [${checked ? "x" : " "}] ${stripBlockMarkup(text)}`;
}

// Resolve contiguous runs of touched lines for the current selection
function selectedLineRuns(view: EditorView) {
  const { doc, selection } = view.state;
  const lineNumbers = new Set<number>();
  for (const range of selection.ranges) {
    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    const end = to > from && to === doc.lineAt(to).from ? to - 1 : to;
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(end).number; n++) lineNumbers.add(n);
  }
  const sorted = [...lineNumbers].sort((a, b) => a - b);
  const runs: { first: number; last: number }[] = [];
  for (const number of sorted) {
    const prev = runs[runs.length - 1];
    if (!prev || number !== prev.last + 1) runs.push({ first: number, last: number });
    else prev.last = number;
  }
  return runs.map(({ first, last }) => {
    const lines = Array.from({ length: last - first + 1 }, (_, i) => {
      const line = doc.line(first + i);
      return { from: line.from, to: line.to, text: line.text };
    });
    return { from: lines[0].from, to: lines[lines.length - 1].to, lines };
  });
}

function dispatchChanges(view: EditorView, changes: ChangeSpec[]) {
  if (!changes.length) return;
  view.dispatch({ changes, userEvent: "input.format", scrollIntoView: true });
  view.focus();
}

function applyLinePrefix(view: EditorView, prefix: string) {
  const changes = selectedLineRuns(view).flatMap((run) =>
    run.lines.map((line) => ({ from: line.from, to: line.to, insert: prefixLine(prefix, line.text) })),
  );
  dispatchChanges(view, changes);
}

function applyChecklist(view: EditorView) {
  const changes = selectedLineRuns(view).flatMap((run) =>
    run.lines.map((line) => ({ from: line.from, to: line.to, insert: checklistLine(line.text) })),
  );
  dispatchChanges(view, changes);
}

function applyCodeBlock(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const changes = selected
    ? [{ from, to, insert: `\`\`\`\n${selected}\n\`\`\`` }]
    : selectedLineRuns(view).map((run) => {
        const text = run.lines.map((l) => l.text).join("\n");
        return { from: run.from, to: run.to, insert: `\`\`\`\n${text}\n\`\`\`` };
      });
  dispatchChanges(view, changes);
}

function applyTable(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to).trim();
  if (!selected) {
    view.dispatch(view.state.replaceSelection("| Col 1 | Col 2 |\n|-------|-------|\n|       |       |"));
    view.focus();
    return;
  }
  const rows = selected
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `| ${l.trim().replace(/^\|?\s*|\s*\|?$/g, "")} |  |`);
  const table = `| Col 1 | Col 2 |\n|-------|-------|\n${rows.join("\n")}`;
  view.dispatch({ changes: { from, to, insert: table }, userEvent: "input.format" });
  view.focus();
}

function applyDivider(view: EditorView) {
  const changes = selectedLineRuns(view).map((run) => ({ from: run.from, to: run.to, insert: "---" }));
  dispatchChanges(view, changes);
}

const TOOLBAR_ITEMS: ToolbarAction[] = [
  { id: "h2", icon: <TextT size={13} />, title: "Heading 2", kind: "line", apply: (v) => applyLinePrefix(v, "## ") },
  { id: "h3", icon: <TextT size={11} />, title: "Heading 3", kind: "line", apply: (v) => applyLinePrefix(v, "### ") },
  { id: "bullet", icon: <ListBullets size={13} />, title: "Bullet list", kind: "line", apply: (v) => applyLinePrefix(v, "- ") },
  { id: "numbered", icon: <ListNumbers size={13} />, title: "Numbered list", kind: "line", apply: (v) => applyLinePrefix(v, "1. ") },
  { id: "checklist", icon: <CheckSquare size={13} />, title: "Checklist", kind: "line", apply: applyChecklist },
  { id: "quote", icon: <Quotes size={13} />, title: "Quote", kind: "line", apply: (v) => applyLinePrefix(v, "> ") },
  { id: "code", icon: <CodeBlock size={13} />, title: "Code block", kind: "insert", apply: applyCodeBlock },
  { id: "table", icon: <Table size={13} />, title: "Table", kind: "insert", apply: applyTable },
  { id: "divider", icon: <Minus size={13} />, title: "Divider", kind: "insert", apply: applyDivider },
];

export function FsdEditor({ content, dirty, saving, mode, onModeChange, onChange, onSave }: FsdEditorProps) {
  const editorRef = useRef<EditorView | null>(null);

  const applyToolbar = useCallback((item: ToolbarAction) => {
    const view = editorRef.current;
    if (view && view.dom.isConnected) {
      item.apply?.(view);
      return;
    }
    // No live editor (e.g. preview mode) — append the snippet
    if (item.kind === "line" && item.apply) return;
    onChange(content + "\n\n" + (item.insert ?? ""));
  }, [content, onChange]);

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
        <div className="flex items-center gap-0.5 mr-1">
          {TOOLBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyToolbar(item)}
              className="p-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated transition-colors"
              title={item.title}
            >
              {item.icon}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 ml-1 border-l border-kumo-line pl-1.5">
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
            <CodeMirror
              key="editor"
              value={content}
              onChange={onChange}
              onCreateEditor={(view) => {
                editorRef.current = view;
              }}
              
              extensions={[markdown({ base: markdownLanguage }), EditorView.lineWrapping]}
              theme={oneDark}
              height="100%"
              style={{ height: "100%", fontSize: "13px" }}
            />
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
