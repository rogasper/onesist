import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { TableDef } from "~/lib/dbml";

export type TableNodeData = TableDef & {
  selected: boolean;
  [key: string]: unknown;
};

type TableNodeType = Node<TableNodeData, "tableNode">;

/**
 * Memoised on purpose: a large schema renders 80+ of these (700+ column rows and
 * two handles per row), and React Flow re-renders its node components whenever
 * the canvas updates — e.g. while panning or zooming. Without the memo every
 * wheel tick re-renders the whole graph.
 */
function TableNodeInner({ data }: NodeProps<TableNodeType>) {
  const { name, columns, indexes } = data;

  return (
    <div style={{ minWidth: 220, maxWidth: 280 }}
      className={`rounded-lg border-2 bg-kumo-base text-kumo-default text-xs leading-tight shadow-md ${
        data.selected ? "border-kumo-brand" : "border-kumo-line"
      }`}>
      {/* The header is the drag handle (see dragHandle on the canvas): grabbing a
          table by its body would make column names unselectable and turn every
          stray drag into a move. */}
      <div className="erd-drag-handle flex items-center gap-2 rounded-t-lg bg-kumo-elevated border-b border-kumo-line px-3 py-2 font-semibold text-sm cursor-grab active:cursor-grabbing">
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[10px] text-kumo-subtle font-normal">{columns.length} cols</span>
      </div>

      <div className="divide-y divide-kumo-line/50">
        {columns.map((col) => {
          const key = `${name}.${col.name}`;
          return (
            /* content-visibility lets the browser skip layout/paint for rows that
               are off-screen — the difference between a cheap and an expensive pan
               once a table has 40+ columns (the schema here has ~700 rows total). */
            <div
              key={key}
              className="erd-col-row flex items-center gap-2 px-3 py-1.5 relative hover:bg-kumo-elevated/50"
            >
              <Handle
                type="source"
                position={Position.Right}
                id={`${key}-source`}
                className="!size-2 !border-2 !border-kumo-brand !bg-kumo-base !right-[-5px]"
                style={{ visibility: col.ref ? "visible" : "hidden" }}
              />
              <Handle
                type="target"
                position={Position.Left}
                id={`${key}-target`}
                className="!size-2 !border-2 !border-amber-400 !bg-kumo-base !left-[-5px]"
                style={{ visibility: col.isPk ? "visible" : "hidden" }}
              />
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {col.isPk && <span className="text-amber-400 font-bold shrink-0">PK</span>}
                {col.isUnique && <span className="text-sky-400 shrink-0">UQ</span>}
                {col.isNotNull && <span className="text-zinc-500 shrink-0">NN</span>}
                {!col.isPk && !col.isUnique && !col.isNotNull && (
                  <span className="w-0 shrink-0" />
                )}
                <span className="truncate font-medium">{col.name}</span>
              </div>
              <span className="text-kumo-subtle shrink-0 font-mono text-[11px]">{col.type}</span>
            </div>
          );
        })}
      </div>

      <div style={{ visibility: indexes.length > 0 ? "visible" : "hidden", height: indexes.length > 0 ? "auto" : "0px", overflow: "hidden" }}
        className="border-t border-kumo-line/50 px-3 py-1.5 text-[10px] text-kumo-subtle bg-kumo-elevated/30 rounded-b-lg">
        {indexes.map((ix, i) => (
          <div key={`${name}.idx.${ix.name || i}`}>
            <span className="text-zinc-500">IDX</span> {ix.columns.join(", ")}{ix.isUnique ? " (unique)" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeInner);
