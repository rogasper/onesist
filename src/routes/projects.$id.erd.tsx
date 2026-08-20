import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Badge } from "@cloudflare/kumo";
import { Cube, Database } from "@phosphor-icons/react";
import { ErdCanvas } from "~/components/erd/ErdCanvas";
import { DbmlEditor } from "~/components/erd/DbmlEditor";
import { ErdToolbar } from "~/components/erd/ErdToolbar";
import { TableEditor } from "~/components/erd/TableEditor";
import { EmptyState } from "~/components/ui/EmptyState";
import { ListSkeleton } from "~/components/ui/Skeleton";
import { PageHeader } from "~/components/ui/PageHeader";
import { SearchInput } from "~/components/ui/SearchInput";
import { FilterSelect } from "~/components/ui/FilterSelect";
import { parseDbml, serializeDbml, type TableDef, type ParsedDbml } from "~/lib/dbml";
import { useFileList, useFileContent, useFileWatch } from "~/lib/use-file-data";
import { AppButton } from "~/components/ui/AppButton";

export const Route = createFileRoute("/projects/$id/erd")({
  component: ErdPage,
});

function ErdPage() {
  const { id } = Route.useParams();
  const { files, loading: filesLoading } = useFileList("output/erd", id);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const { content: dbmlText, refresh: refreshContent } = useFileContent(selectedFile, id);
  const [localText, setLocalText] = useState("");
  const [parsed, setParsed] = useState<ParsedDbml>({ tables: [], notes: [] });
  const [showEditor, setShowEditor] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

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

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return erdFiles;
    return erdFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [erdFiles, fileSearch]);

  // Auto-select first file if current is invalid
  useEffect(() => {
    if (erdFiles.length > 0 && (!selectedFile || !erdFiles.some((f) => f.path === selectedFile))) {
      setSelectedFile(erdFiles[0].path);
    }
  }, [erdFiles, selectedFile]);

  // Sync localText when content changes
  useEffect(() => {
    if (dbmlText !== null) setLocalText(dbmlText);
  }, [dbmlText]);

  // Parse DBML
  useEffect(() => {
    if (!localText) return;
    try {
      setParsed(parseDbml(localText));
    } catch {}
  }, [localText]);

  // Live file watch
  useFileWatch("erd", (path) => {
    if (path === selectedFile) refreshContent();
  });

  const handleDbmlChange = useCallback((newDbml: string) => setLocalText(newDbml), []);
  const handleTableUpdate = useCallback(
    (updatedTable: TableDef) => {
      setParsed((prev) => ({
        ...prev,
        tables: prev.tables.map((t) => (t.name === updatedTable.name ? updatedTable : t)),
      }));
      setLocalText(
        serializeDbml(parsed.tables.map((t) => (t.name === updatedTable.name ? updatedTable : t)))
      );
    },
    [parsed.tables]
  );

  const handleExportDbml = useCallback(() => {
    const blob = new Blob([localText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile?.replace(/^.*[/\\]/, "").replace(/\.\w+$/, "") + ".dbml";
    a.click();
    URL.revokeObjectURL(url);
  }, [localText, selectedFile]);

  const selectedTableDef = parsed.tables.find((t) => t.name === selectedTable) ?? null;
  const tableNames = useMemo(() => parsed.tables.map((t) => t.name), [parsed.tables]);

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
          </>
        }
        below={
          erdFiles.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <SearchInput
                value={fileSearch}
                onChange={setFileSearch}
                placeholder="Search ERD files…"
                className="w-48 sm:w-56 shrink-0"
              />

              <FilterSelect
                value={selectedFile ?? ""}
                onChange={(val) => setSelectedFile(val)}
                className="max-w-[200px] truncate shrink-0"
                title="Select ERD file"
              >
                {erdFiles.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.name}
                  </option>
                ))}
              </FilterSelect>

              <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0 py-0.5 no-scrollbar">
                {filteredFiles.map((f) => (
                  <AppButton
                    key={f.path}
                    variant="chip"
                    size="xs"
                    active={selectedFile === f.path}
                    onClick={() => setSelectedFile(f.path)}
                    className="px-2.5 shrink-0 truncate max-w-[180px]"
                    title={f.name}
                  >
                    {f.name}
                  </AppButton>
                ))}
                {filteredFiles.length === 0 && (
                  <span className="text-[11px] text-kumo-subtle italic px-2">
                    No matching files
                  </span>
                )}
              </div>

              {fileSearch && (
                <span className="text-[10px] text-kumo-subtle font-mono shrink-0 ml-auto">
                  {filteredFiles.length}/{erdFiles.length} files
                </span>
              )}
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
        <div className="flex flex-1 min-h-0 glass-container overflow-hidden">
          <div
            className="shrink-0 border-r border-kumo-line flex flex-col transition-all duration-200"
            style={{ width: showEditor ? 400 : 0, overflow: "hidden" }}
          >
            <div
              className="px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50 text-xs font-medium text-kumo-subtle whitespace-nowrap"
              style={{ width: 400 }}
            >
              DBML editor
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
              tables={tableNames}
              selectedTable={selectedTable}
              onSelectTable={(name) => setSelectedTable(name)}
            />
            <div className="flex-1 min-h-0 relative" style={{ width: "100%", height: "100%" }}>
              <ErdCanvas
                key={selectedFile}
                data={parsed}
                onNodeClick={(name) => setSelectedTable(name)}
                selectedTable={selectedTable}
              />
            </div>
          </div>

          <div
            className="shrink-0 border-l border-kumo-line flex flex-col transition-all duration-200"
            style={{ width: selectedTableDef ? 300 : 0, overflow: "hidden" }}
          >
            <div className="flex-1 min-h-0" style={{ width: 300 }}>
              {selectedTableDef ? (
                <TableEditor
                  table={selectedTableDef}
                  onUpdate={handleTableUpdate}
                  allTables={parsed.tables.map((t) => t.name)}
                  onClose={() => setSelectedTable(null)}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
