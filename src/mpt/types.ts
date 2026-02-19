export type NodeType = 'branch' | 'extension' | 'leaf';
export type NodeRef = Uint8Array;
export type RefKind = 'empty' | 'embedded' | 'hash-ref';

export interface BranchNode {
  type: 'branch';
  children: NodeRef[];
  value: Uint8Array;
}

export interface ExtensionNode {
  type: 'extension';
  path: number[];
  child: NodeRef;
}

export interface LeafNode {
  type: 'leaf';
  path: number[];
  value: Uint8Array;
}

export type TrieNode = BranchNode | ExtensionNode | LeafNode;

export interface ChildInspection {
  index: number;
  refKind: RefKind;
  refHex?: string;
}

export interface NodeInspection {
  type: NodeType;
  refKind: RefKind;
  refHex?: string;
  hashHex?: string;
  rlpHex: string;
  rlpSize: number;
  compactPath?: string;
  isLeafPath?: boolean;
  valueHex?: string;
  branchChildren?: ChildInspection[];
}

export interface TraceEvent {
  kind: 'visit' | 'decision' | 'finalize' | 'result' | 'db-get' | 'db-put';
  message: string;
  consumed: number;
  keyRemainder: number[];
  activeNodeId?: string;
  activeNode?: NodeInspection;
  changedNodeId?: string;
  dbKeyHex?: string;
  dbAction?: 'GET' | 'PUT';
  cacheHit?: boolean;
}

export interface RootDisplay {
  isEmpty: boolean;
  isEmbedded: boolean;
  rootRefHex: string;
  commitmentHex: string;
}

export interface TrieGraphNode {
  id: string;
  type: NodeType;
  refKind: RefKind;
  hashHex?: string;
  x: number;
  y: number;
  depth: number;
  summary: string;
  detail: string;
  inspection: NodeInspection;
}

export interface TrieGraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  refKind: Exclude<RefKind, 'empty'>;
}

export interface TrieGraph {
  nodes: TrieGraphNode[];
  edges: TrieGraphEdge[];
  width: number;
  height: number;
  rootId?: string;
}
