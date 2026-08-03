import dagre, { type Graph } from "@dagrejs/dagre";
import type { Node } from "@xyflow/react";
import type { TableDef } from "~/lib/dbml";

export type LayoutAlgorithm = "tb" | "lr" | "compact" | "snowflake";

export const LAYOUT_LABELS: Record<LayoutAlgorithm, string> = {
  tb: "Top-Down",
  lr: "Left-Right",
  compact: "Compact",
  snowflake: "Snowflake",
};

const ROW_HEIGHT = 26;
const HEADER_HEIGHT = 38;
const NODE_PADDING_Y = 14;
const NODE_WIDTH = 240;

const ALGO_CONFIG: Record<Exclude<LayoutAlgorithm, "snowflake">, { rankdir: string; nodesep: number; ranksep: number }> = {
  tb: { rankdir: "TB", nodesep: 50, ranksep: 80 },
  lr: { rankdir: "LR", nodesep: 50, ranksep: 120 },
  compact: { rankdir: "TB", nodesep: 30, ranksep: 50 },
};

function estimateNodeHeight(table: TableDef): number {
  const colRows = table.columns.length;
  const idxRows = table.indexes.length > 0 ? 1 + table.indexes.length : 0;
  return HEADER_HEIGHT + (colRows + idxRows) * ROW_HEIGHT + NODE_PADDING_Y;
}

function buildGraph(tables: TableDef[], config: { rankdir: string; nodesep: number; ranksep: number }, reverseEdges = false) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: config.rankdir, nodesep: config.nodesep, ranksep: config.ranksep });

  for (const t of tables) {
    g.setNode(String(t.name), { width: NODE_WIDTH, height: estimateNodeHeight(t) });
  }

  for (const t of tables) {
    for (const col of t.columns) {
      if (col.ref) {
        if (reverseEdges) g.setEdge(String(t.name), String(col.ref.table));
        else g.setEdge(String(col.ref.table), String(t.name));
      }
    }
  }

  dagre.layout(g);
  return g;
}

function collectNodes(g: Graph, tables: TableDef[], selectedTable?: string | null): Node[] {
  return tables.map((t) => {
    const n = g.node(String(t.name));
    const pos = n
      ? { x: n.x - n.width / 2, y: n.y - n.height / 2 }
      : { x: 0, y: 0 };
    return {
      id: String(t.name),
      type: "tableNode" as const,
      position: pos,
      data: { ...t, selected: t.name === selectedTable },
    };
  });
}

function snowflakeLayout(tables: TableDef[], selectedTable?: string | null): Node[] {
  if (tables.length === 0) return [];

  const refCount = new Map<string, number>();
  for (const t of tables) {
    refCount.set(String(t.name), 0);
    for (const col of t.columns) {
      if (col.ref) refCount.set(String(col.ref.table), (refCount.get(String(col.ref.table)) ?? 0) + 1);
    }
  }

  const sorted = [...tables].sort((a, b) => (refCount.get(String(b.name)) ?? 0) - (refCount.get(String(a.name)) ?? 0));
  const hub = sorted[0];
  const others = sorted.slice(1);
  const mid = Math.floor(others.length / 2);

  const g = buildGraph(tables, ALGO_CONFIG.tb, true);
  const nodes = collectNodes(g, tables, selectedTable);

  const positions = new Map<string, { x: number; y: number }>();
  const hubNode = g.node(String(hub.name));
  const hubCenter = hubNode ? { x: hubNode.x, y: hubNode.y } : { x: 0, y: 0 };

  const radiusX = (others.length + 1) * 100;
  const radiusY = (others.length + 1) * 80;

  const ring = (i: number): { x: number; y: number } => {
    const rel = i - mid;
    return {
      x: hubCenter.x + (rel * radiusX * 2) / Math.max(others.length, 2),
      y: hubCenter.y + Math.abs(rel) * radiusY * 0.35 + (rel % 2 === 0 ? -1 : 1) * radiusY * 0.5,
    };
  };

  positions.set(String(hub.name), { x: hubCenter.x, y: hubCenter.y });
  others.forEach((t, i) => {
    const p = ring(i);
    positions.set(String(t.name), p);
  });

  return nodes.map((n) => {
    const p = positions.get(n.id as string);
    if (p) {
      const dim = g.node(n.id as string) ?? { width: NODE_WIDTH, height: estimateNodeHeight(tables.find((t) => String(t.name) === n.id) as TableDef) };
      return { ...n, position: { x: p.x - dim.width / 2, y: p.y - dim.height / 2 } };
    }
    return n;
  });
}

export function layoutNodes(tables: TableDef[], selectedTable?: string | null, algorithm: LayoutAlgorithm = "tb"): Node[] {
  if (tables.length === 0) return [];

  if (algorithm === "snowflake") return snowflakeLayout(tables, selectedTable);

  const config = ALGO_CONFIG[algorithm];
  const g = buildGraph(tables, config, false);
  return collectNodes(g, tables, selectedTable);
}
