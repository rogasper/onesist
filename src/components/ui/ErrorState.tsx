import type { ReactNode } from "react";

/** Composed error state — message + optional retry action. */
export function ErrorState({
  message,
  detail,
  retry,
  className = "",
}: {
  message: string;
  detail?: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 px-6 text-center ${className}`}>
      <div className="text-xs text-red-400 p-2 bg-red-400/10 rounded inline-flex items-center gap-1.5">
        <span aria-hidden>⚠</span>
        <span>{message}</span>
      </div>
      {detail && <div className="text-[11px] text-kumo-subtle max-w-sm break-all">{detail}</div>}
      {retry && (
        <button
          onClick={retry}
          className="mt-1 text-xs px-3 py-1.5 rounded-full bg-kumo-elevated border border-kumo-line text-kumo-default hover:bg-kumo-tint transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
