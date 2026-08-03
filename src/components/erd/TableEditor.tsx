import { Button, Input, Select } from "@cloudflare/kumo";
import { X } from "@phosphor-icons/react";
import type { TableDef, ColumnDef, IndexDef } from "~/lib/dbml";

interface TableEditorProps {
  table: TableDef;
  onUpdate: (table: TableDef) => void;
  allTables: string[];
  onClose?: () => void;
}

export function TableEditor({ table, onUpdate, allTables, onClose }: TableEditorProps) {
  const updateColumn = (idx: number, partial: Partial<ColumnDef>) => {
    const cols = table.columns.map((c, i) => (i === idx ? { ...c, ...partial } : c));
    onUpdate({ ...table, columns: cols });
  };

  const addColumn = () => {
    onUpdate({
      ...table,
      columns: [...table.columns, { name: "new_col", type: "VARCHAR", isPk: false, isUnique: false, isNotNull: false, defaultValue: null, ref: null }],
    });
  };

  const removeColumn = (idx: number) => {
    onUpdate({ ...table, columns: table.columns.filter((_, i) => i !== idx) });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-kumo-line px-3 py-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-kumo-default truncate">{table.name}</h3>
        {onClose && (
          <button type="button" onClick={onClose} className="text-kumo-subtle hover:text-kumo-default shrink-0 ml-2">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {table.columns.map((col, i) => (
          <div key={`${table.name}.col.${i}.${col.name}`} className="rounded border border-kumo-line p-2 space-y-1.5 bg-kumo-elevated/30">
            <div className="flex items-center gap-1">
              <Input
                size="sm"
                value={col.name}
                onChange={(e: any) => updateColumn(i, { name: e.target.value })}
                className="flex-1 font-mono text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0 !px-1 !min-w-0"
                onClick={() => removeColumn(i)}
              >
                ✕
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Input
                size="sm"
                value={col.type}
                onChange={(e: any) => updateColumn(i, { type: e.target.value })}
                className="flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={col.isPk} onChange={(e) => updateColumn(i, { isPk: e.target.checked })} />
                PK
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={col.isUnique} onChange={(e) => updateColumn(i, { isUnique: e.target.checked })} />
                UQ
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={col.isNotNull} onChange={(e) => updateColumn(i, { isNotNull: e.target.checked })} />
                NN
              </label>
            </div>
            <div style={{ visibility: col.ref ? "visible" : "hidden", height: col.ref ? "auto" : "0px", overflow: "hidden" }}>
              <Select
                size="sm"
                value={col.ref?.table ?? ""}
                onValueChange={(v) => {
                  const tn = String(v ?? "");
                  updateColumn(i, { ref: tn ? { table: tn, column: "id" } : null });
                }}
                className="w-full text-xs font-mono"
              >
                {allTables.map((tn) => (
                  <Select.Option key={tn} value={tn}>{tn}</Select.Option>
                ))}
              </Select>
            </div>
          </div>
        ))}

        <Button variant="secondary" size="sm" onClick={addColumn} className="w-full">
          + Add column
        </Button>
      </div>
    </div>
  );
}
