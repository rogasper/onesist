import type { ReactNode } from "react";

/** Composed empty state — icon + title + optional description/action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 px-6 text-center ${className}`}>
      {icon && <div className="opacity-40">{icon}</div>}
      <div className="text-sm text-kumo-default font-medium">{title}</div>
      {description && <div className="text-xs text-kumo-subtle max-w-sm">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
