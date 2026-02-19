import { bytesToHex, cloneBytes, EMPTY_BYTES, equalBytes, hexToBytes, nibblesToString } from './bytes';
import { EMPTY_TRIE_ROOT, keccak } from './crypto';
import { detailForNode, decodeTrieNode, encodeTrieNode, inspectNode, nodeIdFromRef, refKindFromRef, summaryForNode } from './nodeCodec';
import type {
  BranchNode,
  NodeRef,
  RootDisplay,
  TraceEvent,
  TrieGraph,
  TrieGraphEdge,
  TrieGraphNode,
  TrieNode,
} from './types';
import { InMemoryKvStore } from '../store/kv';

export interface TrieOperationOptions {
  db: InMemoryKvStore;
  trace?: (event: TraceEvent) => void;
  cache?: Map<string, Uint8Array>;
  useCache?: boolean;
  emitDbGetEvents?: boolean;
}

export interface InsertOutcome {
  rootRef: Uint8Array;
  changedNodeIds: string[];
}

export interface LookupOutcome {
  found: boolean;
  value?: Uint8Array;
  mismatchReason?: string;
}

interface ResolvedNode {
  node: TrieNode;
  rlp: Uint8Array;
  id: string;
}

interface FinalizedNode {
  ref: Uint8Array;
  id: string;
}

function emit(trace: TrieOperationOptions['trace'], event: TraceEvent): void {
  if (trace) {
    trace(event);
  }
}

function commonPrefixLength(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let i = 0;
  while (i < length && a[i] === b[i]) {
    i += 1;
  }
  return i;
}

function startsWith(source: number[], prefix: number[]): boolean {
  if (prefix.length > source.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (source[i] !== prefix[i]) {
      return false;
    }
  }
  return true;
}

function emptyBranch(value: Uint8Array = EMPTY_BYTES): BranchNode {
  return {
    type: 'branch',
    children: Array.from({ length: 16 }, () => EMPTY_BYTES),
    value,
  };
}

function resolveNode(ref: NodeRef, consumed: number, keyRemainder: number[], options: TrieOperationOptions): ResolvedNode {
  let rlp: Uint8Array;
  if (ref.length === 32) {
    const keyHex = bytesToHex(ref);
    let fromCache = false;
    if (options.useCache && options.cache?.has(keyHex)) {
      rlp = options.cache.get(keyHex)!;
      fromCache = true;
    } else {
      const dbHex = options.db.get(keyHex);
      if (!dbHex) {
        throw new Error(`Missing node in DB for hash ${keyHex}`);
      }
      rlp = hexToBytes(dbHex);
      if (options.useCache && options.cache) {
        options.cache.set(keyHex, rlp);
      }
    }
    if (options.emitDbGetEvents) {
      emit(options.trace, {
        kind: 'db-get',
        message: fromCache ? `Cache hit for ${keyHex}` : `DB GET ${keyHex}`,
        consumed,
        keyRemainder,
        dbAction: 'GET',
        dbKeyHex: keyHex,
        cacheHit: fromCache,
      });
    }
  } else {
    rlp = ref;
  }

  return {
    node: decodeTrieNode(rlp),
    rlp,
    id: nodeIdFromRef(ref),
  };
}

function finalizeNode(
  node: TrieNode,
  consumed: number,
  keyRemainder: number[],
  message: string,
  options: TrieOperationOptions,
): FinalizedNode {
  const rlp = encodeTrieNode(node);
  if (rlp.length < 32) {
    const ref = rlp;
    const id = nodeIdFromRef(ref);
    const inspection = inspectNode(node, rlp, ref);
    emit(options.trace, {
      kind: 'finalize',
      message: `${message} -> embedded (${rlp.length} bytes)`,
      consumed,
      keyRemainder,
      activeNodeId: id,
      activeNode: inspection,
      changedNodeId: id,
    });
    return { ref, id };
  }

  const hash = keccak(rlp);
  const keyHex = bytesToHex(hash);
  options.db.put(keyHex, bytesToHex(rlp), node.type);
  if (options.useCache && options.cache) {
    options.cache.set(keyHex, rlp);
  }
  const inspection = inspectNode(node, rlp, hash);
  emit(options.trace, {
    kind: 'finalize',
    message: `${message} -> hash-ref ${keyHex}`,
    consumed,
    keyRemainder,
    activeNodeId: keyHex,
    activeNode: inspection,
    changedNodeId: keyHex,
  });
  emit(options.trace, {
    kind: 'db-put',
    message: `DB PUT ${keyHex} (${rlp.length} bytes)`,
    consumed,
    keyRemainder,
    dbAction: 'PUT',
    dbKeyHex: keyHex,
    activeNodeId: keyHex,
    activeNode: inspection,
    changedNodeId: keyHex,
  });
  return { ref: hash, id: keyHex };
}

