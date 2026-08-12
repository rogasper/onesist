import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  children: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  onOpenChange,
  onConfirm,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  children,
}: ConfirmDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog>
        <div className="p-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
            <Button variant={destructive ? "destructive" : "primary"} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
