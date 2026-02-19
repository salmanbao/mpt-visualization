import { generateAccounts } from './account';
import { bytesToHex, equalBytes } from './bytes';
import { insertKeyValue, lookupKey } from './trie';
import { InMemoryKvStore } from '../store/kv';

function buildRoot(seed: number, count: number): { rootRef: Uint8Array; rootHex: string; store: InMemoryKvStore; accounts: ReturnType<typeof generateAccounts> } {
  const accounts = generateAccounts(seed, count);
  const store = new InMemoryKvStore();
  let rootRef: Uint8Array = new Uint8Array();
  for (const account of accounts) {
    rootRef = insertKeyValue(rootRef, account.keyNibbles, account.accountRlp, { db: store }).rootRef;
  }
  return { rootRef, rootHex: bytesToHex(rootRef), store, accounts };
}

describe('trie insertion and lookup consistency', () => {
  it('finds every inserted generated account', () => {
    const { rootRef, store, accounts } = buildRoot(42, 16);

    for (const account of accounts) {
      const found = lookupKey(rootRef, account.keyNibbles, { db: store });
      expect(found.found).toBe(true);
      expect(found.value).toBeDefined();
      expect(equalBytes(found.value!, account.accountRlp)).toBe(true);
    }
  });

  it('keeps root stable for fixed seed and N', () => {
    const first = buildRoot(1, 8).rootHex;
    const second = buildRoot(1, 8).rootHex;
    expect(first).toEqual(second);
  });
});
