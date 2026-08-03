import { Button } from "@cloudflare/kumo";
import { Code, Eye, Download } from "@phosphor-icons/react";

interface ErdToolbarProps {
  showEditor: boolean;
  onToggleEditor: () => void;
  onExportDbml: () => void;
  tableCount: number;
}

export function ErdToolbar({ showEditor, onToggleEditor, onExportDbml, tableCount }: ErdToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50">
      <div className="flex items-center gap-2 text-xs text-kumo-subtle">
        <span className="font-medium text-kumo-default">{tableCount} tables</span>
      </div>
      <div className="flex items-center gap-1">
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
