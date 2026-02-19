import type { SimulationStep } from '../../mpt/simulator';
import { nibblesToString, shortHex } from '../../mpt/bytes';

export type EventLogFilter = 'all' | 'trie' | 'db' | 'key' | 'root' | 'cache';

export interface StepChip {
  label: string;
}

export interface FormattedStep {
  index: number;
  category: Exclude<EventLogFilter, 'all'>;
  badge: string;
  message: string;
  chips: StepChip[];
  dbKey?: string;
  trieNodeId?: string;
  nodeType?: string;
  dbAction?: 'GET' | 'PUT';
  cacheHit?: boolean;
  searchable: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nibblePrefix(nibbles: unknown): string | undefined {
  if (!Array.isArray(nibbles) || nibbles.length === 0) {
    return undefined;
  }
  const normalized = nibbles.filter((item): item is number => typeof item === 'number' && item >= 0 && item < 16);
  if (normalized.length === 0) {
    return undefined;
  }
  return nibblesToString(normalized.slice(0, 12));
}

function findBranchIndex(message: string): string | undefined {
  const direct = message.match(/index\s+([0-9a-f])/i);
  if (direct) {
    return direct[1].toLowerCase();
  }
  const atIndex = message.match(/@([0-9a-f])\b/i);
  if (atIndex) {
    return atIndex[1].toLowerCase();
  }
  return undefined;
}

export function formatStep(rawStep: SimulationStep, index: number): FormattedStep {
  const raw = asRecord(rawStep);
  const activeNode = asRecord(raw.activeNode);
  const title = asString(raw.title) ?? 'STEP';
  const message = asString(raw.log) ?? asString(raw.message) ?? title;
  const nodeType = asString(activeNode.type) ?? asString(raw.nodeType);
  const dbKey = asString(raw.highlightedDbKey) ?? asString(raw.dbKeyHex) ?? asString(raw.dbKey);
  const dbActionRaw = asString(raw.dbAction) ?? asString(raw.action) ?? asString(raw.op);
  const dbAction = dbActionRaw === 'GET' || dbActionRaw === 'PUT' ? dbActionRaw : undefined;
  const cacheHit = raw.cacheHit === true;
  const trieNodeId = asString(raw.activeNodeId) ?? asString(raw.nodeId);
  const consumed = asNumber(raw.consumed);
  const keyPrefix = nibblePrefix(raw.keyNibbles);
  const refKind = asString(activeNode.refKind) ?? asString(raw.refKind);
  const changedCount = Array.isArray(raw.changedNodeIds) ? raw.changedNodeIds.length : undefined;
  const branchIndex = findBranchIndex(message);

  let category: FormattedStep['category'] = 'trie';
  if (cacheHit) {
    category = 'cache';
  } else if (dbAction || /db get|db put/i.test(message) || !!dbKey) {
    category = 'db';
  } else if (/root/i.test(title) || /root/i.test(message)) {
    category = 'root';
  } else if (/key|nibble|path/i.test(message) || !!keyPrefix) {
    category = 'key';
  } else if (nodeType || trieNodeId) {
    category = 'trie';
  }

  const chips: StepChip[] = [];
  if (nodeType) {
    chips.push({ label: nodeType });
  }
  if (dbAction) {
    chips.push({ label: dbAction });
  }
  if (typeof consumed === 'number') {
    chips.push({ label: `consumed ${consumed}` });
  }
  if (branchIndex) {
    chips.push({ label: `idx ${branchIndex}` });
  }
  if (refKind) {
    chips.push({ label: refKind });
  }
  if (keyPrefix) {
    chips.push({ label: `key ${keyPrefix}` });
  }
  if (changedCount && changedCount > 0) {
    chips.push({ label: `rewritten ${changedCount}` });
  }
  if (cacheHit) {
    chips.push({ label: 'cache hit' });
  }
  if (dbKey) {
    chips.push({ label: shortHex(dbKey, 6) });
  }

  const badge = dbAction ?? (cacheHit ? 'CACHE' : title.split(/\s+/)[0].toUpperCase());

  return {
    index,
    category,
    badge,
    message,
    chips,
    dbKey,
    trieNodeId,
    nodeType,
    dbAction,
    cacheHit,
    searchable: `${title} ${message} ${nodeType ?? ''} ${dbKey ?? ''} ${keyPrefix ?? ''} ${refKind ?? ''}`.toLowerCase(),
  };
}

export function stepMatchesFilter(step: FormattedStep, filter: EventLogFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'db') {
    return step.category === 'db' || !!step.dbAction;
  }
  if (filter === 'cache') {
    return step.category === 'cache' || step.cacheHit === true;
  }
  return step.category === filter;
}
