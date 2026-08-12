import type { ReactNode } from "react";

/** Centered muted text used for empty content areas. */
export function Placeholder({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-center h-full text-xs text-kumo-subtle ${className}`}>
      {children}
    </div>
  );
}
