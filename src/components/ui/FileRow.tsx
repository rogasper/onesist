import type { ReactNode } from "react";

export interface FileRowProps {
  icon?: ReactNode;
  /** Label content (title, sub-lines, etc). */
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Left accent bar style (tree/list rows). */
  accent?: boolean;
  /** Indent level for tree rows. */
  depth?: number;
  /** Trailing element (badge, count, action button). */
  meta?: ReactNode;
  className?: string;
}

export function FileRow({
  icon,
  children,
  active,
  disabled,
  onClick,
  accent,
  depth,
  meta,
  className,
}: FileRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center gap-2 w-full text-left truncate transition-all ${
        accent ? "border-l-2 px-3 py-1.5 text-xs" : "rounded-full px-3 py-1 my-0.5 mx-1.5 text-[11px]"
      } ${
        disabled ? "opacity-50 cursor-default" : "cursor-pointer"
      } ${
        active
          ? "liquid-wash border-transparent font-medium"
          : "border-transparent text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
      } ${className ?? ""}`}
      style={depth ? { paddingLeft: `${12 + depth * 12}px` } : undefined}
    >
      {icon && <span className={`shrink-0 ${active ? "text-white/90" : "opacity-50"}`}>{icon}</span>}
      <div className="flex-1 min-w-0">{children}</div>
      {meta && <span className="shrink-0">{meta}</span>}
    </button>
  );
}
