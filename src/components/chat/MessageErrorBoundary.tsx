import { Component, type ErrorInfo, type ReactNode } from "react";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { reportClientError } from "~/lib/use-client-error-report";
import { renderErrorReport } from "~/components/chat/chat-state";

type Props = {
  /** Identifies the row in the report, so the log says which message broke. */
  context: string;
  /** Plain text of the message, shown in place of the row that failed. */
  fallbackText: string;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * Contains a failure inside one transcript row. A render error in one row used to
 * unmount the whole chat; now that row shows its plain text and the rest of the
 * transcript keeps working. The error is reported to the server log with the
 * component stack, so the next occurrence leaves evidence.
 */
export class MessageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const report = renderErrorReport(error, info.componentStack ?? "", this.props.context);
    reportClientError(report.where, report.message, report.stack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid gap-2">
        <InlineAlert>Bagian pesan ini gagal ditampilkan. Teksnya tetap tersimpan di bawah.</InlineAlert>
        <p className="whitespace-pre-wrap text-sm text-kumo-default">{this.props.fallbackText}</p>
      </div>
    );
  }
}
