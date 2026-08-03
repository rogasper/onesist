import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@cloudflare/kumo";
import { Cube } from "@phosphor-icons/react";
import { ErdCanvas } from "~/components/erd/ErdCanvas";
import { DbmlEditor } from "~/components/erd/DbmlEditor";
import { ErdToolbar } from "~/components/erd/ErdToolbar";
import { TableEditor } from "~/components/erd/TableEditor";
import { parseDbml, serializeDbml, type TableDef, type ParsedDbml } from "~/lib/dbml";
import { useFileList, useFileContent, useFileWatch } from "~/lib/use-file-data";

export const Route = createFileRoute("/projects/$id/erd")({
  component: ErdPage,
});

function ErdPage() {
  const { id } = Route.useParams();
  const { files, loading: filesLoading } = useFileList("output/erd", id);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const { content: dbmlText, refresh: refreshContent } = useFileContent(selectedFile, id);
  const [localText, setLocalText] = useState("");
  const [parsed, setParsed] = useState<ParsedDbml>({ tables: [], notes: [] });
  const [showEditor, setShowEditor] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Auto-select first file
  useEffect(() => {
    if (files.length > 0 && !selectedFile) setSelectedFile(files[0].path);
  }, [files, selectedFile]);

  // Sync localText when content changes
  useEffect(() => {
    if (dbmlText !== null) setLocalText(dbmlText);
  }, [dbmlText]);

  // Parse DBML
  useEffect(() => {
    if (!localText) return;
    try { setParsed(parseDbml(localText)); } catch {}
  }, [localText]);

  // Live file watch
  useFileWatch("erd", (path) => {
    if (path === selectedFile) refreshContent();
  });

  const handleDbmlChange = useCallback((newDbml: string) => setLocalText(newDbml), []);
  const handleTableUpdate = useCallback((updatedTable: TableDef) => {
    setParsed((prev) => ({
      ...prev,
      tables: prev.tables.map((t) => t.name === updatedTable.name ? updatedTable : t),
    }));
    setLocalText(serializeDbml(parsed.tables.map((t) => t.name === updatedTable.name ? updatedTable : t)));
  }, [parsed.tables]);
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

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 70px)" }}>
      <div className="mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="rounded bg-kumo-elevated p-1"><Cube size={14} className="text-kumo-brand" /></div>
          <h1 className="text-lg text-kumo-default flex-1">ERD Canvas</h1>
          {parsed.tables.length > 0 && <Badge variant="neutral" className="text-[11px]">{parsed.tables.length} tables</Badge>}
          <div className="ml-3 flex items-center gap-1 overflow-x-auto min-w-0 max-w-[80%] shrink">
            {files.map((f) => (
              <button key={f.path} onClick={() => setSelectedFile(f.path)}
                style={selectedFile === f.path ? { borderColor: "var(--color-kumo-brand, #60a5fa)", color: "var(--color-kumo-brand, #60a5fa)" } : {}}
                className={`text-[11px] px-3 py-1 rounded-full bg-kumo-elevated border transition-all shrink-0 font-medium ${
                  selectedFile === f.path ? "bg-kumo-brand/20" : "border-kumo-line/50 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/50"
                }`}>{f.name}</button>
            ))}
          </div>
        </div>
      </div>

      {filesLoading ? (
        <div className="flex items-center justify-center flex-1 text-kumo-subtle text-sm">Loading ERD files...</div>
      ) : !selectedFile ? (
        <div className="flex items-center justify-center flex-1 text-kumo-subtle text-sm">
          No ERD files found in output/erd/
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 glass-container overflow-hidden">
          <div className="shrink-0 border-r border-kumo-line flex flex-col transition-all duration-200"
            style={{ width: showEditor ? 400 : 0, overflow: "hidden" }}>
            <div className="px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50 text-xs font-medium text-kumo-subtle whitespace-nowrap" style={{ width: 400 }}>DBML editor</div>
            <div className="flex-1 min-h-0" style={{ width: 400 }}>
              <DbmlEditor value={localText} onChange={handleDbmlChange} />
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <ErdToolbar showEditor={showEditor} onToggleEditor={() => setShowEditor((p) => !p)}
              onExportDbml={handleExportDbml} tableCount={parsed.tables.length} />
            <div className="flex-1 min-h-0 relative" style={{ width: "100%", height: "100%" }}>
              <ErdCanvas key={selectedFile} data={parsed} onNodeClick={(name) => setSelectedTable(name)} selectedTable={selectedTable} />
            </div>
          </div>

          <div className="shrink-0 border-l border-kumo-line flex flex-col transition-all duration-200"
            style={{ width: selectedTableDef ? 300 : 0, overflow: "hidden" }}>
            <div className="flex-1 min-h-0" style={{ width: 300 }}>
              {selectedTableDef ? (
                <TableEditor table={selectedTableDef} onUpdate={handleTableUpdate} allTables={parsed.tables.map((t) => t.name)} onClose={() => setSelectedTable(null)} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
