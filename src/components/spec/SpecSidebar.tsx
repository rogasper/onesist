import type { ParsedSpecModule } from "~/lib/spec-parser";

interface SpecSidebarProps {
  modules: ParsedSpecModule[];
  activeModule: string | null;
  onModuleClick: (fullName: string) => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500/70 text-white",
  POST: "bg-green-500/70 text-white",
  PUT: "bg-orange-500/70 text-white",
  DELETE: "bg-red-500/70 text-white",
  PATCH: "bg-purple-500/70 text-white",
};

export function SpecSidebar({ modules, activeModule, onModuleClick }: SpecSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-medium text-kumo-default border-b border-kumo-line shrink-0">
        Modules
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {modules.map((mod) => (
          <button
            key={mod.fullName}
            onClick={() => onModuleClick(mod.fullName)}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 border-l-2 transition-colors ${
              activeModule === mod.fullName
                ? "border-kumo-brand bg-kumo-brand/15 text-kumo-default "
                : "border-transparent text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/80"
            }`}
          >
            <span className="truncate flex-1">{mod.name}</span>
            <span className="text-[10px] text-kumo-subtle shrink-0">{mod.endpoints.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function methodBadge(method: string) {
  const color = METHOD_COLORS[method];
  if (!method) return null;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium leading-none ${color || "bg-kumo-elevated text-kumo-subtle"}`}>
      {method}
    </span>
  );
}
