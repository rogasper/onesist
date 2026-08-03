import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./MermaidBlock";

(MermaidBlock as unknown as { displayName: string }).displayName = "MermaidBlock";

export interface MarkdownViewerProps {
  content: string;
  className?: string;
}

function toText(children: any, node?: any): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((c) => (typeof c === "string" ? c : c?.props?.children ? toText(c.props.children) : "")).join("");
  }
  if (node?.children?.[0]?.value) return node.children[0].value;
  return "";
}

function isMermaid(cls: any): boolean {
  const classes = Array.isArray(cls) ? cls.join(" ") : (cls ?? "");
  return /language-mermaid/.test(classes);
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  const components: Record<string, React.ComponentType<any>> = {
    code({ className: cls, children, node, ...props }: any) {
      if (isMermaid(cls)) {
        return <MermaidBlock code={toText(children, node)} />;
      }
      return <code className={cls} {...props}>{children}</code>;
    },
    pre({ children, ...props }: any) {
      const kids = React.Children.toArray(children);
      for (const kid of kids) {
        if (
          React.isValidElement(kid) &&
          ((kid.type as any) === MermaidBlock || (kid.type as any)?.displayName === "MermaidBlock")
        ) {
          return kid;
        }
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
