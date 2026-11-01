import { useEffect, useRef, useState } from "react";
import { Button, Input, Select } from "@cloudflare/kumo";
import { X } from "@phosphor-icons/react";
import type { TableDef, ColumnDef } from "~/lib/dbml";

interface TableEditorProps {
  table: TableDef;
  onUpdate: (table: TableDef) => void;
  allTables: string[];
  onClose?: () => void;
  readOnly?: boolean;
}

export function TableEditor({ table, onUpdate, allTables, onClose, readOnly = false }: TableEditorProps) {
  const [draft, setDraft] = useState<TableDef>(table);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const tableNameRef = useRef(table.name);

  const setDraftValue = (next: TableDef) => {
    draftRef.current = next;
    setDraft(next);
  };

  useEffect(() => {
    if (tableNameRef.current !== table.name) {
      tableNameRef.current = table.name;
      dirtyRef.current = false;
      setDraftValue(table);
      return;
    }
    if (!dirtyRef.current) setDraftValue(table);
  }, [table]);

  const commit = (next: TableDef) => {
    setDraftValue(next);
    dirtyRef.current = false;
    if (!readOnly) onUpdate(next);
  };

  const commitDraft = () => {
    if (!dirtyRef.current) return;
    if (JSON.stringify(draftRef.current) === JSON.stringify(table)) {
      dirtyRef.current = false;
      return;
    }
    commit(draftRef.current);
  };

  const updateColumn = (idx: number, partial: Partial<ColumnDef>, immediate = false) => {
    const columns = draftRef.current.columns.map((c, i) => (i === idx ? { ...c, ...partial } : c));
    const next = { ...draftRef.current, columns };
    if (immediate) {
      commit(next);
      return;
    }
    setDraftValue(next);
    dirtyRef.current = true;
  };

  const addColumn = () => {
    commit({
      ...draftRef.current,
      columns: [
        ...draftRef.current.columns,
        { name: "new_col", type: "VARCHAR", isPk: false, isUnique: false, isNotNull: false, defaultValue: null, ref: null },
      ],
    });
  };

  const removeColumn = (idx: number) => {
    commit({ ...draftRef.current, columns: draftRef.current.columns.filter((_, i) => i !== idx) });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-kumo-line px-3 py-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-kumo-default truncate">{table.name}</h3>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-kumo-subtle hover:text-kumo-default shrink-0 ml-2">
            <X size={14} />
          </button>
        )}
      </div>

      {readOnly && (
        <p className="border-b border-kumo-line px-3 py-2 text-[11px] leading-relaxed text-kumo-subtle">
          Berkas Markdown ini dibaca dari blok DBML-nya. Ubah schema lewat blok tersebut di editor.
        </p>
      )}

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {draft.columns.map((col, i) => (
          <div key={`${draft.name}.col.${i}`} className="rounded border border-kumo-line p-2 space-y-1.5 bg-kumo-elevated/30">
            <div className="flex items-center gap-1">
              <Input
                size="sm"
                value={col.name}
                disabled={readOnly}
                onChange={(e: any) => updateColumn(i, { name: e.target.value })}
                onBlur={commitDraft}
                onKeyDown={(e: any) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="flex-1 font-mono text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0 !px-1 !min-w-0"
                onClick={() => removeColumn(i)}
                disabled={readOnly}
              >
                ✕
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Input
                size="sm"
                value={col.type}
                disabled={readOnly}
                onChange={(e: any) => updateColumn(i, { type: e.target.value })}
                onBlur={commitDraft}
                onKeyDown={(e: any) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="flex-1 font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.isPk}
                  disabled={readOnly}
                  onChange={(e) => updateColumn(i, { isPk: e.target.checked }, true)}
                />
                PK
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.isUnique}
                  disabled={readOnly}
                  onChange={(e) => updateColumn(i, { isUnique: e.target.checked }, true)}
                />
                UQ
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.isNotNull}
                  disabled={readOnly}
                  onChange={(e) => updateColumn(i, { isNotNull: e.target.checked }, true)}
                />
                NN
              </label>
            </div>
            <div style={{ visibility: col.ref ? "visible" : "hidden", height: col.ref ? "auto" : "0px", overflow: "hidden" }}>
              <Select
                size="sm"
                value={col.ref?.table ?? ""}
                disabled={readOnly}
                onValueChange={(v) => {
                  const tn = String(v ?? "");
                  updateColumn(i, { ref: tn ? { table: tn, column: "id" } : null }, true);
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

        <Button variant="secondary" size="sm" onClick={addColumn} className="w-full" disabled={readOnly}>
          + Add column
        </Button>
      </div>
    </div>
  );
}
