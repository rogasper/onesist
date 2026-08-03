import { useState, useCallback } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { MermaidBlock } from "~/components/mermaid/MermaidBlock";
import type { ParsedEndpoint } from "~/lib/spec-parser";
import { methodBadge } from "./SpecSidebar";

(MermaidBlock as unknown as { displayName: string }).displayName = "MermaidBlock";

function toText(children: any, node?: any): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((c) => (typeof c === "string" ? c : c?.props?.children ? toText(c.props.children) : "")).join("");
  }
  if (node?.children?.[0]?.value) return node.children[0].value;
  return "";
}

interface SpecEndpointCardProps {
  endpoint: ParsedEndpoint;
  onNavigateDetail?: (path: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  purpose: "Purpose",
  note: "Note",
  body: "Request Body",
  response: "Response",
  query: "Query Parameters",
  validation: "Validation",
  filter: "Filter",
  action: "Action",
  logic: "Logic",
};

const DETAIL_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;

function parseDetailLink(detail: string): { path: string; label: string; ref: string } | null {
  const m = detail.match(DETAIL_LINK_RE);
  if (!m) return null;
  const refMatch = detail.slice(m.index! + m[0].length).match(/§\s*NO:\s*(\S+)/);
  return { path: m[2], label: m[1], ref: refMatch ? refMatch[1] : "" };
}

const FORMATTING_CLASS =
  "[&_p]:my-0 [&_p]:leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:bg-kumo-elevated/60 [&_code]:px-1 [&_code]:py-px [&_code]:rounded [&_a]:text-kumo-brand [&_a]:hover:underline [&_a]:break-all [&_ul]:text-xs [&_ol]:text-xs [&_li]:text-xs [&_pre]:overflow-auto [&_pre]:text-[0.75rem]";

export function SpecEndpointCard({ endpoint, onNavigateDetail }: SpecEndpointCardProps) {
  const [expanded, setExpanded] = useState(false);

  const rawMarkdown = endpoint.rawMarkdown ?? "";
  const purpose = endpoint.purpose ?? "";

  const detailFields: [string, string][] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const val = (endpoint as any)[key];
    if (val && typeof val === "string" && val.trim()) detailFields.push([key, val]);
  }

  const detailLink = endpoint.detail ? parseDetailLink(endpoint.detail) : null;

  const handleRawLink = useCallback(
    (href: string) => {
      if (href && onNavigateDetail && /^(?:output\/|MASTER_)/.test(href)) {
        onNavigateDetail(href);
      }
    },
    [onNavigateDetail],
  );

  const mdComponents = useCallback((withRawLink: boolean) => ({
    a({ href, children, ...props }: any) {
      return (
        <a
          href={href}
          onClick={(e: React.MouseEvent) => {
            if (href && withRawLink) {
              e.preventDefault();
              e.stopPropagation();
              handleRawLink(href);
            }
          }}
          {...props}
        >
          {children}
        </a>
      );
    },
    code({ className: cls, children, node, ...props }: any) {
      const classes = Array.isArray(cls) ? cls.join(" ") : (cls ?? "");
      if (/language-mermaid/.test(classes)) {
        return <MermaidBlock code={toText(children, node)} />;
      }
      return <code className={classes} {...props}>{children}</code>;
    },
    pre({ children, ...props }: any) {
      const kids = (React as any).Children.toArray(children);
      for (const kid of kids) {
        if (
          (kid as any)?.type === MermaidBlock ||
          (kid as any)?.type?.displayName === "MermaidBlock"
        ) {
          return kid;
        }
      }
      return <pre {...props}>{children}</pre>;
    },
  }), [handleRawLink]);

  return (
    <div className="rounded-lg border border-kumo-line overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-kumo-elevated/50 transition-colors"
      >
        <span className="text-[10px] text-kumo-subtle font-mono shrink-0 w-10">{endpoint.no}</span>
        {methodBadge(endpoint.method)}
        <code className="text-xs font-mono text-kumo-default truncate">{endpoint.path || endpoint.title}</code>
        <span className="text-[10px] text-kumo-subtle ml-auto opacity-50">{expanded ? "▲" : "▼"}</span>
      </button>

      {purpose && (
        <div
          className={`px-3 pb-1.5 text-xs text-kumo-default leading-relaxed ${FORMATTING_CLASS}`}
          onClick={(e) => e.stopPropagation()}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents(false)}>{purpose}</ReactMarkdown>
        </div>
      )}

      {detailLink && onNavigateDetail && (
        <div className="px-3 pb-2">
          <button
            onClick={(e) => { e.stopPropagation(); onNavigateDetail(detailLink.path); }}
            className="flex items-center gap-1 text-[11px] text-kumo-brand hover:text-kumo-brand/80 transition-colors"
          >
            <ArrowSquareOut size={12} />
            <span className="truncate">{detailLink.label}</span>
            {detailLink.ref && <span className="text-kumo-subtle ml-1">§ NO:{detailLink.ref}</span>}
          </button>
        </div>
      )}

      {expanded && detailFields.length > 1 && (
        <div className="border-t border-kumo-line px-3 py-2 space-y-2">
          {detailFields
            .filter(([k]) => k !== "purpose")
            .map(([key, val]) => (
              <div key={key}>
                <div className="text-[10px] font-medium text-kumo-default mb-0.5 uppercase tracking-wider">
                  {FIELD_LABELS[key]}
                </div>
                <div
                  className={`text-xs text-kumo-default break-words bg-kumo-elevated/30 rounded px-2 py-1 ${FORMATTING_CLASS}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents(false)}>{val}</ReactMarkdown>
                </div>
              </div>
            ))}
        </div>
      )}

      {expanded && rawMarkdown && (
        <div className="border-t border-kumo-line">
          <div className="px-3 py-1 text-[10px] text-kumo-subtle border-b border-kumo-line/50">
            Raw spec
          </div>
          <div
            className="px-3 py-2 max-h-48 overflow-auto spec-markdown-inline"
            onClick={(e) => e.stopPropagation()}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={mdComponents(true)}
            >
              {rawMarkdown.trim()}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
