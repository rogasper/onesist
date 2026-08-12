import type { ReactNode } from "react";

type InlineAlertKind = "error" | "success" | "warning" | "info";

const STYLES: Record<InlineAlertKind, string> = {
  error: "text-red-400 bg-red-400/10",
  success: "text-green-400 bg-green-400/10",
  warning: "text-amber-400 bg-amber-400/10",
  info: "text-kumo-subtle bg-kumo-elevated/60",
};

interface InlineAlertProps {
  kind?: InlineAlertKind;
  className?: string;
  children: ReactNode;
}

export function InlineAlert({ kind = "error", className = "", children }: InlineAlertProps) {
  return <div className={`text-xs p-2 rounded ${STYLES[kind]} ${className}`}>{children}</div>;
}
