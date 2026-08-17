import type { ReactNode } from "react";

export interface FileRowProps {
  icon?: ReactNode;
  /** Label content (title, sub-lines, etc). */
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Left accent bar style (tree/list rows). */
  accent?: boolean;
  /** Indent level for tree rows. */
  depth?: number;
  /** Disable ellipsis truncation so long labels expand (horizontal scroll). */
  noTruncate?: boolean;
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
  onContextMenu,
  accent,
  depth,
  noTruncate,
  meta,
  className,
}: FileRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      className={`group flex items-center gap-2 w-full text-left ${noTruncate ? "whitespace-nowrap" : "truncate"} transition-all ${
        accent ? "border-l-2 px-3 py-1.5 text-xs" : "rounded-full px-3 py-1 my-0.5 mx-1.5 text-xs"
      } ${
        disabled ? "opacity-50 cursor-default" : "cursor-pointer"
      } ${
        active
          ? "liquid-wash border-transparent font-medium"
          : "border-transparent text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
      } ${className ?? ""}`}
      style={depth ? { paddingLeft: `${12 + depth * 9}px` } : undefined}
    >
      {icon && <span className={`shrink-0 ${active ? "text-white/90" : "opacity-50"}`}>{icon}</span>}
      <div className={`flex-1 ${noTruncate ? "min-w-max" : "min-w-0 truncate"}`}>{children}</div>
      {meta && <span className="shrink-0">{meta}</span>}
    </button>
  );
}
