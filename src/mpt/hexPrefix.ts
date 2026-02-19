import { nibblesToPackedBytes, packedBytesToNibbles } from './bytes';

export interface CompactPath {
  nibbles: number[];
  isLeaf: boolean;
}

function validateNibbles(nibbles: number[]): void {
  for (const nibble of nibbles) {
    if (!Number.isInteger(nibble) || nibble < 0 || nibble > 0x0f) {
      throw new Error(`Invalid nibble ${nibble}`);
    }
  }
}

export function encodeCompactPath(nibbles: number[], isLeaf: boolean): Uint8Array {
  validateNibbles(nibbles);
  const odd = nibbles.length % 2 === 1;
  const flags = (isLeaf ? 2 : 0) + (odd ? 1 : 0);
  const prefixed = odd ? [flags, ...nibbles] : [flags, 0, ...nibbles];
  return nibblesToPackedBytes(prefixed);
}

export function decodeCompactPath(encoded: Uint8Array): CompactPath {
  const nibbles = packedBytesToNibbles(encoded);
  if (nibbles.length === 0) {
    throw new Error('Compact path cannot be empty');
  }
  const flags = nibbles[0];
  const isLeaf = (flags & 0x2) === 0x2;
  const odd = (flags & 0x1) === 0x1;
  const path = odd ? nibbles.slice(1) : nibbles.slice(2);
  validateNibbles(path);
  return { nibbles: path, isLeaf };
}
