import { CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface ExplorerShellProps {
  collapsed: boolean;
  /** Expand handler (collapsed vertical toggle button). */
  onToggle: () => void;
  /** Vertical label shown when collapsed, e.g. "Files" / "FSD". */
  label: string;
  width?: string;
  /** Expanded header row (search box / action buttons). */
  header: ReactNode;
  /** Expanded content (file tree / list). */
  children: ReactNode;
}

export function ExplorerShell({
  collapsed,
  onToggle,
  label,
  width = "w-64",
  header,
  children,
}: ExplorerShellProps) {
  return (
    <div className={`flex overflow-hidden transition-[width] duration-300 ease-in-out shrink-0 border-r border-kumo-line bg-kumo-elevated/30 ${collapsed ? "w-7" : width}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`shrink-0 flex flex-col items-center pt-3 gap-1 overflow-hidden transition-opacity duration-200 cursor-pointer hover:bg-kumo-elevated/50 text-kumo-subtle hover:text-kumo-default ${collapsed ? "w-7 opacity-100" : "w-0 opacity-0"}`}
        title={`Show ${label}`}
      >
        <CaretRight size={12} />
        <span className="text-[9px] -rotate-90 whitespace-nowrap text-kumo-subtle mt-1 select-none">{label}</span>
      </button>
      <div className={`flex flex-col flex-1 min-w-0 transition-opacity duration-200 ${collapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`} aria-hidden={collapsed}>
        {header}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
