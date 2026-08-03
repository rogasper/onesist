import { useMemo, Component } from "react";
import type { ParsedSpecModule } from "~/lib/spec-parser";
import { SpecEndpointCard } from "./SpecEndpointCard";

interface SpecViewerProps {
  modules: ParsedSpecModule[];
  activeModule: string | null;
  totalEndpoints: number;
  onNavigateDetail?: (path: string) => void;
}

class EndpointErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="text-[11px] text-red-400/80 border border-red-400/20 rounded px-2 py-1.5">
          Unable to render this endpoint
        </div>
      );
    }
    return this.props.children;
  }
}

export function SpecViewer({ modules, activeModule, totalEndpoints, onNavigateDetail }: SpecViewerProps) {
  const displayed = useMemo(() => {
    if (activeModule) {
      return modules.filter((m) => m.fullName === activeModule);
    }
    return modules;
  }, [modules, activeModule]);

  const endpointCount = useMemo(() => {
    return displayed.reduce((sum, m) => sum + m.endpoints.length, 0);
  }, [displayed]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-3 border-b border-kumo-line">
        <div className="flex items-center gap-3">
          <span className="text-xs text-kumo-default">
            {activeModule
              ? `${endpointCount} endpoint${endpointCount !== 1 ? "s" : ""}`
              : `${modules.length} modules — ${totalEndpoints} endpoints`}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-5">
        {displayed.map((mod) => (
          <ModuleSection key={mod.fullName} module={mod} onNavigateDetail={onNavigateDetail} />
        ))}
      </div>      {displayed.length === 0 && (
        <div className="flex items-center justify-center h-32 text-xs text-kumo-subtle">
          No modules match the current filter.
        </div>
      )}
    </div>
  );
}

function ModuleSection({ module: mod, onNavigateDetail }: { module: ParsedSpecModule; onNavigateDetail?: (path: string) => void }) {
  const epWithMethod = mod.endpoints.filter((e) => e.method);
  const epWithoutMethod = mod.endpoints.filter((e) => !e.method);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-kumo-default">{mod.fullName}</span>
        <span className="text-[11px] text-kumo-subtle bg-kumo-elevated px-1.5 py-0.5 rounded">
          {mod.endpoints.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {epWithMethod.map((ep) => (
          <EndpointErrorBoundary key={`${mod.fullName}-${ep.no}`}>
            <SpecEndpointCard endpoint={ep} onNavigateDetail={onNavigateDetail} />
          </EndpointErrorBoundary>
        ))}
        {epWithoutMethod.length > 0 && (
          <details className="group">
            <summary className="text-xs text-kumo-subtle cursor-pointer hover:text-kumo-default px-1 py-1 select-none">
              Non-endpoint items ({epWithoutMethod.length})
            </summary>
            <div className="mt-1 space-y-1.5 pl-4">
              {epWithoutMethod.map((ep) => (
                <EndpointErrorBoundary key={`${mod.fullName}-${ep.no}`}>
                  <SpecEndpointCard endpoint={ep} onNavigateDetail={onNavigateDetail} />
                </EndpointErrorBoundary>
              ))}
            </div>
          </details>
        )}
        {mod.endpoints.length === 0 && (
          <div className="text-[11px] text-kumo-subtle italic px-1 py-1">No endpoints in this module</div>
        )}
      </div>
    </div>
  );
}
