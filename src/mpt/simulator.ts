import { cloneBytes, nibblesToString, shortHex } from './bytes';
import { decodeAccountValue, encodeAccountValue, type GeneratedAccount } from './account';
import { describeRoot, insertKeyValue, lookupKey } from './trie';
import type { NodeInspection, TraceEvent } from './types';
import { InMemoryKvStore, type DbEntry } from '../store/kv';

export type SimulationMode = 'insert' | 'lookup' | 'update';

export interface SimulationStep {
  id: number;
  mode: SimulationMode;
  title: string;
  log: string;
  rootRef: Uint8Array;
  keyNibbles: number[];
  consumed: number;
  activeNodeId?: string;
  activeNode?: NodeInspection;
  highlightedDbKey?: string;
  dbAction?: 'GET' | 'PUT';
  cacheHit?: boolean;
  changedNodeIds: string[];
  dbEntries: DbEntry[];
}

export interface BuildSimulationResult {
  steps: SimulationStep[];
  rootRef: Uint8Array;
  db: InMemoryKvStore;
}

export interface LookupSimulationResult {
  steps: SimulationStep[];
  found: boolean;
  value?: Uint8Array;
  mismatchReason?: string;
}

export interface UpdateSimulationResult {
  steps: SimulationStep[];
  rootRef: Uint8Array;
  db: InMemoryKvStore;
  changedNodeCount: number;
  updatedAccount: GeneratedAccount;
}

class StepCollector {
  private steps: SimulationStep[] = [];
  private mode: SimulationMode;
  private db: InMemoryKvStore;
  private rootRefGetter: () => Uint8Array;

  constructor(mode: SimulationMode, db: InMemoryKvStore, rootRefGetter: () => Uint8Array) {
    this.mode = mode;
    this.db = db;
    this.rootRefGetter = rootRefGetter;
  }

  record(partial: Omit<SimulationStep, 'id' | 'mode' | 'rootRef' | 'dbEntries'> & { rootRef?: Uint8Array }): void {
    const snapshot: SimulationStep = {
      id: this.steps.length,
      mode: this.mode,
      title: partial.title,
      log: partial.log,
      rootRef: cloneBytes(partial.rootRef ?? this.rootRefGetter()),
      keyNibbles: partial.keyNibbles,
      consumed: partial.consumed,
      activeNodeId: partial.activeNodeId,
      activeNode: partial.activeNode,
      highlightedDbKey: partial.highlightedDbKey,
      dbAction: partial.dbAction,
      cacheHit: partial.cacheHit,
      changedNodeIds: partial.changedNodeIds,
      dbEntries: this.db.entries(),
    };
    this.steps.push(snapshot);
  }

  fromTrace(event: TraceEvent): void {
    const title = event.kind.toUpperCase();
    this.record({
      title,
      log: event.message,
      keyNibbles: event.keyRemainder,
      consumed: event.consumed,
      activeNodeId: event.activeNodeId,
      activeNode: event.activeNode,
      highlightedDbKey: event.dbKeyHex,
      dbAction: event.dbAction,
      cacheHit: event.cacheHit,
      changedNodeIds: event.changedNodeId ? [event.changedNodeId] : [],
    });
  }

  all(): SimulationStep[] {
    return this.steps;
  }
}

