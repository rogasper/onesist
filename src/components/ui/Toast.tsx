import { useEffect } from "react";
import { CheckCircle, WarningCircle, Info, X } from "@phosphor-icons/react";

export interface ToastMessage {
  kind: "success" | "error" | "info";
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose?: () => void;
  duration?: number;
}

export function Toast({ toast, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (!toast || !onClose || duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [toast, onClose, duration]);

  if (!toast) return null;

  const styles = {
    success: "border-green-500/40 bg-green-500/15 text-green-400",
    error: "border-red-500/40 bg-red-500/15 text-red-400",
    info: "border-blue-500/40 bg-blue-500/15 text-blue-400",
  }[toast.kind];

  const Icon = {
    success: CheckCircle,
    error: WarningCircle,
    info: Info,
  }[toast.kind];

  return (
    <div
      role="alert"
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-150 ${styles}`}
    >
      <Icon size={14} className="shrink-0" />
      <span>{toast.text}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-1 p-0.5 rounded hover:bg-black/20 text-current/70 hover:text-current transition-colors"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
