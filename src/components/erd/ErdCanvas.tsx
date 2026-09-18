import { useCallback, useMemo, useEffect, useRef, useState } from "react";
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

  // Positions depend on the schema and the chosen algorithm only. Selection is
  // NOT a dependency: a dagre run over 86 tables costs ~40 ms, so selecting a
  // table must not re-layout the whole diagram (it only changes styling).
  const positioned = useMemo(
    () => layoutNodes(data.tables, undefined, algorithm),
    [data.tables, algorithm],
  );
  const initialEdges = useMemo(() => buildEdges(data.tables), [data.tables]);

  const [nodes, setNodes, onNodesChange] = useNodesState(positioned);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Recreate nodes/edges only when the layout (or the schema behind the edges)
  // actually changed — otherwise a refresh that produced identical data would
  // reset the React Flow state and visibly re-fit the viewport.
  const layoutRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  useEffect(() => {
    const prev = layoutRef.current;
    if (prev?.nodes === positioned && prev?.edges === initialEdges) return;
    layoutRef.current = { nodes: positioned, edges: initialEdges };
    setNodes(positioned);
    setEdges(initialEdges);
  }, [positioned, initialEdges, setNodes, setEdges]);

  // Selection styling. Selection is NOT a dependency of the layout above, so
  // this pass never re-runs dagre; it only rewrites node/edge visual props.
  //
  // Two things are deliberately avoided here, both measured as pan/zoom costs on
  // an 86-table schema: an inline `transition` on every node (the browser then
  // recalculates transitioned styles across ~1,700 rows on each frame) and
  // `animated` on edges (React Flow's dash animation repaints the SVG path every
  // frame). Connected edges are distinguished by colour and width instead, which
  // costs nothing while the viewport moves.
  //
  // It must also be idempotent: `setNodes` replaces the arrays this component
  // reads, so an unconditional write here re-triggers the effect through the
  // re-render and React bails out with "Maximum update depth exceeded"
  // (error #185 — observed on an 86-table schema). Every write is guarded by a
  // structural comparison and skipped when the styling is already in place.
  useEffect(() => {
    if (!selectedTable) {
      const needsReset =
        nodes.some((n) => n.style?.opacity !== undefined || n.style?.transition !== undefined) ||
        edges.some((e) => e.animated || e.style?.opacity !== undefined);
      if (!needsReset) return;
      setNodes((current) =>
        current.map((n) =>
          n.style?.opacity === undefined && n.style?.transition === undefined
            ? n
            : { ...n, style: { ...n.style, opacity: undefined, transition: undefined } },
        ),
      );
      setEdges((current) =>
        current.map((e) =>
          e.animated || e.style?.opacity !== undefined
            ? {
                ...e,
                style: { stroke: "var(--color-kumo-subtle, #a1a1aa)", strokeWidth: 1.5 },
                animated: false,
                markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-kumo-subtle, #a1a1aa)" },
              }
            : e,
        ),
      );
      return;
    }

    const connected = new Set<string>();
    for (const e of initialEdges) {
      if (e.source === selectedTable) connected.add(e.target);
      if (e.target === selectedTable) connected.add(e.source);
    }

    const nodeNeedsStyle = (n: Node) => {
      const wanted = n.id === selectedTable || connected.has(n.id as string) ? 1 : 0.25;
      return n.style?.opacity !== wanted || n.style?.transition !== undefined;
    };
    const edgeNeedsStyle = (e: Edge) => {
      const isConnected = e.source === selectedTable || e.target === selectedTable;
      return (
        e.animated === true ||
        e.style?.opacity !== (isConnected ? 1 : 0.15) ||
        e.style?.strokeWidth !== (isConnected ? 2 : 0.75)
      );
    };

    if (nodes.some(nodeNeedsStyle)) {
      setNodes((current) =>
        current.map((n) => ({
          ...n,
          style: {
            ...n.style,
            opacity: n.id === selectedTable || connected.has(n.id as string) ? 1 : 0.25,
          },
        })),
      );
    }

    if (edges.some(edgeNeedsStyle)) {
      setEdges((current) =>
        current.map((e) => {
          const isConnected = e.source === selectedTable || e.target === selectedTable;
          return {
            ...e,
            style: {
              stroke: isConnected ? "var(--color-kumo-brand, #60a5fa)" : "var(--color-kumo-subtle, #a1a1aa)",
              strokeWidth: isConnected ? 2 : 0.75,
              opacity: isConnected ? 1 : 0.15,
            },
            animated: false,
            markerEnd: isConnected
              ? { type: MarkerType.ArrowClosed, color: "var(--color-kumo-brand, #60a5fa)" }
              : { type: MarkerType.ArrowClosed, color: "var(--color-kumo-subtle, #a1a1aa)" },
          };
        }),
      );
    }
  }, [selectedTable, nodes, edges, initialEdges, setNodes, setEdges]);

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
        // Only mount tables inside the viewport: at "fit all" zoom the whole
        // 86-table graph would otherwise stay in the DOM while the viewport is
        // transformed on every wheel tick.
        onlyRenderVisibleElements
        // Node dragging by the header only (`.erd-drag-handle`, set per node).
        nodesDraggable
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
