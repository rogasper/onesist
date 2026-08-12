import { Component, type ReactNode } from "react";

interface TerminalErrorBoundaryProps {
  children: ReactNode;
  /** Bump the wrapped component's key so a retry remounts it fresh. */
  onRetry?: () => void;
}

interface TerminalErrorBoundaryState {
  hasError: boolean;
  message: string;
  stack: string;
}

/**
 * Local error boundary around the embedded terminal. A render/commit error in
 * the xterm panel (e.g. React's "insertBefore not a child" race with xterm's
 * DOM) must NOT tear down the whole project page via the router's
 * CatchBoundaryImpl — contain it here, show a recovery UI, and log the
 * component stack for diagnostics.
 */
export class TerminalErrorBoundary extends Component<TerminalErrorBoundaryProps, TerminalErrorBoundaryState> {
  state: TerminalErrorBoundaryState = { hasError: false, message: "", stack: "" };

  static getDerivedStateFromError(error: unknown): Partial<TerminalErrorBoundaryState> {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[terminal] error boundary caught:", error);
    const stack = (info as { componentStack?: string } | null)?.componentStack ?? "";
    if (stack) console.error("[terminal] component stack:\n", stack);
    this.setState({ stack });
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: "", stack: "" });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="shrink-0 h-full w-[420px] border-l border-kumo-line bg-[#0d0d0d] flex flex-col items-center justify-center text-center px-6">
          <p className="text-xs text-red-400 font-medium">Terminal bermasalah</p>
          <p className="text-[11px] text-kumo-subtle mt-1 break-all max-w-[320px]">{this.state.message}</p>
          <button
            onClick={this.handleRetry}
            className="mt-3 px-3 py-1.5 text-xs rounded-full border border-kumo-line text-kumo-default hover:bg-kumo-elevated transition-colors"
          >
            Muat ulang panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
