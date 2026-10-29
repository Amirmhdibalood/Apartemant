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
  // ستون‌های افزوده بعد از ایجاد اولیه (IF NOT EXISTS روی CREATE جدول کافی نیست)
  try {
    database.run('ALTER TABLE building_unit_templates ADD COLUMN phone TEXT');
  } catch {
    /* already exists */
  }
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
  auxMem.clear();
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

/* ─── Auxiliary files (safety backup etc.) — same storage location as the DB, never Preferences ─── */

const AUX_DIR = 'aux';
const auxMem = new Map<string, Uint8Array | string>();

async function auxNative() {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  return { Filesystem, Directory, Encoding };
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const idb = await openFileIdb();
  const tx = idb.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(value, key);
  await idbTxDone(tx);
  idb.close();
}

async function idbGet(key: string): Promise<unknown> {
  const idb = await openFileIdb();
  const tx = idb.transaction(IDB_STORE, 'readonly');
  const v = await idbReq(tx.objectStore(IDB_STORE).get(key));
  idb.close();
  return v;
}

async function idbDel(key: string): Promise<void> {
  const idb = await openFileIdb();
  const tx = idb.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).delete(key);
  await idbTxDone(tx);
  idb.close();
}

const auxBackend = (): 'memory' | 'native' | 'idb' =>
  useMemoryOnly ? 'memory' : Capacitor.isNativePlatform() ? 'native' : typeof indexedDB === 'undefined' ? 'memory' : 'idb';

/** Write a text aux file (UTF-8, no base64). Native: tmp file + rename so a crash never leaves a half file. */
export async function writeAuxText(name: string, text: string): Promise<void> {
  const where = auxBackend();
  if (where === 'memory') { auxMem.set(name, text); return; }
  if (where === 'idb') { await idbPut(`aux:${name}`, text); return; }
  const { Filesystem, Directory, Encoding } = await auxNative();
  const path = `${AUX_DIR}/${name}`;
  await Filesystem.writeFile({ path: `${path}.tmp`, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  await Filesystem.rename({ from: `${path}.tmp`, to: path, directory: Directory.Data, toDirectory: Directory.Data });
}

export async function readAuxText(name: string): Promise<string | null> {
  const where = auxBackend();
  if (where === 'memory') { const v = auxMem.get(name); return typeof v === 'string' ? v : null; }
  try {
    if (where === 'idb') { const v = await idbGet(`aux:${name}`); return typeof v === 'string' ? v : null; }
    const { Filesystem, Directory, Encoding } = await auxNative();
    const { data } = await Filesystem.readFile({ path: `${AUX_DIR}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

/** Write binary aux file (e.g. a SQLite copy). */
export async function writeAuxBytes(name: string, bytes: Uint8Array): Promise<void> {
  const where = auxBackend();
  if (where === 'memory') { auxMem.set(name, new Uint8Array(bytes)); return; }
  if (where === 'idb') { await idbPut(`aux:${name}`, bytes); return; }
  await writeNativeBinaryAtomic(`${AUX_DIR}/${name}`, bytes);
}

export async function readAuxBytes(name: string): Promise<Uint8Array | null> {
  const where = auxBackend();
  if (where === 'memory') { const v = auxMem.get(name); return v instanceof Uint8Array ? new Uint8Array(v) : null; }
  try {
    if (where === 'idb') {
      const v = await idbGet(`aux:${name}`);
      if (v instanceof Uint8Array) return v;
      if ((v as { buffer?: unknown })?.buffer instanceof ArrayBuffer) return new Uint8Array((v as Uint8Array).buffer);
      return null;
    }
    const { Filesystem, Directory } = await auxNative();
    const { data } = await Filesystem.readFile({ path: `${AUX_DIR}/${name}`, directory: Directory.Data });
    return typeof data === 'string' && data.length > 0 ? base64ToUint8(data) : null;
  } catch {
    return null;
  }
}

export async function deleteAux(name: string): Promise<void> {
  const where = auxBackend();
  if (where === 'memory') { auxMem.delete(name); return; }
  try {
    if (where === 'idb') { await idbDel(`aux:${name}`); return; }
    const { Filesystem, Directory } = await auxNative();
    await Filesystem.deleteFile({ path: `${AUX_DIR}/${name}`, directory: Directory.Data });
  } catch { /* already gone */ }
}

/** Write bytes to `path` via `path.tmp` + rename (native). Base64 is written in chunks to avoid one huge string. */
async function writeNativeBinaryAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const { Filesystem, Directory } = await auxNative();
  const tmp = `${path}.tmp`;
  const CHUNK = 3 * 1024 * 1024; // multiple of 3 → each base64 piece is independent (no inner padding)
  if (bytes.length === 0) {
    await Filesystem.writeFile({ path: tmp, data: '', directory: Directory.Data, recursive: true });
  }
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const piece = uint8ToBase64(bytes.subarray(off, Math.min(off + CHUNK, bytes.length)));
    if (off === 0) await Filesystem.writeFile({ path: tmp, data: piece, directory: Directory.Data, recursive: true });
    else await Filesystem.appendFile({ path: tmp, data: piece, directory: Directory.Data });
  }
  const st = await Filesystem.stat({ path: tmp, directory: Directory.Data });
  if (!st || Number(st.size) !== bytes.length) throw new Error('sqlite file write verify failed');
  await Filesystem.rename({ from: tmp, to: path, directory: Directory.Data, toDirectory: Directory.Data });
}

/** Open an independent in-memory DB from SQLite bytes (e.g. the safety copy). Caller must close() it. */
export async function openDetachedDatabase(bytes: Uint8Array): Promise<Database> {
  const sql = await loadSqlJs();
  const d = new sql.Database(bytes);
  applySchema(d);
  return d;
}

/** Full current DB image (for rollback snapshots / safety copies). Waits for pending persists first. */
export async function exportCurrentBytes(): Promise<Uint8Array> {
  const database = await openSqlite();
  await persistChain.catch(() => undefined);
  return database.export();
}

/** Replace the open DB with `bytes` (rollback) and persist it. */
export async function replaceDatabaseWithBytes(bytes: Uint8Array): Promise<void> {
  const sql = await loadSqlJs();
  await persistChain.catch(() => undefined);
  const next = new sql.Database(bytes);
  applySchema(next);
  const prev = db;
  db = next;
  if (prev && prev !== next) { try { prev.close(); } catch { /* ignore */ } }
  await persistSqlite();
}

/** Tests / stress: close the open DB but keep the last persisted bytes (simulates a cold app restart). */
export function closeSqliteKeepBytesForTests(): void {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  db = null;
  openPromise = null;
}
