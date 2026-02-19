import * as dagre from 'dagre';
import type { TrieRenderGraph } from './buildGraph';

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface TrieLayoutResult {
  positions: Record<string, PositionedNode>;
  bounds: LayoutBounds;
  signature: string;
}

function emptyBounds(): LayoutBounds {
  return {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    width: 0,
    height: 0,
  };
}

export function computeDagreLayout(graph: TrieRenderGraph): TrieLayoutResult {
  if (graph.nodes.length === 0) {
    return {
      positions: {},
      bounds: emptyBounds(),
      signature: graph.signature,
    };
  }

  const g = new dagre.graphlib.Graph({ multigraph: false, compound: false });
  g.setGraph({
    rankdir: 'TB',
    ranker: 'network-simplex',
    nodesep: 98,
    ranksep: 148,
    edgesep: 30,
    marginx: 50,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: node.width, height: node.height });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions: Record<string, PositionedNode> = {};
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of graph.nodes) {
    const layoutNode = g.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    if (!layoutNode) {
      continue;
    }
    const x = layoutNode.x - node.width / 2;
    const y = layoutNode.y - node.height / 2;
    positions[node.id] = {
      id: node.id,
      x,
      y,
      width: node.width,
      height: node.height,
    };
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + node.width);
    maxY = Math.max(maxY, y + node.height);
  }

  const bounds: LayoutBounds = Number.isFinite(minX)
    ? {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      }
    : emptyBounds();

  return {
    positions,
    bounds,
    signature: graph.signature,
  };
}
