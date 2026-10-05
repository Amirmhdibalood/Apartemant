/**
 * IndexedDB backend for large tables (bills / units).
 * Chosen over Preferences JSON blobs for quota headroom and over a native SQLite
 * plugin to avoid new Capacitor native deps / Android permissions.
 * Small settings keys stay on Preferences via kvStore.ts.
 */
const DB_NAME = 'apartemant';
const DB_VERSION = 1;

export const IDB_STORES = {
  bills: 'bills',
  units: 'units',
  meta: 'meta',
} as const;

export type MetaKey = 'schemaVersion' | 'migration' | 'prefsCleared';

export interface MigrationMeta {
  /** Preferences → IDB copy completed and verified */
  status: 'pending' | 'done' | 'failed';
  at?: string;
  bills?: number;
  units?: number;
  error?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('idb tx aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('idb tx error'));
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORES.bills)) {
          db.createObjectStore(IDB_STORES.bills, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(IDB_STORES.units)) {
          const us = db.createObjectStore(IDB_STORES.units, { keyPath: 'id' });
          us.createIndex('byBillId', 'billId', { unique: false });
        }
        if (!db.objectStoreNames.contains(IDB_STORES.meta)) {
          db.createObjectStore(IDB_STORES.meta, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('idb open failed'));
    });
  }
  return dbPromise;
}

/** Test helper: close and delete DB, reset singleton. */
export async function resetIdbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch { /* ignore */ }
  }
  dbPromise = null;
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('idb delete failed'));
    req.onblocked = () => resolve();
  });
}

export async function idbGetMeta<T>(key: MetaKey): Promise<T | null> {
  const db = await openDb();
  const tx = db.transaction(IDB_STORES.meta, 'readonly');
  const row = await reqToPromise<{ key: string; value: T } | undefined>(
    tx.objectStore(IDB_STORES.meta).get(key),
  );
  await txDone(tx);
  return row ? row.value : null;
}

export async function idbSetMeta<T>(key: MetaKey, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(IDB_STORES.meta, 'readwrite');
  tx.objectStore(IDB_STORES.meta).put({ key, value });
  await txDone(tx);
}

export async function idbGetAllBills<T>(): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(IDB_STORES.bills, 'readonly');
  const rows = await reqToPromise<T[]>(tx.objectStore(IDB_STORES.bills).getAll());
  await txDone(tx);
  return rows;
}

export async function idbGetAllUnits<T>(): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(IDB_STORES.units, 'readonly');
  const rows = await reqToPromise<T[]>(tx.objectStore(IDB_STORES.units).getAll());
  await txDone(tx);
  return rows;
}

export async function idbReplaceAllTables<B extends { id: string }, U extends { id: string }>(
  bills: B[],
  units: U[],
  schemaVersion: number,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([IDB_STORES.bills, IDB_STORES.units, IDB_STORES.meta], 'readwrite');
  const bs = tx.objectStore(IDB_STORES.bills);
  const us = tx.objectStore(IDB_STORES.units);
  bs.clear();
  us.clear();
  for (const b of bills) bs.put(b);
  for (const u of units) us.put(u);
  tx.objectStore(IDB_STORES.meta).put({ key: 'schemaVersion', value: schemaVersion });
  await txDone(tx);
}

export async function idbCount(store: keyof typeof IDB_STORES): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(IDB_STORES[store], 'readonly');
  const n = await reqToPromise<number>(tx.objectStore(IDB_STORES[store]).count());
  await txDone(tx);
  return n;
}
