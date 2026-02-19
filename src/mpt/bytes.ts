export const EMPTY_BYTES = new Uint8Array();

export function bytesToHex(bytes: Uint8Array, withPrefix = true): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return withPrefix ? `0x${hex}` : hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (raw.length === 0) {
    return new Uint8Array();
  }
  const normalized = raw.length % 2 === 0 ? raw : `0${raw}`;
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function toNibbles(bytes: Uint8Array): number[] {
  const nibbles: number[] = [];
  for (const byte of bytes) {
    nibbles.push((byte >> 4) & 0x0f, byte & 0x0f);
  }
  return nibbles;
}

export function nibblesToPackedBytes(nibbles: number[]): Uint8Array {
  if (nibbles.length % 2 !== 0) {
    throw new Error('Nibble array must be even length when packing bytes');
  }
  const out = new Uint8Array(nibbles.length / 2);
  for (let i = 0; i < nibbles.length; i += 2) {
    out[i / 2] = ((nibbles[i] & 0x0f) << 4) | (nibbles[i + 1] & 0x0f);
  }
  return out;
}

export function packedBytesToNibbles(bytes: Uint8Array): number[] {
  return toNibbles(bytes);
}

export function nibblesToString(nibbles: number[]): string {
  return nibbles.map((n) => n.toString(16)).join('');
}

export function shortHex(hex: string, edge = 8): string {
  const normalized = hex.startsWith('0x') ? hex : `0x${hex}`;
  if (normalized.length <= edge * 2 + 4) {
    return normalized;
  }
  return `${normalized.slice(0, edge + 2)}...${normalized.slice(-edge)}`;
}

export function bigintToBytes(value: bigint | number): Uint8Array {
  const source = typeof value === 'number' ? BigInt(value) : value;
  if (source === 0n) {
    return EMPTY_BYTES;
  }
  let hex = source.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return hexToBytes(hex);
}

export function bytesToBigint(bytes: Uint8Array): bigint {
  if (bytes.length === 0) {
    return 0n;
  }
  return BigInt(`0x${bytesToHex(bytes, false)}`);
}

export function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
