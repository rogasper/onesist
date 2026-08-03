import { useEffect, useRef, useId, useState } from "react";

interface MermaidBlockProps {
  code: string;
}

let initPromise: Promise<typeof import("mermaid")> | null = null;

function ensureMermaid() {
  if (!initPromise) {
    initPromise = import("mermaid").then((mermaid) => {
      mermaid.default.initialize({
        theme: "dark",
        startOnLoad: false,
        securityLevel: "strict",
      });
      return mermaid;
    });
  }
  return initPromise;
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current || !code) return;
    let mounted = true;
    setError(null);
    (async () => {
      try {
        const mermaid = await ensureMermaid();
        if (!mounted || !ref.current) return;
        const { svg } = await mermaid.default.render(`mermaid-${id}`, code);
        if (mounted && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { mounted = false; };
  }, [code, id]);

  if (error) {
    return (
      <pre className="my-3 text-[11px] text-red-400 p-2 bg-kumo-elevated rounded border border-kumo-line whitespace-pre-wrap">
        Mermaid render error:
        {error}
      </pre>
    );
  }

  return <div ref={ref} className="mermaid-wrap my-3 flex justify-center" />;
}
