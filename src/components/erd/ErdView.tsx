import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Badge } from "@cloudflare/kumo";
import { Cube, Database } from "@phosphor-icons/react";
import { ErdCanvas } from "~/components/erd/ErdCanvas";
import { DbmlEditor } from "~/components/erd/DbmlEditor";
import { ErdToolbar } from "~/components/erd/ErdToolbar";
import { TableEditor } from "~/components/erd/TableEditor";
import { EmptyState } from "~/components/ui/EmptyState";
import { ListSkeleton } from "~/components/ui/Skeleton";
import { PageHeader } from "~/components/ui/PageHeader";
import { FilePicker } from "~/components/ui/FilePicker";
import { parseDbml, extractDbml, replaceDbmlFence, serializeDbmlDocument, type TableDef, type ParsedDbml } from "~/lib/dbml";
import { useFileList, useFileContent, useFileWatch } from "~/lib/use-file-data";
import { useDbmlFileStatus } from "~/lib/use-dbml-file-status";
import { AppButton } from "~/components/ui/AppButton";

// 32-bit FNV-1a: used only to notice "this text is byte-identical to what we
// already parsed". A full re-parse is affordable (~6 ms for 86 tables), but a
// layout of that result is not (~40 ms + a full canvas repaint), and the file
// watcher refreshes an unchanged file whenever the stream reconnects or a
// sibling ERD file changes.
function textSignature(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}:${h}`;
}

/** The ERD tab's content. Used by its route and by split panes, so it takes the project id as a prop. */
export function ErdView({ projectId }: { projectId: string }) {
  const id = projectId;
  const { files, loading: filesLoading, refresh: refreshFiles } = useFileList("output/erd", id);
  const storageKey = `onesist:project:${id}:erd-selected-file`;
  const restoredFromStorageRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) restoredFromStorageRef.current = true;
      return saved;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!selectedFile) return;
    try {
      window.localStorage.setItem(storageKey, selectedFile);
    } catch {}
  }, [selectedFile, storageKey]);
  const { content: dbmlText, refresh: refreshContent } = useFileContent(selectedFile, id);
  const [localText, setLocalText] = useState("");
  const [parsed, setParsed] = useState<ParsedDbml>({ tables: [], notes: [] });
  const [showEditor, setShowEditor] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Filter out hidden files / dotfiles (.gitkeep, etc)
  const erdFiles = useMemo(
    () =>
      files.filter(
        (f) =>
          !f.name.startsWith(".") &&
          (f.ext === ".dbml" || f.ext === ".md" || f.ext === ".sql" || f.ext === ".json")
      ),
    [files]
  );

  const fileStatus = useDbmlFileStatus(erdFiles, id);
  const isMarkdown = useMemo(() => (selectedFile ? /\.md$/i.test(selectedFile) : false), [selectedFile]);
  const extracted = useMemo(() => extractDbml(localText, isMarkdown), [localText, isMarkdown]);
  const canEditTables = !isMarkdown || (extracted.source === "fence" && extracted.fenceCount === 1);
  const userPickedRef = useRef(false);

  useEffect(() => {
    if (!erdFiles.length) return;
    const tablesOf = (path: string): number | undefined => {
      const status = fileStatus[path];
      return status && "tables" in status ? status.tables : undefined;
    };
    const bestWithTables =
      erdFiles.find((f) => f.ext === ".dbml" && (tablesOf(f.path) ?? 0) > 0) ??
      erdFiles.find((f) => (tablesOf(f.path) ?? 0) > 0) ??
      null;
    const current = selectedFile && erdFiles.some((f) => f.path === selectedFile) ? selectedFile : null;

    if (current) {
      if (restoredFromStorageRef.current || userPickedRef.current) return;
      if (tablesOf(current) === 0 && bestWithTables && bestWithTables.path !== current) {
        setSelectedFile(bestWithTables.path);
      }
      return;
    }

    let saved: string | null = null;
    try { saved = window.localStorage.getItem(storageKey); } catch {}
    if (saved && erdFiles.some((f) => f.path === saved)) {
      restoredFromStorageRef.current = true;
      setSelectedFile(saved);
      return;
    }
    restoredFromStorageRef.current = false;

    const dbml = erdFiles.find((f) => f.ext === ".dbml");
    const md =
      erdFiles.find((f) => f.ext === ".md" && /erd|dbml|schema|database/i.test(f.name)) ??
      erdFiles.find((f) => f.ext === ".md");
    setSelectedFile((bestWithTables ?? dbml ?? md ?? erdFiles[0]).path);
  }, [erdFiles, selectedFile, fileStatus, storageKey]);

  // Sync localText when content changes
  useEffect(() => {
    setLocalText(dbmlText ?? "");
  }, [dbmlText]);

  // Parse DBML — debounced, and skipped entirely when the text is unchanged.
  // The editor calls onChange per keystroke, so without the debounce a 96 KB
  // schema is re-parsed on every character typed.
  const lastParsed = useRef<string | null>(null);
  useEffect(() => {
    if (!localText) {
      lastParsed.current = null;
      setParsed({ tables: [], notes: [] });
      return;
    }
    const signature = textSignature(extracted.dbml);
    if (signature === lastParsed.current) return;
    const timer = setTimeout(() => {
      try {
        setParsed(parseDbml(extracted.dbml));
        lastParsed.current = signature;
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [extracted.dbml, localText]);

  // Switching files means the previously selected table belongs to another
  // schema — clearing it avoids carrying a stale selection (and its highlight)
  // into the next diagram.
  const selectedFileRef = useRef(selectedFile);
  useEffect(() => {
    if (selectedFileRef.current !== selectedFile) {
      selectedFileRef.current = selectedFile;
      setSelectedTable(null);
      setPanelOpen(false);
    }
  }, [selectedFile]);

  // Live file watch — the agent writing `output/erd/<modul>/erd.dbml` while
  // this tab is open must show up without leaving and re-entering the tab
  // (UJI-MANUAL C9). The hook filters by route, so only this tab's files arrive.
  useFileWatch("erd", (path) => {
    void refreshFiles();
    const norm = path.replace(/\\/g, "/");
    if (norm === selectedFile) {
      void refreshContent();
      return;
    }
    // A DBML the list does not know yet is the one the agent just created —
    // show it. An update to some OTHER file must not steal the view away from
    // what the user is reading, and nothing jumps while the DBML editor is open
    // (that would replace text being typed).
    const known = erdFiles.some((f) => f.path === norm);
    if (/\.dbml$/i.test(norm) && !known && !showEditor) setSelectedFile(norm);
  });
  // Also watch master files at root (MASTER_ERD.md) which type is "master" not "erd"
  useFileWatch("master", refreshFiles);

  const handleDbmlChange = useCallback((newDbml: string) => setLocalText(newDbml), []);
  const handleSelectTable = useCallback((name: string | null) => {
    setSelectedTable(name);
    if (!name) setPanelOpen(false);
  }, []);
  useEffect(() => {
    if (panelOpen && selectedTable && !parsed.tables.some((t) => t.name === selectedTable)) {
      setPanelOpen(false);
    }
  }, [panelOpen, parsed.tables, selectedTable]);
  const handleTableUpdate = useCallback(
    (updatedTable: TableDef) => {
      const next: ParsedDbml = {
        ...parsed,
        tables: parsed.tables.map((t) => (t.name === updatedTable.name ? updatedTable : t)),
      };
      setParsed(next);
      if (!canEditTables) return;

      const serialized = serializeDbmlDocument(next);
      if (!isMarkdown) {
        setLocalText(serialized);
        return;
      }
      const replaced = replaceDbmlFence(localText, serialized);
      if (replaced !== null) setLocalText(replaced);
    },
    [parsed, canEditTables, isMarkdown, localText]
  );

  const handleExportDbml = useCallback(() => {
    const blob = new Blob([extracted.dbml], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile?.replace(/^.*[/\\]/, "").replace(/\.\w+$/, "") + ".dbml";
    a.click();
    URL.revokeObjectURL(url);
  }, [extracted.dbml, selectedFile]);

  const selectedTableDef = parsed.tables.find((t) => t.name === selectedTable) ?? null;
  const tableOptions = useMemo(
    () => parsed.tables.map((t) => ({ name: t.name, columns: t.columns.length })),
    [parsed.tables]
  );
  const pickerItems = useMemo(
    () =>
      erdFiles.map((f) => {
        const status = fileStatus[f.path];
        let label: string;
        if (f.ext !== ".dbml" && f.ext !== ".md") label = "bukan DBML";
        else if (!status) label = "memeriksa…";
        else if ("error" in status) label = "gagal dibaca";
        else if (status.tables > 0) label = `${status.tables} tabel`;
        else label = f.ext === ".md" ? "tanpa DBML" : "0 tabel";
        const folder = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        return { value: f.path, label: f.name, hint: folder ? `${label} · ${folder}` : label };
      }),
    [erdFiles, fileStatus]
  );

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={<Cube size={14} className="text-kumo-brand" />}
        title="ERD Canvas"
        help="erd"
        badges={
          <>
            {erdFiles.length > 0 && (
              <Badge variant="neutral" className="text-[11px]">
                {erdFiles.length} files
              </Badge>
            )}
            {parsed.tables.length > 0 && (
              <Badge variant="neutral" className="text-[11px]">
                {parsed.tables.length} tables
              </Badge>
            )}
            {selectedFile && !filesLoading && parsed.tables.length === 0 && (
              <Badge variant="neutral" className="text-[11px]">
                tanpa DBML
              </Badge>
            )}
          </>
        }
        below={
          erdFiles.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <FilePicker
                items={pickerItems}
                value={selectedFile}
                onChange={(path) => {
                  userPickedRef.current = true;
                  setSelectedFile(path);
                }}
                placeholder="Pilih berkas ERD"
                searchPlaceholder="Cari berkas ERD…"
              />
            </div>
          )
        }
      />

      {filesLoading ? (
        <div className="flex items-center justify-center flex-1">
          <ListSkeleton rows={4} className="w-full max-w-xs px-4" />
        </div>
      ) : erdFiles.length === 0 || !selectedFile ? (
        <EmptyState
          icon={<Database size={24} />}
          title="No ERD files found"
          description="Add a .dbml or ERD markdown file to output/erd/ to see the diagram."
          className="flex-1"
        />
      ) : (
        <div className="flex flex-1 min-h-0 glass-container overflow-hidden rounded-xl">
          <div
            className="shrink-0 border-r border-kumo-line flex flex-col transition-all duration-200"
            style={{ width: showEditor ? 400 : 0, overflow: "hidden" }}
          >
            <div
              className="px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50 text-xs font-medium text-kumo-subtle whitespace-nowrap"
              style={{ width: 400 }}
            >
              {isMarkdown ? "Markdown editor" : "DBML editor"}
            </div>
            <div className="flex-1 min-h-0" style={{ width: 400 }}>
              <DbmlEditor value={localText} onChange={handleDbmlChange} />
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <ErdToolbar
              showEditor={showEditor}
              onToggleEditor={() => setShowEditor((p) => !p)}
              onExportDbml={handleExportDbml}
              tableCount={parsed.tables.length}
              tables={tableOptions}
              selectedTable={selectedTable}
              onSelectTable={handleSelectTable}
              onOpenTableEditor={() => setPanelOpen(true)}
              tableEditorOpen={panelOpen}
            />
            <div className="flex-1 min-h-0 relative" style={{ width: "100%", height: "100%" }}>
              <ErdCanvas
                key={selectedFile}
                data={parsed}
                onNodeClick={handleSelectTable}
                selectedTable={selectedTable}
              />
            </div>
          </div>

          <div
            className="shrink-0 border-l border-kumo-line flex flex-col transition-all duration-200"
            style={{ width: panelOpen && selectedTableDef ? 300 : 0, overflow: "hidden" }}
          >
            <div className="flex-1 min-h-0" style={{ width: 300 }}>
              {panelOpen && selectedTableDef ? (
                <TableEditor
                  table={selectedTableDef}
                  onUpdate={handleTableUpdate}
                  allTables={parsed.tables.map((t) => t.name)}
                  onClose={() => setPanelOpen(false)}
                  readOnly={!canEditTables}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
