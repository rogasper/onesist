import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const menuWidth = 168;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - items.length * 30 - 32);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border border-kumo-line bg-kumo-elevated shadow-lg py-1 text-xs"
      style={{ left: clampedX, top: clampedY, minWidth: menuWidth }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onClick();
          }}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
            item.disabled
              ? "text-kumo-subtle opacity-40 cursor-not-allowed"
              : item.danger
                ? "text-red-400 hover:bg-red-400/10"
                : "text-kumo-default hover:bg-kumo-tint"
          }`}
        >
          {item.icon && <span className="opacity-60">{item.icon}</span>}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
