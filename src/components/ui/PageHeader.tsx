import type { ReactNode } from "react";
import { PageHelpButton } from "~/components/ui/PageHelpButton";
import type { PageHelpKey } from "~/lib/page-helpers";

interface PageHeaderProps {
  icon?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  /** Right-aligned action buttons / controls. */
  actions?: ReactNode;
  /** Extra rows below the title (alerts, secondary controls, descriptions). */
  below?: ReactNode;
  /** Shows a "?" help popup for this page (best practices / usage guide). */
  help?: PageHelpKey;
  className?: string;
}

export function PageHeader({ icon, title, badges, actions, below, help, className }: PageHeaderProps) {
  return (
    <div className={className ?? "mb-2.5 shrink-0 space-y-2"}>
      <div className="flex items-center gap-2">
        {icon && <div className="rounded bg-kumo-elevated p-1">{icon}</div>}
        <h2 className="text-lg font-semibold tracking-tight text-kumo-default">{title}</h2>
        {badges}
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          {help && <PageHelpButton help={help} />}
        </div>
      </div>
      {below && <div>{below}</div>}
    </div>
  );
}
