import { Button } from "@cloudflare/kumo";
import { Code, Eye, Download, X, PencilSimple, Plus, Trash, FloppyDisk } from "@phosphor-icons/react";
import { FilePicker } from "~/components/ui/FilePicker";

export interface ErdTableOption {
  name: string;
  columns: number;
}

interface ErdToolbarProps {
  showEditor: boolean;
  onToggleEditor: () => void;
  onExportDbml: () => void;
  tableCount: number;
  tables?: ErdTableOption[];
  selectedTable?: string | null;
  onSelectTable?: (tableName: string | null) => void;
  onOpenTableEditor?: () => void;
  tableEditorOpen?: boolean;
  /** False for a markdown file whose DBML cannot be written back. */
  canEdit?: boolean;
  /** `clean` means the file already matches what is on screen. */
  saveState?: "clean" | "dirty" | "saving" | "error";
  onSave?: () => void;
  onAddTable?: () => void;
  onDeleteTable?: () => void;
}

export function ErdToolbar({
  showEditor,
  onToggleEditor,
  onExportDbml,
  tableCount,
  tables = [],
  selectedTable = null,
  onSelectTable,
  onOpenTableEditor,
  tableEditorOpen = false,
  canEdit = false,
  saveState = "clean",
  onSave,
  onAddTable,
  onDeleteTable,
}: ErdToolbarProps) {
  const tableItems = [
    { value: "", label: "All tables (overview)", hint: `${tables.length} tabel` },
    ...tables.map((table) => ({ value: table.name, label: table.name, hint: `${table.columns} kolom` })),
  ];

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50 gap-2 flex-wrap">
      <div className="flex items-center gap-2 text-xs text-kumo-subtle min-w-0">
        <span className="font-medium text-kumo-default shrink-0">{tableCount} tables</span>
        {tables.length > 0 && onSelectTable && (
          <div className="flex items-center gap-1 min-w-0">
            <FilePicker
              items={tableItems}
              value={selectedTable ?? ""}
              onChange={(value) => onSelectTable(value ? value : null)}
              title="Focus table in canvas"
              ariaLabel="Focus table in canvas"
              placeholder="Semua tabel"
              searchPlaceholder="Cari tabel…"
              emptyLabel="Tidak ada tabel yang cocok"
            />
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
        {onAddTable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onAddTable}
            disabled={!canEdit}
            className="!gap-1"
            aria-label="Tambah tabel"
            title={canEdit ? "Tambah tabel ke artifact DBML" : "Berkas ini tidak bisa ditulis (blok DBML tidak tunggal)"}
          >
            <Plus size={14} />
            Tabel
          </Button>
        )}
        {selectedTable && onDeleteTable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onDeleteTable}
            disabled={!canEdit}
            className="!gap-1"
            aria-label="Hapus tabel"
            title="Hapus tabel dari artifact"
          >
            <Trash size={14} />
          </Button>
        )}
        {onSave && (
          <Button
            variant={saveState === "error" ? "secondary-destructive" : "secondary"}
            size="sm"
            onClick={onSave}
            disabled={!canEdit || saveState === "clean" || saveState === "saving"}
            className="!gap-1"
            aria-label="Simpan ke artifact"
            title={
              saveState === "error"
                ? "Gagal menyimpan — tekan untuk mencoba lagi"
                : saveState === "clean"
                  ? "Tidak ada perubahan yang perlu disimpan"
                  : "Tulis perubahan ke berkas sekarang (tersimpan otomatis setelah 1,2 detik)"
            }
          >
            <FloppyDisk size={14} />
            {saveState === "saving"
              ? "Menyimpan…"
              : saveState === "error"
                ? "Gagal simpan"
                : saveState === "dirty"
                  ? "Simpan"
                  : "Tersimpan"}
          </Button>
        )}
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
        {selectedTable && onOpenTableEditor && !tableEditorOpen && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenTableEditor}
            className="!gap-1"
            title="Edit tabel"
          >
            <PencilSimple size={14} />
            Edit
          </Button>
        )}
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
