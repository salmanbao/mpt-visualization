import { decode as rlpDecode, encode as rlpEncode, type NestedUint8Array } from '@ethereumjs/rlp';
import { bigintToBytes, bytesToBigint, bytesToHex, hexToBytes, toNibbles } from './bytes';
import { EMPTY_CODE_HASH, EMPTY_TRIE_ROOT, keccak } from './crypto';

export interface GeneratedAccount {
  address: string;
  balance: bigint;
  nonce: bigint;
  keyHash: Uint8Array;
  keyNibbles: number[];
  accountRlp: Uint8Array;
}

export interface DecodedAccountValue {
  nonce: bigint;
  balance: bigint;
  storageRootHex: string;
  codeHashHex: string;
}

function asList(value: Uint8Array | NestedUint8Array): NestedUint8Array {
  if (value instanceof Uint8Array) {
    throw new Error('Expected account RLP list');
  }
  return value;
}

function asBytes(value: Uint8Array | NestedUint8Array): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error('Expected byte field in account RLP');
  }
  return value;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(length: number, rng: () => number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.floor(rng() * 256);
  }
  return out;
}

export function encodeAccountValue(
  nonce: bigint,
  balance: bigint,
  storageRoot: Uint8Array = EMPTY_TRIE_ROOT,
  codeHash: Uint8Array = EMPTY_CODE_HASH,
): Uint8Array {
  return rlpEncode([bigintToBytes(nonce), bigintToBytes(balance), storageRoot, codeHash]);
}

export function decodeAccountValue(encoded: Uint8Array): DecodedAccountValue {
  const decoded = asList(rlpDecode(encoded));
  if (decoded.length !== 4) {
    throw new Error(`Account value must have 4 fields, got ${decoded.length}`);
  }
  return {
    nonce: bytesToBigint(asBytes(decoded[0])),
    balance: bytesToBigint(asBytes(decoded[1])),
    storageRootHex: bytesToHex(asBytes(decoded[2])),
    codeHashHex: bytesToHex(asBytes(decoded[3])),
  };
}

export function addressToTrieKey(addressHex: string): { keyHash: Uint8Array; keyNibbles: number[] } {
  const normalized = addressHex.startsWith('0x') ? addressHex : `0x${addressHex}`;
  const addressBytes = hexToBytes(normalized);
  if (addressBytes.length !== 20) {
    throw new Error(`Address must be 20 bytes, got ${addressBytes.length}`);
  }
  const keyHash = keccak(addressBytes);
  return {
    keyHash,
    keyNibbles: toNibbles(keyHash),
  };
}

export function generateAccounts(seed: number, count: number): GeneratedAccount[] {
  const rng = mulberry32(seed);
  const used = new Set<string>();
  const accounts: GeneratedAccount[] = [];
  while (accounts.length < count) {
    const addressBytes = randomBytes(20, rng);
    const address = bytesToHex(addressBytes);
    if (used.has(address)) {
      continue;
    }
    used.add(address);
    const balance = BigInt(1 + Math.floor(rng() * 9_999_999));
    const nonce = 0n;
    const keyHash = keccak(addressBytes);
    accounts.push({
      address,
      balance,
      nonce,
      keyHash,
      keyNibbles: toNibbles(keyHash),
      accountRlp: encodeAccountValue(nonce, balance),
    });
  }
  return accounts;
}