function cloneChildren(children: NodeRef[]): NodeRef[] {
  return children.map((child) => (child.length === 0 ? EMPTY_BYTES : cloneBytes(child)));
}

function insertAt(
  ref: NodeRef,
  key: number[],
  value: Uint8Array,
  consumed: number,
  options: TrieOperationOptions,
): InsertOutcome {
  if (ref.length === 0) {
    emit(options.trace, {
      kind: 'decision',
      message: `Create leaf for remaining path ${nibblesToString(key) || '(empty)'}`,
      consumed,
      keyRemainder: key,
    });
    const created = finalizeNode({ type: 'leaf', path: key, value }, consumed, key, 'Finalize new leaf', options);
    return { rootRef: created.ref, changedNodeIds: [created.id] };
  }

  const resolved = resolveNode(ref, consumed, key, options);
  emit(options.trace, {
    kind: 'visit',
    message: `Visit ${resolved.node.type} node`,
    consumed,
    keyRemainder: key,
    activeNodeId: resolved.id,
    activeNode: inspectNode(resolved.node, resolved.rlp, ref),
  });

  if (resolved.node.type === 'leaf') {
    const leaf = resolved.node;
    const shared = commonPrefixLength(leaf.path, key);
    if (shared === leaf.path.length && shared === key.length) {
      emit(options.trace, {
        kind: 'decision',
        message: 'Leaf path fully matched: update existing value',
        consumed,
        keyRemainder: key,
        activeNodeId: resolved.id,
      });
      const updated = finalizeNode({ type: 'leaf', path: leaf.path, value }, consumed, key, 'Finalize updated leaf', options);
      return { rootRef: updated.ref, changedNodeIds: [updated.id] };
    }

    const branch = emptyBranch();
    const changedNodeIds: string[] = [];

    const oldRemainder = leaf.path.slice(shared);
    if (oldRemainder.length === 0) {
      branch.value = leaf.value;
    } else {
      const oldIndex = oldRemainder[0];
      const oldLeaf = finalizeNode(
        { type: 'leaf', path: oldRemainder.slice(1), value: leaf.value },
        consumed + shared + 1,
        oldRemainder.slice(1),
        `Finalize split old leaf child @${oldIndex.toString(16)}`,
        options,
      );
      branch.children[oldIndex] = oldLeaf.ref;
      changedNodeIds.push(oldLeaf.id);
    }

    const newRemainder = key.slice(shared);
    if (newRemainder.length === 0) {
      branch.value = value;
    } else {
      const newIndex = newRemainder[0];
      const newLeaf = finalizeNode(
        { type: 'leaf', path: newRemainder.slice(1), value },
        consumed + shared + 1,
        newRemainder.slice(1),
        `Finalize split new leaf child @${newIndex.toString(16)}`,
        options,
      );
      branch.children[newIndex] = newLeaf.ref;
      changedNodeIds.push(newLeaf.id);
    }

    const branchFinal = finalizeNode(branch, consumed + shared, key.slice(shared), 'Finalize split branch', options);
    changedNodeIds.push(branchFinal.id);

    if (shared > 0) {
      const extFinal = finalizeNode(
        { type: 'extension', path: key.slice(0, shared), child: branchFinal.ref },
        consumed,
        key,
        'Finalize shared extension',
        options,
      );
      changedNodeIds.push(extFinal.id);
      return { rootRef: extFinal.ref, changedNodeIds };
    }

    return { rootRef: branchFinal.ref, changedNodeIds };
  }

  if (resolved.node.type === 'extension') {
    const ext = resolved.node;
    const shared = commonPrefixLength(ext.path, key);
    if (shared === ext.path.length) {
      const childInsert = insertAt(ext.child, key.slice(shared), value, consumed + shared, options);
      const rebuilt = finalizeNode(
        { type: 'extension', path: ext.path, child: childInsert.rootRef },
        consumed,
        key,
        'Finalize extension after child update',
        options,
      );
      return {
        rootRef: rebuilt.ref,
        changedNodeIds: [...childInsert.changedNodeIds, rebuilt.id],
      };
    }

    const changedNodeIds: string[] = [];
    const branch = emptyBranch();

    const oldRemainder = ext.path.slice(shared);
    const oldIndex = oldRemainder[0];
    if (oldRemainder.length === 1) {
      branch.children[oldIndex] = ext.child;
    } else {
      const oldExt = finalizeNode(
        { type: 'extension', path: oldRemainder.slice(1), child: ext.child },
        consumed + shared + 1,
        oldRemainder.slice(1),
        `Finalize split old extension child @${oldIndex.toString(16)}`,
        options,
      );
      branch.children[oldIndex] = oldExt.ref;
      changedNodeIds.push(oldExt.id);
    }

    const newRemainder = key.slice(shared);
    if (newRemainder.length === 0) {
      branch.value = value;
    } else {
      const newIndex = newRemainder[0];
      const newLeaf = finalizeNode(
        { type: 'leaf', path: newRemainder.slice(1), value },
        consumed + shared + 1,
        newRemainder.slice(1),
        `Finalize split new leaf child @${newIndex.toString(16)}`,
        options,
      );
      branch.children[newIndex] = newLeaf.ref;
      changedNodeIds.push(newLeaf.id);
    }

    const branchFinal = finalizeNode(branch, consumed + shared, key.slice(shared), 'Finalize split branch', options);
    changedNodeIds.push(branchFinal.id);

    if (shared > 0) {
      const extFinal = finalizeNode(
        { type: 'extension', path: key.slice(0, shared), child: branchFinal.ref },
        consumed,
        key,
        'Finalize shared extension',
        options,
      );
      changedNodeIds.push(extFinal.id);
      return { rootRef: extFinal.ref, changedNodeIds };
    }

    return { rootRef: branchFinal.ref, changedNodeIds };
  }

  const branch = resolved.node;
  const nextBranch: BranchNode = {
    type: 'branch',
    children: cloneChildren(branch.children),
    value: branch.value.length === 0 ? EMPTY_BYTES : cloneBytes(branch.value),
  };

  if (key.length === 0) {
    nextBranch.value = value;
    const rebuilt = finalizeNode(nextBranch, consumed, key, 'Finalize branch value update', options);
    return { rootRef: rebuilt.ref, changedNodeIds: [rebuilt.id] };
  }

  const index = key[0];
  const childUpdate = insertAt(nextBranch.children[index], key.slice(1), value, consumed + 1, options);
  nextBranch.children[index] = childUpdate.rootRef;
  const rebuilt = finalizeNode(nextBranch, consumed, key, `Finalize branch child update @${index.toString(16)}`, options);
  return {
    rootRef: rebuilt.ref,
    changedNodeIds: [...childUpdate.changedNodeIds, rebuilt.id],
  };
}

