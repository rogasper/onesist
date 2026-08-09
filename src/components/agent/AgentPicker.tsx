import { useState, useEffect, useRef } from "react";
import { Terminal } from "@phosphor-icons/react";

interface AgentInfo {
  name: string;
  command: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

interface AgentPickerProps {
  selected: string | null;
  onSelect: (agent: { name: string; command: string } | null) => void;
}

export function AgentPicker({ selected, onSelect }: AgentPickerProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshAgents = (autoSelect = true) => {
    fetch("/api/agent/detect", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      setAgents(data);
      if (autoSelect) {
        const found = data.find((a: AgentInfo) => a.found);
        if (found && !selected) onSelect({ name: found.name, command: found.command });
      }
    }).catch(() => {});
  };

  useEffect(() => {
    refreshAgents();
    const interval = setInterval(refreshAgents, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    requestAnimationFrame(() => document.addEventListener("click", onClick));
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen((prev) => {
      if (!prev) refreshAgents(false);
      return !prev;
    });
  };

  const active = agents.find((a) => a.command === selected);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-kumo-elevated border border-kumo-line hover:bg-kumo-elevated/80 transition-colors"
      >
        <Terminal size={12} className="text-kumo-brand" />
        <span className="text-kumo-default">{active ? active.name : "Agent..."}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-green-400" : "bg-kumo-subtle"}`} />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="fixed z-[100] w-56 bg-kumo-elevated border border-kumo-line rounded-lg shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-2.5 py-1.5 text-[10px] text-kumo-subtle border-b border-kumo-line">AI Agent CLI</div>
          {agents.map((a) => (
            <button
              key={a.name}
              onClick={() => { onSelect(a.found ? { name: a.name, command: a.command } : null); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-kumo-elevated hover:brightness-110 transition-colors ${
                selected === a.command ? "liquid-wash font-medium" : a.found ? "text-kumo-default" : "text-kumo-subtle"
              }`}
              disabled={!a.found}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${a.found ? "bg-green-400" : "bg-red-400/50"}`} />
              <span className="flex-1">{a.name}</span>
              {a.found && <span className="text-[9px] text-kumo-subtle">{a.version || "✓"}</span>}
              {!a.found && <span className="text-[9px] text-red-400/50">not found</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
