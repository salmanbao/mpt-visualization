import { decode as rlpDecode, encode as rlpEncode, type NestedUint8Array } from '@ethereumjs/rlp';
import { bytesToHex, nibblesToString, shortHex } from './bytes';
import { keccak } from './crypto';
import { decodeCompactPath, encodeCompactPath } from './hexPrefix';
import type { NodeInspection, NodeRef, NodeType, RefKind, TrieNode } from './types';

function asList(value: Uint8Array | NestedUint8Array): NestedUint8Array {
  if (value instanceof Uint8Array) {
    throw new Error('Expected list item in RLP decode');
  }
  return value;
}

function asBytes(value: Uint8Array | NestedUint8Array): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error('Expected bytes item in RLP decode');
  }
  return value;
}

export function refKindFromRef(ref: NodeRef): RefKind {
  if (ref.length === 0) {
    return 'empty';
  }
  return ref.length < 32 ? 'embedded' : 'hash-ref';
}

export function nodeIdFromRef(ref: NodeRef): string {
  if (ref.length === 0) {
    return 'empty';
  }
  if (ref.length === 32) {
    return bytesToHex(ref);
  }
  return `embedded:${bytesToHex(keccak(ref), false).slice(0, 24)}`;
}

export function encodeTrieNode(node: TrieNode): Uint8Array {
  if (node.type === 'branch') {
    if (node.children.length !== 16) {
      throw new Error('Branch node must have 16 children slots');
    }
    return rlpEncode([...node.children, node.value]);
  }
  if (node.type === 'leaf') {
    return rlpEncode([encodeCompactPath(node.path, true), node.value]);
  }
  return rlpEncode([encodeCompactPath(node.path, false), node.child]);
}

export function decodeTrieNode(encoded: Uint8Array): TrieNode {
  const decoded = asList(rlpDecode(encoded));
  if (decoded.length === 17) {
    const children = decoded.slice(0, 16).map((item) => asBytes(item));
    const value = asBytes(decoded[16]);
    return {
      type: 'branch',
      children,
      value,
    };
  }
  if (decoded.length !== 2) {
    throw new Error(`Invalid node decoded length ${decoded.length}`);
  }
  const path = decodeCompactPath(asBytes(decoded[0]));
  const second = asBytes(decoded[1]);
  if (path.isLeaf) {
    return {
      type: 'leaf',
      path: path.nibbles,
      value: second,
    };
  }
  return {
    type: 'extension',
    path: path.nibbles,
    child: second,
  };
}

export function inspectNode(node: TrieNode, rlp: Uint8Array, ref?: NodeRef): NodeInspection {
  const refKind = ref ? refKindFromRef(ref) : 'embedded';
  const hashHex = ref && ref.length === 32 ? bytesToHex(ref) : undefined;
  const refHex = ref && ref.length > 0 ? bytesToHex(ref) : undefined;
  const inspection: NodeInspection = {
    type: node.type,
    refKind,
    refHex,
    hashHex,
    rlpHex: bytesToHex(rlp),
    rlpSize: rlp.length,
  };

  if (node.type === 'branch') {
    const children = node.children
      .map((child, index) => {
        const childKind = refKindFromRef(child);
        if (childKind === 'empty') {
          return null;
        }
        return {
          index,
          refKind: childKind,
          refHex: bytesToHex(child),
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);
    inspection.branchChildren = children;
    if (node.value.length > 0) {
      inspection.valueHex = bytesToHex(node.value);
    }
    return inspection;
  }

  inspection.compactPath = nibblesToString(node.path);
  inspection.isLeafPath = node.type === 'leaf';
  if (node.type === 'leaf') {
    inspection.valueHex = bytesToHex(node.value);
  }
  return inspection;
}

export function summaryForNode(node: TrieNode): string {
  if (node.type === 'branch') {
    const indexes: string[] = [];
    for (let i = 0; i < node.children.length; i += 1) {
      if (node.children[i].length > 0) {
        indexes.push(i.toString(16));
      }
    }
    const suffix = indexes.length > 0 ? indexes.join(',') : '-';
    return `children [${suffix}]`;
  }
  const compact = nibblesToString(node.path);
  if (node.type === 'leaf') {
    return `leaf path ${compact || '(empty)'}`;
  }
  return `ext path ${compact || '(empty)'}`;
}

export function detailForNode(node: TrieNode): string {
  if (node.type === 'branch') {
    return node.value.length > 0 ? `value @ branch ${shortHex(bytesToHex(node.value), 10)}` : 'no branch value';
  }
  if (node.type === 'leaf') {
    return `value ${shortHex(bytesToHex(node.value), 10)}`;
  }
  return `child ${refKindFromRef(node.child)}`;
}

export function normalizeNodeType(type: string): NodeType | 'unknown' {
  if (type === 'branch' || type === 'extension' || type === 'leaf') {
    return type;
  }
  return 'unknown';
}