export function insertKeyValue(rootRef: NodeRef, key: number[], value: Uint8Array, options: TrieOperationOptions): InsertOutcome {
  return insertAt(rootRef, key, value, 0, options);
}

function lookupAt(
  ref: NodeRef,
  key: number[],
  consumed: number,
  options: TrieOperationOptions,
): LookupOutcome {
  if (ref.length === 0) {
    const mismatchReason = 'Missing child reference';
    emit(options.trace, {
      kind: 'result',
      message: mismatchReason,
      consumed,
      keyRemainder: key,
    });
    return { found: false, mismatchReason };
  }

  const resolved = resolveNode(ref, consumed, key, options);
  emit(options.trace, {
    kind: 'visit',
    message: `Visit ${resolved.node.type} node`,
    consumed,
    keyRemainder: key,
    activeNodeId: resolved.id,
    activeNode: inspectNode(resolved.node, resolved.rlp, ref),
  });

  if (resolved.node.type === 'leaf') {
    if (equalBytes(new Uint8Array(resolved.node.path), new Uint8Array(key))) {
      emit(options.trace, {
        kind: 'result',
        message: 'Leaf path matched: account found',
        consumed,
        keyRemainder: [],
        activeNodeId: resolved.id,
      });
      return { found: true, value: resolved.node.value };
    }
    const mismatchReason = `Leaf mismatch (expected ${nibblesToString(resolved.node.path)}, got ${nibblesToString(key)})`;
    emit(options.trace, {
      kind: 'result',
      message: mismatchReason,
      consumed,
      keyRemainder: key,
      activeNodeId: resolved.id,
    });
    return { found: false, mismatchReason };
  }

  if (resolved.node.type === 'extension') {
    if (!startsWith(key, resolved.node.path)) {
      const mismatchReason = `Extension mismatch at path ${nibblesToString(resolved.node.path)}`;
      emit(options.trace, {
        kind: 'result',
        message: mismatchReason,
        consumed,
        keyRemainder: key,
        activeNodeId: resolved.id,
      });
      return { found: false, mismatchReason };
    }
    emit(options.trace, {
      kind: 'decision',
      message: `Extension path matched ${nibblesToString(resolved.node.path)}`,
      consumed,
      keyRemainder: key.slice(resolved.node.path.length),
      activeNodeId: resolved.id,
    });
    return lookupAt(resolved.node.child, key.slice(resolved.node.path.length), consumed + resolved.node.path.length, options);
  }

  if (key.length === 0) {
    if (resolved.node.value.length === 0) {
      const mismatchReason = 'Branch value slot empty';
      emit(options.trace, {
        kind: 'result',
        message: mismatchReason,
        consumed,
        keyRemainder: key,
        activeNodeId: resolved.id,
      });
      return { found: false, mismatchReason };
    }
    emit(options.trace, {
      kind: 'result',
      message: 'Branch value slot matched',
      consumed,
      keyRemainder: key,
      activeNodeId: resolved.id,
    });
    return { found: true, value: resolved.node.value };
  }

  const index = key[0];
  emit(options.trace, {
    kind: 'decision',
    message: `Traverse branch index ${index.toString(16)}`,
    consumed,
    keyRemainder: key.slice(1),
    activeNodeId: resolved.id,
  });
  return lookupAt(resolved.node.children[index], key.slice(1), consumed + 1, options);
}

