import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./MermaidBlock";
import { DiagramSvgBlock } from "~/components/diagram/DiagramSvgBlock";

(MermaidBlock as unknown as { displayName: string }).displayName = "MermaidBlock";
(DiagramSvgBlock as unknown as { displayName: string }).displayName = "DiagramSvgBlock";

export interface MarkdownViewerProps {
  content: string;
  className?: string;
  /**
   * Optional replacement for fenced code blocks. Chat uses it to render
   * ` ```dbml `, ` ```json `, and similar as action cards (ADR-001 D8).
   *
   * Deliberately a prop, not default behavior: `MarkdownViewer` is also used
   * by the FSD, Wiki, Docs, Spec, and Task tabs. Changing the default would
   * change all those tabs too — an unrequested regression.
   *
   * Return `null` for unhandled languages to fall through to the default
   * rendering.
   */
  codeRenderer?: (lang: string, code: string) => React.ReactNode | null;
}

function toText(children: any, node?: any): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((c) => (typeof c === "string" ? c : c?.props?.children ? toText(c.props.children) : "")).join("");
  }
  if (node?.children?.[0]?.value) return node.children[0].value;
  return "";
}

function languageOf(cls: any): string {
  const classes = Array.isArray(cls) ? cls.join(" ") : (cls ?? "");
  const m = /language-([\w-]+)/.exec(classes);
  return m ? m[1].toLowerCase() : "";
}

/** Elements from `codeRenderer` and the diagram blocks stand alone — never
 *  wrapped in a `<pre>`, since the card already has its own frame. Flagged via
 *  `displayName` because the `pre` wrapper only receives element children. */
function isBareBlock(kid: React.ReactNode): boolean {
  if (!React.isValidElement(kid)) return false;
  const type = kid.type as any;
  return (
    type === MermaidBlock ||
    type === DiagramSvgBlock ||
    type?.displayName === "MermaidBlock" ||
    type?.displayName === "DiagramSvgBlock" ||
    type?.displayName === BARE_CODE_BLOCK_DISPLAY_NAME
  );
}

const BARE_CODE_BLOCK_DISPLAY_NAME = "BareCodeBlock";

export function MarkdownViewer({ content, className, codeRenderer }: MarkdownViewerProps) {
  const components: Record<string, React.ComponentType<any>> = {
    code({ className: cls, children, node, ...props }: any) {
      const lang = languageOf(cls);
      if (lang === "mermaid") {
        return <MermaidBlock code={toText(children, node)} />;
      }
      // Diagrams before `codeRenderer`: a ```diagram-svg / ```svg fence must
      // render as a diagram in chat too, where the card renderer claims any
      // block of 4 lines or more.
      if (lang === "diagram-svg" || lang === "diagram_svg") {
        return <DiagramSvgBlock code={toText(children, node)} lang="diagram-svg" />;
      }
      if (lang === "svg") {
        return <DiagramSvgBlock code={toText(children, node)} lang="svg" />;
      }
      const rendered = codeRenderer?.(lang, toText(children, node));
      if (rendered != null) {
        return rendered as any;
      }
      return <code className={cls} {...props}>{children}</code>;
    },
    pre({ children, ...props }: any) {
      const kids = React.Children.toArray(children);
      for (const kid of kids) {
        if (isBareBlock(kid)) return kid;
      }
      return <pre {...props}>{children}</pre>;
    },
  };

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export { ReactMarkdown, remarkGfm };
