import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { MDXEditorMethods } from "@mdxeditor/editor";

const MdxEditorInner = lazy(() => import("./MdxEditorInner"));

interface MdxEditorClientProps {
  content: string;
  onChange: (value: string) => void;
}

const loadingFallback = (
  <div className="h-full flex items-center justify-center text-xs text-kumo-subtle">Loading editor…</div>
);

export function MdxEditorClient({ content, onChange }: MdxEditorClientProps) {
  const [mounted, setMounted] = useState(false);
  const editorRef = useRef<MDXEditorMethods | null>(null);
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (content === lastSynced.current) return;
    lastSynced.current = content;
    editorRef.current?.setMarkdown(content);
  }, [content]);

  if (!mounted) return loadingFallback;

  return (
    <Suspense fallback={loadingFallback}>
      <MdxEditorInner
        ref={editorRef}
        markdown={content}
        onChange={(v) => {
          lastSynced.current = v;
          onChange(v);
        }}
        className="mdxeditor-full-height"
      />
    </Suspense>
  );
}