export function lookupKey(rootRef: NodeRef, key: number[], options: TrieOperationOptions): LookupOutcome {
  return lookupAt(rootRef, key, 0, options);
}

export function describeRoot(rootRef: NodeRef): RootDisplay {
  if (rootRef.length === 0) {
    return {
      isEmpty: true,
      isEmbedded: false,
      rootRefHex: '0x',
      commitmentHex: bytesToHex(EMPTY_TRIE_ROOT),
    };
  }
  if (rootRef.length < 32) {
    return {
      isEmpty: false,
      isEmbedded: true,
      rootRefHex: bytesToHex(rootRef),
      commitmentHex: bytesToHex(keccak(rootRef)),
    };
  }
  const rootHex = bytesToHex(rootRef);
  return {
    isEmpty: false,
    isEmbedded: false,
    rootRefHex: rootHex,
    commitmentHex: rootHex,
  };
}

function resolveNodeWithoutTrace(ref: NodeRef, db: InMemoryKvStore): ResolvedNode {
  if (ref.length === 0) {
    throw new Error('Cannot resolve empty reference');
  }
  const rlp = ref.length === 32 ? hexToBytes(db.get(bytesToHex(ref)) ?? '') : ref;
  if (rlp.length === 0) {
    throw new Error(`Missing node bytes for ${bytesToHex(ref)}`);
  }
  return {
    node: decodeTrieNode(rlp),
    rlp,
    id: nodeIdFromRef(ref),
  };
}

