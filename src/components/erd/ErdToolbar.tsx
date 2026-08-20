import { Button } from "@cloudflare/kumo";
import { Code, Eye, Download, X } from "@phosphor-icons/react";
import { FilterSelect } from "~/components/ui/FilterSelect";

interface ErdToolbarProps {
  showEditor: boolean;
  onToggleEditor: () => void;
  onExportDbml: () => void;
  tableCount: number;
  tables?: string[];
  selectedTable?: string | null;
  onSelectTable?: (tableName: string | null) => void;
}

export function ErdToolbar({
  showEditor,
  onToggleEditor,
  onExportDbml,
  tableCount,
  tables = [],
  selectedTable = null,
  onSelectTable,
}: ErdToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50 gap-2 flex-wrap">
      <div className="flex items-center gap-2 text-xs text-kumo-subtle min-w-0">
        <span className="font-medium text-kumo-default shrink-0">{tableCount} tables</span>
        {tables.length > 0 && onSelectTable && (
          <div className="flex items-center gap-1 min-w-0">
            <FilterSelect
              value={selectedTable ?? ""}
              onChange={(val) => onSelectTable(val ? val : null)}
              className="h-6 text-[11px] max-w-[170px] truncate"
              title="Focus table in canvas"
            >
              <option value="">All tables (overview)</option>
              {tables.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </FilterSelect>
            {selectedTable && (
              <button
                type="button"
                onClick={() => onSelectTable(null)}
                className="text-kumo-subtle hover:text-kumo-default p-0.5 rounded"
                title="Clear table focus"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggleEditor}
          className="!gap-1"
        >
          <span style={{ display: showEditor ? "none" : "inline" }}><Code size={14} /></span>
          <span style={{ display: showEditor ? "inline" : "none" }}><Eye size={14} /></span>
          <span>{showEditor ? "Visual" : "DBML"}</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onExportDbml}
          className="!gap-1"
        >
          <Download size={14} />
          Export
        </Button>
      </div>
    </div>
  );
}
