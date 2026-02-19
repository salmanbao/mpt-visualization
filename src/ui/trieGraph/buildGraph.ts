import type { TrieGraph, TrieGraphEdge, TrieGraphNode } from '../../mpt/types';

export const TRIE_NODE_WIDTH = 236;
export const TRIE_NODE_HEIGHT = 112;
export const TRIE_BRANCH_NODE_HEIGHT = 180;

export interface BranchChildMeta {
  index: number;
  present: boolean;
  refType?: 'embedded' | 'hash-ref';
  targetId?: string;
  targetShort?: string;
}

export interface BranchMeta {
  children: BranchChildMeta[];
}

export interface TrieRenderNode {
  id: string;
  source: TrieGraphNode;
  width: number;
  height: number;
  title: string;
  summary: string;
  detail: string;
  meta: string;
  tooltip: string;
  branchMeta?: BranchMeta;
}

export interface TrieRenderEdge {
  id: string;
  source: string;
  target: string;
  refKind: TrieGraphEdge['refKind'];
  label: string;
}

export interface TrieRenderGraph {
  nodes: TrieRenderNode[];
  edges: TrieRenderEdge[];
  rootId?: string;
  signature: string;
}

function shortenMiddle(value: string, head: number, tail: number): string {
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function shortNodeId(id: string): string {
  if (id.startsWith('0x')) {
    return shortenMiddle(id, 8, 6);
  }
  if (id.startsWith('embedded:')) {
    return shortenMiddle(id.replace('embedded:', 'emb:'), 10, 6);
  }
  return shortenMiddle(id, 10, 6);
}

export function shortIdentifier(id: string): string {
  return shortNodeId(id);
}

function formatBranchSummary(node: TrieGraphNode): string {
  const indexes = (node.inspection.branchChildren ?? []).map((child) => child.index.toString(16));
  if (indexes.length === 0) {
    return 'children [none]';
  }
  const visible = indexes.slice(0, 6);
  const suffix = indexes.length > visible.length ? `,+${indexes.length - visible.length}` : '';
  return `children [${visible.join(',')}${suffix}]`;
}

function formatPathSummary(node: TrieGraphNode): string {
  const path = node.inspection.compactPath ?? '';
  if (!path) {
    return 'path (empty)';
  }
  return `path ${shortenMiddle(path, 12, 4)}`;
}

function sanitizeEdgeLabel(edge: TrieGraphEdge): string {
  const normalized = edge.label.replace(/[^\x20-\x7E]/g, '|');
  if (normalized.trim().length > 0) {
    return normalized;
  }
  return edge.refKind;
}

function parseBranchIndex(label: string): number | undefined {
  const head = label.split('|')[0]?.trim().toLowerCase();
  if (!head || head.length !== 1 || !/^[0-9a-f]$/.test(head)) {
    return undefined;
  }
  return Number.parseInt(head, 16);
}

function buildTooltip(node: TrieGraphNode): string {
  const lines: string[] = [];
  lines.push(`type: ${node.type}`);
  lines.push(`id: ${node.id}`);
  lines.push(`ref: ${node.refKind}`);
  if (node.inspection.hashHex) {
    lines.push(`hash: ${node.inspection.hashHex}`);
  }
  if (node.inspection.compactPath) {
    lines.push(`path: ${node.inspection.compactPath}`);
  }
  if (node.inspection.valueHex) {
    lines.push(`value: ${node.inspection.valueHex}`);
  }
  lines.push(`rlpBytes: ${node.inspection.rlpSize}`);
  return lines.join('\n');
}

function buildBranchMeta(node: TrieGraphNode, edgeMap: Map<number, TrieRenderEdge>): BranchMeta {
  const children: BranchChildMeta[] = Array.from({ length: 16 }, (_, index) => ({
    index,
    present: false,
  }));

  for (const info of node.inspection.branchChildren ?? []) {
    children[info.index].present = true;
    children[info.index].refType = info.refKind === 'hash-ref' ? 'hash-ref' : 'embedded';
    if (info.refKind === 'hash-ref' && info.refHex) {
      children[info.index].targetId = info.refHex;
      children[info.index].targetShort = shortNodeId(info.refHex);
    }
  }

  for (const [index, edge] of edgeMap.entries()) {
    children[index].present = true;
    children[index].refType = edge.refKind;
    children[index].targetId = edge.target;
    children[index].targetShort = shortNodeId(edge.target);
  }

  return { children };
}

function buildNode(node: TrieGraphNode, edgeMap: Map<number, TrieRenderEdge>): TrieRenderNode {
  const summary = node.type === 'branch' ? formatBranchSummary(node) : formatPathSummary(node);
  const detail = node.detail;
  const metaRef = node.refKind === 'hash-ref' ? 'hash-ref' : 'embedded';
  const metaId = node.hashHex ? shortNodeId(node.hashHex) : shortNodeId(node.id);

  return {
    id: node.id,
    source: node,
    width: TRIE_NODE_WIDTH,
    height: node.type === 'branch' ? TRIE_BRANCH_NODE_HEIGHT : TRIE_NODE_HEIGHT,
    title: `${node.type.toUpperCase()} ${metaId}`,
    summary,
    detail,
    meta: metaRef,
    tooltip: buildTooltip(node),
    branchMeta: node.type === 'branch' ? buildBranchMeta(node, edgeMap) : undefined,
  };
}

function buildSignature(nodes: TrieRenderNode[], edges: TrieRenderEdge[]): string {
  const nodePart = nodes.map((node) => node.id).sort().join('|');
  const edgePart = edges.map((edge) => `${edge.source}>${edge.target}:${edge.label}`).sort().join('|');
  return `${nodePart}::${edgePart}`;
}

export function buildRenderGraph(graph: TrieGraph): TrieRenderGraph {
  const edges = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    refKind: edge.refKind,
    label: sanitizeEdgeLabel(edge),
  }));

  const branchEdgesByParent = new Map<string, Map<number, TrieRenderEdge>>();
  for (const edge of edges) {
    const idx = parseBranchIndex(edge.label);
    if (idx === undefined) {
      continue;
    }
    const current = branchEdgesByParent.get(edge.source);
    if (current) {
      current.set(idx, edge);
    } else {
      const next = new Map<number, TrieRenderEdge>();
      next.set(idx, edge);
      branchEdgesByParent.set(edge.source, next);
    }
  }

  const nodes = graph.nodes.map((node) => buildNode(node, branchEdgesByParent.get(node.id) ?? new Map()));

  return {
    nodes,
    edges,
    rootId: graph.rootId,
    signature: buildSignature(nodes, edges),
  };
}
