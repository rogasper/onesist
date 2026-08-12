import { useCallback, useState } from "react";
import { PencilSimple, Trash, CopySimple, ClipboardText } from "@phosphor-icons/react";
import type { ContextMenuItem } from "~/components/ui/ContextMenu";

export type FileMenuTarget =
  | { kind: "file"; file: any }
  | { kind: "dir"; dir: string };

interface UseFileContextMenuOptions {
  projectId: string;
  /** Called after a copy/move completes, to refresh file lists. */
  onRefresh?: () => void;
  /** Called when the "Rename" menu item is clicked. */
  onRename?: (file: any) => void;
  /** Called when the "Delete" menu item is clicked. */
  onDelete?: (file: any) => void;
}

/**
 * Shared file-browser context menu: Rename / Delete / Copy / Paste against the
 * /api/files/* endpoints. Used by the Overview file explorer and the FSD tab.
 */
export function useFileContextMenu({ projectId, onRefresh, onRename, onDelete }: UseFileContextMenuOptions) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: FileMenuTarget } | null>(null);
  const [clipboard, setClipboard] = useState<{ path: string; name: string } | null>(null);

  const openMenu = useCallback((e: React.MouseEvent, target: FileMenuTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, target });
  }, []);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  const handleCopy = useCallback((file: any) => {
    setClipboard({ path: file.path, name: file.name });
  }, []);

  const handlePaste = useCallback(async (targetDir: string) => {
    if (!clipboard) return;
    const sameDir = clipboard.path.startsWith(targetDir.replace(/\/$/, "") + "/");
    try {
      const res = await fetch(`/api/files/${sameDir ? "copy" : "move"}`, {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, source: clipboard.path, destination: targetDir }),
      });
      if (res.ok) setClipboard(null);
    } catch {}
    onRefresh?.();
  }, [clipboard, projectId, onRefresh]);

  const menuItems: ContextMenuItem[] = ctxMenu
    ? (() => {
        const t = ctxMenu.target;
        const items: ContextMenuItem[] = [];
        if (t.kind === "file") {
          items.push({ label: "Rename", icon: <PencilSimple size={12} />, onClick: () => onRename?.(t.file) });
          items.push({ label: "Delete", icon: <Trash size={12} />, danger: true, onClick: () => onDelete?.(t.file) });
          items.push({ label: "Copy", icon: <CopySimple size={12} />, onClick: () => handleCopy(t.file) });
        }
        const pasteDir = t.kind === "file" ? t.file.path.slice(0, t.file.path.lastIndexOf("/") + 1) : t.dir;
        items.push({ label: "Paste", icon: <ClipboardText size={12} />, disabled: !clipboard, onClick: () => handlePaste(pasteDir) });
        return items;
      })()
    : [];

  return { ctxMenu, menuItems, openMenu, closeMenu };
}
