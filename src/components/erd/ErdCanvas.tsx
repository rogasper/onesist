import { useCallback, useMemo, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TableNode } from "~/components/erd/TableNode";
import type { TableDef, ParsedDbml } from "~/lib/dbml";
import { layoutNodes, LAYOUT_LABELS, type LayoutAlgorithm } from "~/lib/erd-layout";
import { Button } from "@cloudflare/kumo";

const nodeTypes: NodeTypes = {
  tableNode: TableNode,
};

interface ErdCanvasProps {
  data: ParsedDbml;
  onNodeClick?: (tableName: string) => void;
  selectedTable?: string | null;
  onDbmlChange?: (tables: TableDef[]) => void;
}

function buildEdges(tables: TableDef[]): Edge[] {
  const edges: Edge[] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.ref) {
        edges.push({
          id: `${t.name}.${c.name}->${c.ref.table}.${c.ref.column}`,
          source: t.name,
          sourceHandle: `${t.name}.${c.name}-source`,
          target: c.ref.table,
          targetHandle: `${c.ref.table}.${c.ref.column}-target`,
          style: { stroke: "var(--color-kumo-subtle, #a1a1aa)", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-kumo-subtle, #a1a1aa)" },
          type: "smoothstep",
        });
      }
    }
  }
  return edges;
}

export function ErdCanvas({ data, onNodeClick, selectedTable }: ErdCanvasProps) {
  const [algorithm, setAlgorithm] = useState<LayoutAlgorithm>("tb");

  const positioned = useMemo(
    () => layoutNodes(data.tables, selectedTable, algorithm),
    [data.tables, selectedTable, algorithm],
  );
  const initialEdges = useMemo(() => buildEdges(data.tables), [data.tables]);

  const [nodes, setNodes, onNodesChange] = useNodesState(positioned);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(positioned);
    setEdges(initialEdges);
  }, [positioned, initialEdges, setNodes, setEdges]);

  useEffect(() => {
    if (!selectedTable) {
      setNodes((nds) =>
        nds.map((n) => ({ ...n, style: { opacity: 1 } }))
      );
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          style: { stroke: "var(--color-kumo-subtle, #a1a1aa)", strokeWidth: 1.5 },
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-kumo-subtle, #a1a1aa)" },
        }))
      );
      return;
    }

    const connectedIds = new Set<string>();
    for (const e of buildEdges(data.tables)) {
      if (e.source === selectedTable) connectedIds.add(e.target);
      if (e.target === selectedTable) connectedIds.add(e.source);
    }

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        style: {
          opacity: n.id === selectedTable || connectedIds.has(n.id) ? 1 : 0.25,
          transition: "opacity 300ms",
        },
      }))
    );

    setEdges((eds) =>
      eds.map((e) => {
        const isConnected = e.source === selectedTable || e.target === selectedTable;
        return {
          ...e,
          style: {
            stroke: isConnected ? "var(--color-kumo-brand, #60a5fa)" : "var(--color-kumo-subtle, #a1a1aa)",
            strokeWidth: isConnected ? 2 : 0.75,
            opacity: isConnected ? 1 : 0.15,
          },
          animated: isConnected,
          markerEnd: isConnected
            ? { type: MarkerType.ArrowClosed, color: "var(--color-kumo-brand, #60a5fa)" }
            : { type: MarkerType.ArrowClosed, color: "var(--color-kumo-subtle, #a1a1aa)" },
        };
      })
    );
  }, [selectedTable, data.tables, setNodes, setEdges]);

  const onNodeClickHandler = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id as string);
    },
    [onNodeClick],
  );

  if (data.tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-kumo-subtle">
        No tables parsed — toggle to DBML view and paste schema, or edit the existing DBML.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickHandler}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode="light"
        minZoom={0.1}
        maxZoom={2}
        panOnScroll
        selectionOnDrag
        panOnDrag={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls position="bottom-right" className="!bg-kumo-surface !rounded-lg !border !border-kumo-line" />
        <Panel position="bottom-center">
          <div className="flex items-center gap-1 rounded-full border border-kumo-line bg-kumo-elevated/90 p-1 shadow-md">
            {(Object.keys(LAYOUT_LABELS) as LayoutAlgorithm[]).map((algo) => (
              <Button
                key={algo}
                type="button"
                variant="outline"
                onClick={() => setAlgorithm(algo)}
                className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                  algorithm === algo
                    ? "liquid-wash border-transparent"
                    : "border-transparent text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated"
                }`}
              >
                {LAYOUT_LABELS[algo]}
              </Button>
            ))}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
