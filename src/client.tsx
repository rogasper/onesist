import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { setLastComponentStack } from "~/lib/error-stack-capture";

// Diagnostic: React attaches errorInfo.componentStack for commit-phase errors
// too, but NOT onto error.componentStack. Capture it so the ErrorStack UI can
// display the exact component hierarchy of a crash.
hydrateRoot(
  document,
  <StartClient />,
  {
    onCaughtError(error, errorInfo) {
      setLastComponentStack(errorInfo?.componentStack ?? "");
      console.error("[react] caught error:", error instanceof Error ? error.message : error);
      if (errorInfo?.componentStack) console.error("[react] component stack:\n", errorInfo.componentStack);
    },
    onUncaughtError(error, errorInfo) {
      setLastComponentStack(errorInfo?.componentStack ?? "");
      console.error("[react] uncaught error:", error instanceof Error ? error.message : error);
      if (errorInfo?.componentStack) console.error("[react] component stack:\n", errorInfo.componentStack);
    },
  },
);
