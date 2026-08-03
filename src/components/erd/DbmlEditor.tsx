import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { ViewUpdate } from "@codemirror/view";

interface DbmlEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function DbmlEditor({ value, onChange }: DbmlEditorProps) {
  return (
    <CodeMirror
      value={value}
      onChange={(val: string, _view: ViewUpdate) => onChange(val)}
      theme={oneDark}
      height="100%"
      extensions={[]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: false,
      }}
      className="h-full text-sm"
    />
  );
}
