import type { ReactNode } from "react";

interface PageHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  /** Right-aligned action buttons / controls. */
  actions?: ReactNode;
  /** Extra rows below the title (alerts, secondary controls, descriptions). */
  below?: ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, badges, actions, below, className }: PageHeaderProps) {
  return (
    <div className={className ?? "mb-3 shrink-0 space-y-2"}>
      <div className="flex items-center gap-2">
        {icon && <div className="rounded bg-kumo-elevated p-1">{icon}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-kumo-default">{title}</h1>
        {badges}
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      {below && <div>{below}</div>}
    </div>
  );
}
