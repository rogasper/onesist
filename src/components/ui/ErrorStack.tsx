import { getLastComponentStack } from "~/lib/error-stack-capture";

interface ErrorStackProps {
  error: unknown;
  reset?: () => void;
}

/**
 * Diagnostic error component (router defaultErrorComponent). Replaces the
 * generic CatchBoundaryImpl UI with one that SURFACES React's component stack,
 * so a commit-time crash like "insertBefore not a child" can be traced to the
 * exact component instead of guessing.
 *
 * Note: commit-phase errors do NOT carry error.componentStack — React provides
 * it only via the root's onCaughtError/onUncaughtError, which client.tsx
 * captures into getLastComponentStack().
 */
export function ErrorStack({ error, reset }: ErrorStackProps) {
  const err = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
  const captured = getLastComponentStack();
  const stack = captured || (error as { componentStack?: string } | null)?.componentStack || "";
  const detail = stack || err.stack || err.message;

  return (
    <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-red-400">Runtime error</span>
        <button
          onClick={reset}
          className="ml-auto px-3 py-1 text-xs font-medium rounded-full border border-kumo-line text-kumo-default hover:bg-kumo-elevated transition-colors"
        >
          Coba lagi
        </button>
      </div>
      <div className="mt-1.5 text-[11px] text-red-300/80 break-all">{err.message}</div>
      {stack ? (
        <>
          <div className="mt-3 text-[10px] font-medium text-kumo-subtle uppercase tracking-wider">
            Component stack
          </div>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px] font-mono text-red-200/90">
            {stack}
          </pre>
        </>
      ) : (
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px] font-mono text-red-200/90">
          {detail}
        </pre>
      )}
    </div>
  );
}
