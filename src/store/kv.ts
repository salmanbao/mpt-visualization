import type { NodeType } from '../mpt/types';

export interface DbEntry {
  keyHex: string;
  valueHex: string;
  valueSize: number;
  nodeType: NodeType | 'unknown';
  insertedAt: number;
}

function normalizeHex(hex: string): string {
  const lower = hex.toLowerCase();
  return lower.startsWith('0x') ? lower : `0x${lower}`;
}

function bytesSizeFromHex(hex: string): number {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  return raw.length / 2;
}

export class InMemoryKvStore {
  private rows = new Map<string, DbEntry>();
  private insertionOrder: string[] = [];
  private clock = 0;

  static fromEntries(entries: DbEntry[]): InMemoryKvStore {
    const store = new InMemoryKvStore();
    for (const entry of entries) {
      const normalizedKey = normalizeHex(entry.keyHex);
      store.rows.set(normalizedKey, {
        keyHex: normalizedKey,
        valueHex: normalizeHex(entry.valueHex),
        valueSize: entry.valueSize,
        nodeType: entry.nodeType,
        insertedAt: entry.insertedAt,
      });
      store.insertionOrder.push(normalizedKey);
      store.clock = Math.max(store.clock, entry.insertedAt + 1);
    }
    return store;
  }

  clone(): InMemoryKvStore {
    return InMemoryKvStore.fromEntries(this.entries());
  }

  clear(): void {
    this.rows.clear();
    this.insertionOrder = [];
    this.clock = 0;
  }

  get(keyHex: string): string | undefined {
    return this.rows.get(normalizeHex(keyHex))?.valueHex;
  }

  put(keyHex: string, valueHex: string, nodeType: NodeType | 'unknown' = 'unknown'): { isNew: boolean; entry: DbEntry } {
    const key = normalizeHex(keyHex);
    const value = normalizeHex(valueHex);
    const existing = this.rows.get(key);
    if (existing) {
      if (existing.nodeType === 'unknown' && nodeType !== 'unknown') {
        existing.nodeType = nodeType;
      }
      return { isNew: false, entry: { ...existing } };
    }

    const entry: DbEntry = {
      keyHex: key,
      valueHex: value,
      valueSize: bytesSizeFromHex(value),
      nodeType,
      insertedAt: this.clock,
    };
    this.clock += 1;
    this.rows.set(key, entry);
    this.insertionOrder.push(key);
    return { isNew: true, entry: { ...entry } };
  }

  entries(): DbEntry[] {
    return this.insertionOrder
      .map((key) => this.rows.get(key))
      .filter((value): value is DbEntry => value !== undefined)
      .map((entry) => ({ ...entry }));
  }
}
