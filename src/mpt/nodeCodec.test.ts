import { encodeTrieNode, decodeTrieNode } from './nodeCodec';
import type { TrieNode } from './types';

function asComparable(node: TrieNode): unknown {
  if (node.type === 'branch') {
    return {
      type: node.type,
      children: node.children.map((child) => Array.from(child)),
      value: Array.from(node.value),
    };
  }
  if (node.type === 'extension') {
    return {
      type: node.type,
      path: node.path,
      child: Array.from(node.child),
    };
  }
  return {
    type: node.type,
    path: node.path,
    value: Array.from(node.value),
  };
}

describe('node RLP encode/decode', () => {
  it('roundtrips leaf, extension, and branch nodes', () => {
    const branchChildren = Array.from({ length: 16 }, () => new Uint8Array());
    branchChildren[0xa] = new Uint8Array(32).fill(0xaa);

    const nodes: TrieNode[] = [
      {
        type: 'leaf',
        path: [1, 2, 3],
        value: new Uint8Array([0xde, 0xad]),
      },
      {
        type: 'extension',
        path: [0xf, 0x0, 0xc],
        child: new Uint8Array(32).fill(0x11),
      },
      {
        type: 'branch',
        children: branchChildren,
        value: new Uint8Array([0x01]),
      },
    ];

    for (const node of nodes) {
      const encoded = encodeTrieNode(node);
      const decoded = decodeTrieNode(encoded);
      expect(asComparable(decoded)).toEqual(asComparable(node));
    }
  });
});
