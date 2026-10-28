/**
 * Independent SQLite database (sql.js) for domain data.
 * - Vitest / Node: pure JS asm build, in-memory + optional byte snapshot.
 * - Capacitor Android: same engine; DB file persisted under Filesystem Directory.Data.
 * - Web preview: opaque blob in IndexedDB (file bytes only — not domain tables).
 *
 * Why sql.js instead of @capacitor-community/sqlite: Cap 8 + Vitest (node) without
 * jeep-sqlite DOM; still a real SQLite file/.db on device.
 */
import type { Database, SqlJsStatic } from 'sql.js';
import { Capacitor } from '@capacitor/core';
import { SCHEMA_SQL, SQLITE_SCHEMA_VERSION } from './schema';

const DB_FILE = 'apartemant.db';
const IDB_NAME = 'apartemant-sqlite-file';
const IDB_STORE = 'files';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let openPromise: Promise<Database> | null = null;
let persistChain: Promise<void> = Promise.resolve();
/** Test / in-memory snapshot of last exported bytes */
let memoryBytes: Uint8Array | null = null;
let useMemoryOnly = false;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  // Prefer wasm-inline (single file); fall back to asm.js for older runtimes.
  const mod = await import('sql.js/dist/sql-wasm-inline.js');
  const init = (mod as { default: (cfg?: object) => Promise<SqlJsStatic> }).default;
  SQL = await init();
  return SQL;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const g = globalThis as unknown as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } }; btoa?: (s: string) => string };
  if (g.Buffer) return g.Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return g.btoa!(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const g = globalThis as unknown as { Buffer?: { from(data: string, enc: string): Uint8Array }; atob?: (s: string) => string };
  if (g.Buffer) return new Uint8Array(g.Buffer.from(b64, 'base64'));
  const binary = g.atob!(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function readPersistedBytes(): Promise<Uint8Array | null> {
  if (useMemoryOnly) return memoryBytes ? new Uint8Array(memoryBytes) : null;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { data } = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
      if (typeof data === 'string' && data.length > 0) return base64ToUint8(data);
    } catch {
      return null;
    }
    return null;
  }

  // Web: opaque SQLite file blob in a tiny IDB (not domain tables).
  if (typeof indexedDB === 'undefined') return memoryBytes ? new Uint8Array(memoryBytes) : null;
  try {
    const idb = await openFileIdb();
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(DB_FILE);
    const row = await idbReq(req);
    idb.close();
    if (row instanceof Uint8Array) return row;
    if (row?.buffer instanceof ArrayBuffer) return new Uint8Array(row.buffer);
    return null;
  } catch {
    return memoryBytes ? new Uint8Array(memoryBytes) : null;
  }
}

async function writePersistedBytes(bytes: Uint8Array): Promise<void> {
  memoryBytes = new Uint8Array(bytes);
  if (useMemoryOnly) return;

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path: DB_FILE,
      data: uint8ToBase64(bytes),
      directory: Directory.Data,
    });
    return;
  }

  if (typeof indexedDB === 'undefined') return;
  const idb = await openFileIdb();
  const tx = idb.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(bytes, DB_FILE);
  await idbTxDone(tx);
  idb.close();
}

function openFileIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('sqlite file idb open failed'));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb req failed'));
  });
}

function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('idb tx abort'));
    tx.onerror = () => reject(tx.error ?? new Error('idb tx error'));
  });
}

function applySchema(database: Database): void {
  database.run(SCHEMA_SQL);
  const ver = getMeta(database, 'schemaVersion');
  if (ver !== String(SQLITE_SCHEMA_VERSION)) {
    setMeta(database, 'schemaVersion', String(SQLITE_SCHEMA_VERSION));
  }
}

export function getMeta(database: Database, key: string): string | null {
  const stmt = database.prepare('SELECT value FROM app_meta WHERE key = ?');
  stmt.bind([key]);
  let value: string | null = null;
  if (stmt.step()) value = String(stmt.getAsObject().value);
  stmt.free();
  return value;
}

export function setMeta(database: Database, key: string, value: string): void {
  database.run('INSERT OR REPLACE INTO app_meta(key, value) VALUES (?, ?)', [key, value]);
}

export async function openSqlite(): Promise<Database> {
  if (db) return db;
  if (openPromise) return openPromise;
  openPromise = (async () => {
    const sql = await loadSqlJs();
    const bytes = await readPersistedBytes();
    const database = bytes && bytes.length > 0 ? new sql.Database(bytes) : new sql.Database();
    applySchema(database);
    db = database;
    return database;
  })();
  try {
    return await openPromise;
  } finally {
    openPromise = null;
  }
}

/** Persist current DB image. Serialized so concurrent writes don't clobber. */
export function persistSqlite(): Promise<void> {
  persistChain = persistChain.catch(() => undefined).then(async () => {
    if (!db) return;
    const bytes = db.export();
    await writePersistedBytes(bytes);
  });
  return persistChain;
}

export async function withSqlite<T>(fn: (database: Database) => T | Promise<T>): Promise<T> {
  const database = await openSqlite();
  const result = await fn(database);
  return result;
}

export async function withSqliteWrite<T>(fn: (database: Database) => T | Promise<T>): Promise<T> {
  const database = await openSqlite();
  // Avoid explicit BEGIN/COMMIT: overlapping writers + sql.js made migration meta disappear.
  // Each statement auto-commits; we persist the full DB image after the write batch.
  try {
    const result = await fn(database);
    await persistSqlite();
    return result;
  } catch (e) {
    throw e;
  }
}

/** Tests: force memory-only persistence and wipe DB. */
export async function resetSqliteForTests(): Promise<void> {
  useMemoryOnly = true;
  memoryBytes = null;
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  db = null;
  openPromise = null;
  persistChain = Promise.resolve();
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(IDB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
}

/** Allow production persist mode again (after tests). */
export function setSqliteMemoryOnly(on: boolean): void {
  useMemoryOnly = on;
}

export function getSqliteExportBytes(): Uint8Array | null {
  if (!db) return memoryBytes ? new Uint8Array(memoryBytes) : null;
  return db.export();
}
