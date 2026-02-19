import type { DbEntry } from './kv';

const DB_NAME = 'mpt-educator';
const STORE_NAME = 'nodes';
const VERSION = 1;

export function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'keyHex' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function persistEntriesToIndexedDb(entries: DbEntry[]): Promise<void> {
  if (!indexedDbAvailable()) {
    return;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  for (const entry of entries) {
    store.put(entry);
  }
  await transactionComplete(tx);
  db.close();
}

export async function loadEntriesFromIndexedDb(): Promise<DbEntry[]> {
  if (!indexedDbAvailable()) {
    return [];
  }
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  const result = await new Promise<DbEntry[]>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as DbEntry[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  });
  await transactionComplete(tx);
  db.close();
  return result.sort((a, b) => a.insertedAt - b.insertedAt);
}

export async function clearIndexedDb(): Promise<void> {
  if (!indexedDbAvailable()) {
    return;
  }
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  await transactionComplete(tx);
  db.close();
}