export function simulateBuild(accounts: GeneratedAccount[]): BuildSimulationResult {
  const db = new InMemoryKvStore();
  let rootRef: Uint8Array = new Uint8Array();
  const collector = new StepCollector('insert', db, () => rootRef);

  collector.record({
    title: 'BUILD START',
    log: `Reset trie and DB. Accounts queued: ${accounts.length}`,
    keyNibbles: [],
    consumed: 0,
    changedNodeIds: [],
  });

  for (const account of accounts) {
    collector.record({
      title: 'INSERT ACCOUNT',
      log: `Insert ${shortHex(account.address, 10)} with key ${nibblesToString(account.keyNibbles).slice(0, 16)}...`,
      keyNibbles: account.keyNibbles,
      consumed: 0,
      changedNodeIds: [],
    });

    const inserted = insertKeyValue(rootRef, account.keyNibbles, account.accountRlp, {
      db,
      trace: (event) => collector.fromTrace(event),
      emitDbGetEvents: false,
      cache: new Map(),
      useCache: false,
    });
    rootRef = inserted.rootRef;

    const rootView = describeRoot(rootRef);
    collector.record({
      title: 'ROOT UPDATED',
      log: rootView.isEmbedded
        ? `Embedded root updated. Commitment keccak: ${rootView.commitmentHex}`
        : `Root hash updated: ${rootView.commitmentHex}`,
      keyNibbles: account.keyNibbles,
      consumed: account.keyNibbles.length,
      changedNodeIds: inserted.changedNodeIds,
    });
  }

  collector.record({
    title: 'BUILD COMPLETE',
    log: `Final commitment: ${describeRoot(rootRef).commitmentHex}`,
    keyNibbles: [],
    consumed: 0,
    changedNodeIds: [],
  });

  return { steps: collector.all(), rootRef, db };
}

export function simulateLookup(
  rootRef: Uint8Array,
  db: InMemoryKvStore,
  account: GeneratedAccount,
  useCache: boolean,
): LookupSimulationResult {
  const collector = new StepCollector('lookup', db, () => rootRef);
  const cache = new Map<string, Uint8Array>();

  collector.record({
    title: 'LOOKUP START',
    log: `Address ${shortHex(account.address, 10)} -> keccak key ${nibblesToString(account.keyNibbles).slice(0, 24)}...`,
    keyNibbles: account.keyNibbles,
    consumed: 0,
    changedNodeIds: [],
  });

  const result = lookupKey(rootRef, account.keyNibbles, {
    db,
    trace: (event) => collector.fromTrace(event),
    emitDbGetEvents: true,
    cache,
    useCache,
  });

  if (result.found && result.value) {
    const accountValue = decodeAccountValue(result.value);
    collector.record({
      title: 'LOOKUP RESULT',
      log: `Found balance ${accountValue.balance.toString()}`,
      keyNibbles: [],
      consumed: account.keyNibbles.length,
      changedNodeIds: [],
    });
  } else {
    collector.record({
      title: 'LOOKUP RESULT',
      log: `Not found: ${result.mismatchReason ?? 'unknown mismatch'}`,
      keyNibbles: [],
      consumed: 0,
      changedNodeIds: [],
    });
  }

  return {
    steps: collector.all(),
    found: result.found,
    value: result.value,
    mismatchReason: result.mismatchReason,
  };
}

export function simulateUpdate(
  rootRef: Uint8Array,
  db: InMemoryKvStore,
  account: GeneratedAccount,
  newBalance: bigint,
  useCache: boolean,
): UpdateSimulationResult {
  const collector = new StepCollector('update', db, () => rootRef);
  const cache = new Map<string, Uint8Array>();
  const beforeRoot = describeRoot(rootRef).commitmentHex;
  const updatedValue = encodeAccountValue(account.nonce, newBalance);

  collector.record({
    title: 'UPDATE START',
    log: `Update ${shortHex(account.address, 10)} balance ${account.balance.toString()} -> ${newBalance.toString()}`,
    keyNibbles: account.keyNibbles,
    consumed: 0,
    changedNodeIds: [],
  });

  const inserted = insertKeyValue(rootRef, account.keyNibbles, updatedValue, {
    db,
    trace: (event) => collector.fromTrace(event),
    emitDbGetEvents: true,
    cache,
    useCache,
  });
  const nextRootRef = inserted.rootRef;
  const afterRoot = describeRoot(nextRootRef).commitmentHex;

  collector.record({
    title: 'UPDATE RESULT',
    log: `Root changed ${beforeRoot} -> ${afterRoot}. Rewritten nodes: ${inserted.changedNodeIds.length}`,
    keyNibbles: account.keyNibbles,
    consumed: account.keyNibbles.length,
    changedNodeIds: inserted.changedNodeIds,
    rootRef: nextRootRef,
  });

  return {
    steps: collector.all(),
    rootRef: nextRootRef,
    db,
    changedNodeCount: inserted.changedNodeIds.length,
    updatedAccount: {
      ...account,
      balance: newBalance,
      accountRlp: updatedValue,
    },
  };
}
