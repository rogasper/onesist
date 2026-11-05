/**
 * "Tambah tabel" — a new table has to come from somewhere once the agent is not
 * the only author. The dialog only collects a name and the starting columns;
 * the block it produces is inserted into the DBML artifact as-is, so it behaves
 * exactly like a table the agent wrote.
 */
import { useEffect, useState } from "react";
import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle, Input } from "@cloudflare/kumo";
import { Plus, X } from "@phosphor-icons/react";
import type { ColumnDef, TableDef } from "~/lib/dbml";

interface AddTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tables already in the schema — a duplicate name would shadow one. */
  existingTables: string[];
  onCreate: (table: TableDef) => void;
}

interface DraftColumn {
  name: string;
  type: string;
  isPk: boolean;
}

const START_COLUMNS: DraftColumn[] = [{ name: "id", type: "uuid", isPk: true }];

export function AddTableDialog({ open, onOpenChange, existingTables, onCreate }: AddTableDialogProps) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<DraftColumn[]>(START_COLUMNS);
  const [error, setError] = useState<string | null>(null);

  // Reopening starts clean: a cancelled draft must not linger.
  useEffect(() => {
    if (!open) return;
    setName("");
    setColumns(START_COLUMNS);
    setError(null);
  }, [open]);

  const updateColumn = (index: number, patch: Partial<DraftColumn>) => {
    setColumns((current) => current.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const submit = () => {
    const tableName = name.trim();
    if (!tableName) {
      setError("Nama tabel wajib diisi.");
      return;
    }
    if (existingTables.some((t) => t.toLowerCase() === tableName.toLowerCase())) {
      setError(`Tabel "${tableName}" sudah ada di schema ini.`);
      return;
    }
    const filled = columns
      .map((c) => ({ ...c, name: c.name.trim(), type: c.type.trim() }))
      .filter((c) => c.name.length > 0);
    if (filled.length === 0) {
      setError("Isi minimal satu kolom.");
      return;
    }
    const seen = new Set<string>();
    for (const c of filled) {
      if (seen.has(c.name)) {
        setError(`Kolom "${c.name}" ditulis dua kali.`);
        return;
      }
      seen.add(c.name);
    }

    const def: ColumnDef[] = filled.map((c) => ({
      name: c.name,
      type: c.type || "varchar",
      isPk: c.isPk,
      isUnique: false,
      isNotNull: !!c.isPk,
      defaultValue: null,
      ref: null,
    }));
    onCreate({ name: tableName, columns: def, indexes: [] });
    onOpenChange(false);
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog className="sm:w-[30rem]">
        <div className="p-5">
          <DialogTitle>Tambah tabel</DialogTitle>
          <DialogDescription>
            Tabel baru ditambahkan ke berkas DBML yang sedang dibuka.
          </DialogDescription>

          <div className="mt-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-kumo-subtle">Nama tabel</span>
              <Input
                size="sm"
                autoFocus
                value={name}
                placeholder="mis. audit_log"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                className="w-full font-mono text-xs"
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs text-kumo-subtle">Kolom awal</span>
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    size="sm"
                    value={col.name}
                    placeholder="nama"
                    onChange={(e) => updateColumn(i, { name: e.target.value })}
                    className="flex-1 font-mono text-xs"
                  />
                  <Input
                    size="sm"
                    value={col.type}
                    placeholder="tipe"
                    onChange={(e) => updateColumn(i, { type: e.target.value })}
                    className="w-28 font-mono text-xs"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-kumo-subtle shrink-0">
                    <input
                      type="checkbox"
                      checked={col.isPk}
                      onChange={(e) => updateColumn(i, { isPk: e.target.checked })}
                    />
                    PK
                  </label>
                  <button
                    type="button"
                    aria-label={`Hapus kolom ${col.name || i + 1}`}
                    disabled={columns.length === 1}
                    onClick={() => setColumns((current) => current.filter((_, idx) => idx !== i))}
                    className="text-kumo-subtle hover:text-kumo-default disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setColumns((current) => [...current, { name: "", type: "varchar", isPk: false }])}
                className="!gap-1 !px-2"
              >
                <Plus size={12} /> Kolom
              </Button>
            </div>

            {error ? <p className="text-xs text-red-400">{error}</p> : null}
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={submit}>
              Tambah tabel
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