export function buildTrieGraph(rootRef: NodeRef, db: InMemoryKvStore): TrieGraph {
  if (rootRef.length === 0) {
    return { nodes: [], edges: [], width: 800, height: 500 };
  }

  const nodesById = new Map<string, TrieGraphNode>();
  const edges: TrieGraphEdge[] = [];
  const depthById = new Map<string, number>();
  const discovery: string[] = [];
  const expanded = new Set<string>();
  let rootId = '';

  const visitRef = (ref: NodeRef, depth: number): string | undefined => {
    if (ref.length === 0) {
      return undefined;
    }

    let resolved: ResolvedNode;
    try {
      resolved = resolveNodeWithoutTrace(ref, db);
    } catch {
      return undefined;
    }

    const inspection = inspectNode(resolved.node, resolved.rlp, ref);
    const nodeId = resolved.id;
    if (!nodesById.has(nodeId)) {
      nodesById.set(nodeId, {
        id: nodeId,
        type: resolved.node.type,
        refKind: refKindFromRef(ref),
        hashHex: ref.length === 32 ? bytesToHex(ref) : undefined,
        x: 0,
        y: 0,
        depth,
        summary: summaryForNode(resolved.node),
        detail: detailForNode(resolved.node),
        inspection,
      });
      discovery.push(nodeId);
      depthById.set(nodeId, depth);
    } else {
      depthById.set(nodeId, Math.min(depthById.get(nodeId) ?? depth, depth));
    }

    if (expanded.has(nodeId)) {
      return nodeId;
    }
    expanded.add(nodeId);

    if (resolved.node.type === 'branch') {
      for (let i = 0; i < resolved.node.children.length; i += 1) {
        const child = resolved.node.children[i];
        if (child.length === 0) {
          continue;
        }
        const childId = visitRef(child, depth + 1);
        if (!childId) {
          continue;
        }
        const childKind = refKindFromRef(child) === 'hash-ref' ? 'hash-ref' : 'embedded';
        edges.push({
          id: `${nodeId}-${childId}-${i}`,
          from: nodeId,
          to: childId,
          refKind: childKind,
          label: `${i.toString(16)} | ${childKind}`,
        });
      }
    } else if (resolved.node.type === 'extension') {
      const childId = visitRef(resolved.node.child, depth + 1);
      if (childId) {
        const childKind = refKindFromRef(resolved.node.child) === 'hash-ref' ? 'hash-ref' : 'embedded';
        edges.push({
          id: `${nodeId}-${childId}-ext`,
          from: nodeId,
          to: childId,
          refKind: childKind,
          label: `next | ${childKind}`,
        });
      }
    }

    return nodeId;
  };

  rootId = visitRef(rootRef, 0) ?? '';

  const levels = new Map<number, string[]>();
  for (const nodeId of discovery) {
    const depth = depthById.get(nodeId) ?? 0;
    const list = levels.get(depth);
    if (list) {
      list.push(nodeId);
    } else {
      levels.set(depth, [nodeId]);
    }
  }

  const horizontalGap = 260;
  const verticalGap = 170;
  let maxWidth = horizontalGap * 2;
  let maxDepth = 1;
  for (const [depth, ids] of levels) {
    maxDepth = Math.max(maxDepth, depth + 1);
    maxWidth = Math.max(maxWidth, (ids.length + 1) * horizontalGap);
    ids.forEach((id, index) => {
      const node = nodesById.get(id);
      if (!node) {
        return;
      }
      node.depth = depth;
      node.x = (index + 1) * horizontalGap;
      node.y = (depth + 1) * verticalGap;
    });
  }

  return {
    nodes: Array.from(nodesById.values()),
    edges,
    width: maxWidth + 200,
    height: maxDepth * verticalGap + 200,
    rootId,
  };
}
