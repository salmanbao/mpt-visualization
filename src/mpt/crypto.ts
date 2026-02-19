import { keccak_256 } from '@noble/hashes/sha3.js';
import { EMPTY_BYTES } from './bytes';

export const RLP_EMPTY_STRING = new Uint8Array([0x80]);

export function keccak(input: Uint8Array): Uint8Array {
  return keccak_256(input);
}

export const EMPTY_TRIE_ROOT = keccak(RLP_EMPTY_STRING);
export const EMPTY_CODE_HASH = keccak(EMPTY_BYTES);
