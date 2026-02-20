import { decodeAccountValue, generateAccounts } from './account';
import { bytesToHex, equalBytes, hexToBytes } from './bytes';
import { EMPTY_CODE_HASH, EMPTY_TRIE_ROOT, keccak } from './crypto';
import { decodeTrieNode } from './nodeCodec';
import { describeRoot, insertKeyValue, lookupKey } from './trie';
import { simulateBuild, simulateLookup, simulateUpdate } from './simulator';
import { InMemoryKvStore } from '../store/kv';

function build(seed: number, count: number) {
  const accounts = generateAccounts(seed, count);
  const db = new InMemoryKvStore();
  let rootRef: Uint8Array = new Uint8Array();
  for (const account of accounts) {
    rootRef = insertKeyValue(rootRef, account.keyNibbles, account.accountRlp, { db }).rootRef;
  }
  return { accounts, db, rootRef };
}

describe('procedure audit', () => {
  it('seed=1,N=8 root commitment is deterministic across full build simulation', () => {
    const a = simulateBuild(generateAccounts(1, 8));
    const b = simulateBuild(generateAccounts(1, 8));
    expect(bytesToHex(a.rootRef)).toEqual(bytesToHex(b.rootRef));
    expect(describeRoot(a.rootRef).commitmentHex).toEqual(describeRoot(b.rootRef).commitmentHex);
  });

  it('generated account value uses canonical empty storageRoot and empty codeHash constants', () => {
    const account = generateAccounts(7, 1)[0];
    const decoded = decodeAccountValue(account.accountRlp);
    expect(decoded.storageRootHex).toEqual(bytesToHex(EMPTY_TRIE_ROOT));
    expect(decoded.codeHashHex).toEqual(bytesToHex(EMPTY_CODE_HASH));
  });

  it('build persistence stores only hashed nodes in DB (embedded refs are not DB writes)', () => {
    const result = simulateBuild(generateAccounts(1, 8));
    const putSteps = result.steps.filter((s) => s.dbAction === 'PUT');
    expect(putSteps.length).toBeGreaterThan(0);

    for (const step of putSteps) {
      expect(step.highlightedDbKey).toBeDefined();
      expect(step.activeNode?.rlpSize ?? 0).toBeGreaterThanOrEqual(32);
      expect(step.activeNode?.refKind).toBe('hash-ref');
    }

    const finalizeEmbedded = result.steps.filter((s) => /embedded/i.test(s.log));
    for (const step of finalizeEmbedded) {
      expect(step.dbAction).not.toBe('PUT');
    }

    for (const entry of result.db.entries()) {
      const rlp = hexToBytes(entry.valueHex);
      const hash = bytesToHex(keccak(rlp));
      expect(hash).toEqual(entry.keyHex);
      const node = decodeTrieNode(rlp);
      expect(node).toBeDefined();
    }
  });

  it('lookup traversal performs DB GET on hash references and returns exact account value', () => {
    const { accounts, db, rootRef } = build(4, 16);
    const target = accounts[5];
    const simulation = simulateLookup(rootRef, db.clone(), target, false);
    const getSteps = simulation.steps.filter((s) => s.dbAction === 'GET');
    expect(getSteps.length).toBeGreaterThan(0);
    for (const step of getSteps) {
      expect(step.highlightedDbKey).toBeDefined();
      expect(db.get(step.highlightedDbKey!)).toBeDefined();
    }
    expect(simulation.found).toBe(true);
    expect(simulation.value).toBeDefined();
    expect(equalBytes(simulation.value!, target.accountRlp)).toBe(true);
  });

  it('updating one account rewrites path nodes, preserves prior DB entries, and keeps other accounts intact', () => {
    const { accounts, db, rootRef } = build(11, 16);
    const oldEntries = db.entries();
    const oldKeys = new Set(oldEntries.map((e) => e.keyHex));

    const target = accounts[3];
    const newBalance = target.balance + 12345n;
    const updated = simulateUpdate(rootRef, db.clone(), target, newBalance, true);

    expect(describeRoot(updated.rootRef).commitmentHex).not.toEqual(describeRoot(rootRef).commitmentHex);
    expect(updated.changedNodeCount).toBeGreaterThan(0);

    const newEntries = updated.db.entries();
    const newKeys = new Set(newEntries.map((e) => e.keyHex));
    for (const key of oldKeys) {
      expect(newKeys.has(key)).toBe(true);
    }

    const added = [...newKeys].filter((k) => !oldKeys.has(k)).length;
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(oldEntries.length);

    const updatedLookup = lookupKey(updated.rootRef, target.keyNibbles, { db: updated.db });
    expect(updatedLookup.found).toBe(true);
    expect(updatedLookup.value).toBeDefined();
    const decodedUpdated = decodeAccountValue(updatedLookup.value!);
    expect(decodedUpdated.balance).toEqual(newBalance);

    const other = accounts[8];
    const otherLookup = lookupKey(updated.rootRef, other.keyNibbles, { db: updated.db });
    expect(otherLookup.found).toBe(true);
    expect(otherLookup.value).toBeDefined();
    expect(equalBytes(otherLookup.value!, other.accountRlp)).toBe(true);
  });
});
