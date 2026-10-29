/**
 * Independent SQLite database (sql.js) for domain data.
 * - Vitest / Node: pure JS build, in-memory backend (snapshot + journal kept in memory).
 * - Capacitor Android: same engine; files under Filesystem Directory.Data.
 * - Web preview: snapshot + journal in a tiny IndexedDB (file bytes only — not domain tables).
 *
 * Persistence (from 1.8.x, see perf/README.md):
 *   apartemant.db          full SQLite image ("snapshot"), base64 on native (Capacitor has no binary write)
 *   apartemant.db.journal  append-only UTF-8 journal of row images changed since that snapshot
 * Every write appends only the rows it touched (tracked with sqlite3_update_hook), so saving a bill costs
 * O(rows changed) instead of exporting + base64-writing the whole DB. The journal is folded into a new snapshot
 * ("checkpoint") when it grows past a threshold, after bulk wipes (restore), or after schema changes.
 * Snapshots are written to `apartemant.db.tmp` in 3 MB base64 chunks, size-verified, then renamed over the
 * old file — the previous snapshot stays intact until the new one is verified. Each snapshot carries a
 * generation number (app_meta.persistGen); journal lines from another generation are ignored, so a crash at
 * any point leaves either the old snapshot + its journal or the new snapshot.
 *
 * Why sql.js instead of @capacitor-community/sqlite: Cap 8 + Vitest (node) without jeep-sqlite DOM, and no risky
 * one-time migration of existing user DBs; the file stays a real SQLite .db that the old code path can read.
 */
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { Capacitor } from '@capacitor/core';
import { SCHEMA_SQL, SQLITE_SCHEMA_VERSION } from './schema';

const DB_FILE = 'apartemant.db';
const JOURNAL_FILE = 'apartemant.db.journal';
const IDB_NAME = 'apartemant-sqlite-file';
const IDB_STORE = 'files';
const GEN_KEY = 'persistGen';

/** Fold the journal into a new snapshot once it is bigger than this (bytes of JSON). */
export const JOURNAL_CHECKPOINT_BYTES = 4 * 1024 * 1024;
/** A single flush touching more rows than this writes a snapshot instead (bulk imports). */
export const DIRTY_CHECKPOINT_ROWS = 20_000;
/** Base64 chunk for native writes (multiple of 3 → chunks are independent base64). */
const NATIVE_CHUNK = 3 * 1024 * 1024;

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let openPromise: Promise<Database> | null = null;
let persistChain: Promise<void> = Promise.resolve();
let queuedPersist: Promise<void> | null = null;
let useMemoryOnly = false;

/* ─── change tracking ─── */
let gen = 0;
let dirty = new Map<string, Set<number>>();
let dirtyCount = 0;
let trackingPaused = 0;
let needCheckpoint = false;
let journalBytes = 0;

export interface PersistStats {
  journalAppends: number;
  checkpoints: number;
  lastJournalBytes: number;
  lastSnapshotBytes: number;
  replayedOps: number;
}
const stats: PersistStats = { journalAppends: 0, checkpoints: 0, lastJournalBytes: 0, lastSnapshotBytes: 0, replayedOps: 0 };
export function getPersistStats(): PersistStats { return { ...stats }; }

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  const mod = await import('sql.js/dist/sql-wasm-inline.js');
  const init = (mod as { default: (cfg?: object) => Promise<SqlJsStatic> }).default;
  SQL = await init();
  return SQL;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const g = globalThis as unknown as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } }; btoa?: (s: string) => string };
  if (g.Buffer) return g.Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return g.btoa!(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const g = globalThis as unknown as { Buffer?: { from(data: string, enc: string): Uint8Array }; atob?: (s: string) => string };
  if (g.Buffer) return new Uint8Array(g.Buffer.from(b64, 'base64'));
  const binary = g.atob!(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const SQLITE_MAGIC = 'SQLite format 3\u0000';
function looksLikeSqlite(b: Uint8Array | null): b is Uint8Array {
  if (!b || b.length < 100) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) if (b[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  return true;
}

/* ─── storage backends ─── */

export interface StoreBackend {
  /** Candidate snapshots, best first (native: main file, then a verified-but-not-renamed tmp). */
  readSnapshots(): Promise<Uint8Array[]>;
  /** Atomic: the previous snapshot must survive any failure. */
  writeSnapshot(bytes: Uint8Array): Promise<void>;
  readJournal(): Promise<string>;
  appendJournal(text: string): Promise<void>;
  resetJournal(): Promise<void>;
  /** Keep an unreadable DB file aside (never overwrite it) before a fresh DB gets saved. */
  quarantine?(): Promise<void>;
  /** Named side files (safety copy etc.). */
  writeAux(name: string, data: Uint8Array | string): Promise<void>;
  readAux(name: string, kind: 'bytes' | 'text'): Promise<Uint8Array | string | null>;
  deleteAux(name: string): Promise<void>;
}

/** In-memory backend (tests / no storage). Fault injection for crash-safety tests. */
export const memoryFaults = { failAppend: 0, failSnapshot: 0, failJournalReset: 0, tornAppend: false };
const mem = { snapshot: null as Uint8Array | null, journal: '', aux: new Map<string, Uint8Array | string>() };

const memoryBackend: StoreBackend = {
  async readSnapshots() { return mem.snapshot ? [new Uint8Array(mem.snapshot)] : []; },
  async writeSnapshot(bytes) {
    if (memoryFaults.failSnapshot > 0) { memoryFaults.failSnapshot--; throw new Error('injected snapshot failure'); }
    mem.snapshot = new Uint8Array(bytes);
  },
  async readJournal() { return mem.journal; },
  async appendJournal(text) {
    if (memoryFaults.failAppend > 0) {
      memoryFaults.failAppend--;
      if (memoryFaults.tornAppend) mem.journal += text.slice(0, Math.max(1, text.length >> 1));
      throw new Error('injected journal failure');
    }
    mem.journal += text;
  },
  async resetJournal() {
    if (memoryFaults.failJournalReset > 0) { memoryFaults.failJournalReset--; throw new Error('injected reset failure'); }
    mem.journal = '';
  },
  async writeAux(name, data) { mem.aux.set(name, typeof data === 'string' ? data : new Uint8Array(data)); },
  async readAux(name, kind) {
    const v = mem.aux.get(name);
    if (v == null) return null;
    if (kind === 'text') return typeof v === 'string' ? v : null;
    return v instanceof Uint8Array ? new Uint8Array(v) : null;
  },
  async deleteAux(name) { mem.aux.delete(name); },
};

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

async function idbGet(key: string): Promise<unknown> {
  const idb = await openFileIdb();
  try {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    return await idbReq(tx.objectStore(IDB_STORE).get(key));
  } finally { idb.close(); }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const idb = await openFileIdb();
  try {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    await idbTxDone(tx);
  } finally { idb.close(); }
}

async function idbDel(key: string): Promise<void> {
  const idb = await openFileIdb();
  try {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    await idbTxDone(tx);
  } finally { idb.close(); }
}

function asBytes(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v;
  if ((v as { buffer?: unknown })?.buffer instanceof ArrayBuffer) return new Uint8Array((v as Uint8Array).buffer);
  return null;
}

const idbBackend: StoreBackend = {
  async readSnapshots() {
    const b = asBytes(await idbGet(DB_FILE).catch(() => null));
    return b ? [b] : [];
  },
  async writeSnapshot(bytes) { await idbPut(DB_FILE, bytes); }, // single IDB put is atomic
  async readJournal() { const v = await idbGet(JOURNAL_FILE).catch(() => null); return typeof v === 'string' ? v : ''; },
  async appendJournal(text) {
    const idb = await openFileIdb();
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const cur = await idbReq(store.get(JOURNAL_FILE));
      store.put((typeof cur === 'string' ? cur : '') + text, JOURNAL_FILE);
      await idbTxDone(tx);
    } finally { idb.close(); }
  },
  async resetJournal() { await idbPut(JOURNAL_FILE, ''); },
  async writeAux(name, data) { await idbPut(`aux:${name}`, data); },
  async readAux(name, kind) {
    const v = await idbGet(`aux:${name}`).catch(() => null);
    if (kind === 'text') return typeof v === 'string' ? v : null;
    return asBytes(v);
  },
  async deleteAux(name) { await idbDel(`aux:${name}`).catch(() => undefined); },
};

async function fs() {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  return { Filesystem, Directory, Encoding };
}

async function nativeReadBytes(path: string): Promise<Uint8Array | null> {
  const { Filesystem, Directory } = await fs();
  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    return typeof data === 'string' && data.length > 0 ? base64ToUint8(data) : null;
  } catch {
    return null;
  }
}

/** Write `bytes` to `path.tmp` in base64 chunks, verify size, then rename over `path`. Old file survives failures. */
async function nativeWriteBytesAtomic(path: string, bytes: Uint8Array): Promise<void> {
  const { Filesystem, Directory } = await fs();
  const tmp = `${path}.tmp`;
  if (bytes.length === 0) await Filesystem.writeFile({ path: tmp, data: '', directory: Directory.Data, recursive: true });
  for (let off = 0; off < bytes.length; off += NATIVE_CHUNK) {
    const piece = uint8ToBase64(bytes.subarray(off, Math.min(off + NATIVE_CHUNK, bytes.length)));
    if (off === 0) await Filesystem.writeFile({ path: tmp, data: piece, directory: Directory.Data, recursive: true });
    else await Filesystem.appendFile({ path: tmp, data: piece, directory: Directory.Data });
  }
  const st = await Filesystem.stat({ path: tmp, directory: Directory.Data });
  if (!st || Number(st.size) !== bytes.length) throw new Error('sqlite file write verify failed');
  // Capacitor rename = delete target + File.renameTo; if we die in between, readSnapshots() falls back to tmp.
  await Filesystem.rename({ from: tmp, to: path, directory: Directory.Data, toDirectory: Directory.Data });
}

const nativeBackend: StoreBackend = {
  async readSnapshots() {
    const out: Uint8Array[] = [];
    const main = await nativeReadBytes(DB_FILE);
    if (looksLikeSqlite(main)) out.push(main);
    const tmp = await nativeReadBytes(`${DB_FILE}.tmp`);
    // tmp is only renamed after its size was verified; used if main is missing/corrupt
    if (looksLikeSqlite(tmp)) out.push(tmp);
    return out;
  },
  async writeSnapshot(bytes) { await nativeWriteBytesAtomic(DB_FILE, bytes); },
  async quarantine() {
    const { Filesystem, Directory } = await fs();
    try {
      await Filesystem.stat({ path: DB_FILE, directory: Directory.Data });
    } catch {
      return; // nothing on disk (fresh install)
    }
    await Filesystem.rename({ from: DB_FILE, to: `${DB_FILE}.corrupt-${Date.now()}`, directory: Directory.Data, toDirectory: Directory.Data });
  },
  async readJournal() {
    const { Filesystem, Directory, Encoding } = await fs();
    try {
      const { data } = await Filesystem.readFile({ path: JOURNAL_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : '';
    } catch {
      return '';
    }
  },
  async appendJournal(text) {
    const { Filesystem, Directory, Encoding } = await fs();
    try {
      await Filesystem.appendFile({ path: JOURNAL_FILE, data: text, directory: Directory.Data, encoding: Encoding.UTF8 });
    } catch {
      // file may not exist yet on some platforms
      const cur = await this.readJournal();
      await Filesystem.writeFile({ path: JOURNAL_FILE, data: cur + text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    }
  },
  async resetJournal() {
    const { Filesystem, Directory, Encoding } = await fs();
    await Filesystem.writeFile({ path: JOURNAL_FILE, data: '', directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  },
  async writeAux(name, data) {
    const path = `aux/${name}`;
    if (typeof data !== 'string') { await nativeWriteBytesAtomic(path, data); return; }
    const { Filesystem, Directory, Encoding } = await fs();
    await Filesystem.writeFile({ path: `${path}.tmp`, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    await Filesystem.rename({ from: `${path}.tmp`, to: path, directory: Directory.Data, toDirectory: Directory.Data });
  },
  async readAux(name, kind) {
    const path = `aux/${name}`;
    if (kind === 'bytes') return nativeReadBytes(path);
    const { Filesystem, Directory, Encoding } = await fs();
    try {
      const { data } = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : null;
    } catch {
      return null;
    }
  },
  async deleteAux(name) {
    const { Filesystem, Directory } = await fs();
    try { await Filesystem.deleteFile({ path: `aux/${name}`, directory: Directory.Data }); } catch { /* gone */ }
  },
};

let backendOverride: StoreBackend | null = null;
/** Tests: run the real persistence logic against a custom backend (e.g. a simulated native filesystem). */
export function setStoreBackendForTests(b: StoreBackend | null): void { backendOverride = b; }

function backend(): StoreBackend {
  if (backendOverride) return backendOverride;
  if (useMemoryOnly) return memoryBackend;
  if (Capacitor.isNativePlatform()) return nativeBackend;
  if (typeof indexedDB === 'undefined') return memoryBackend;
  return idbBackend;
}

/* ─── schema / meta ─── */

function schemaFingerprint(database: Database): string {
  const r = database.exec("SELECT group_concat(sql, ';') FROM (SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name)");
  return String(r[0]?.values[0]?.[0] ?? '');
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

function untracked<T>(fn: () => T): T {
  trackingPaused++;
  try { return fn(); } finally { trackingPaused--; }
}

/** persistGen lives in app_meta, updated in place (stable rowid) and never journaled. */
function writeGen(database: Database, value: number): void {
  untracked(() => {
    database.run('INSERT OR IGNORE INTO app_meta(key, value) VALUES (?, ?)', [GEN_KEY, String(value)]);
    database.run('UPDATE app_meta SET value = ? WHERE key = ?', [String(value), GEN_KEY]);
  });
}

function attachTracking(database: Database): void {
  database.updateHook((_op, _dbName, table, rowid) => {
    // a pending snapshot captures everything anyway → don't spend memory tracking rows
    if (trackingPaused > 0 || needCheckpoint) return;
    let set = dirty.get(table);
    if (!set) { set = new Set(); dirty.set(table, set); }
    const before = set.size;
    set.add(rowid);
    if (set.size !== before && ++dirtyCount > DIRTY_CHECKPOINT_ROWS) {
      needCheckpoint = true; // bulk change: snapshot is cheaper than journaling every row
      dirty = new Map();
      dirtyCount = 0;
    }
  });
}

/** Mark that the next persist must write a full snapshot (bulk wipes, schema changes, restore). */
export function requestCheckpoint(): void {
  needCheckpoint = true;
}

/* ─── journal encode / replay ─── */

/** Quote a table/column identifier after validating it (identifiers can't be bound as `?` parameters). */
export function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`invalid sql identifier: ${name}`);
  return `"${name}"`;
}
const identList = (names: string[]) => names.map(ident).join(', ');
const qmarks = (n: number) => Array.from({ length: n }, () => '?').join(', ');

interface JournalTable { t: string; c: string[]; u: SqlValue[][]; d: number[] }
interface JournalLine { g: number; o: JournalTable[] }

/** Current images of the dirty rows: existing row → upsert (rowid + all columns), missing row → delete. */
function collectRowImages(database: Database, taken: Map<string, Set<number>>): JournalTable[] | null {
  const out: JournalTable[] = [];
  for (const [table, ids] of taken) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) return null;
    const stmt = database.prepare(`SELECT rowid AS __rowid__, * FROM ${ident(table)} WHERE rowid = ?`);
    const entry: JournalTable = { t: table, c: [], u: [], d: [] };
    try {
      for (const id of ids) {
        stmt.bind([id]);
        if (stmt.step()) {
          if (entry.c.length === 0) entry.c = stmt.getColumnNames().slice(1);
          const vals = stmt.get();
          if (table === 'app_meta' && vals[1] === GEN_KEY) { stmt.reset(); continue; }
          for (const v of vals) if (v instanceof Uint8Array) return null; // blobs → snapshot instead
          entry.u.push(vals);
        } else {
          entry.d.push(id);
        }
        stmt.reset();
      }
    } finally {
      stmt.free();
    }
    if (entry.u.length || entry.d.length) out.push(entry);
  }
  return out;
}

function tableColumns(database: Database): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const r = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const row of r[0]?.values ?? []) {
    const t = String(row[0]);
    if (!/^[a-z_][a-z0-9_]*$/i.test(t)) continue;
    const cols = database.exec(`PRAGMA table_info(${ident(t)})`)[0]?.values.map((v) => String(v[1])) ?? [];
    m.set(t, new Set(cols));
  }
  return m;
}

/** Apply journal lines of generation `g` to `database`. Unparsable (torn) lines are skipped. Returns ops applied. */
export function replayJournal(database: Database, text: string, g: number): number {
  if (!text) return 0;
  const known = tableColumns(database);
  let applied = 0;
  database.run('PRAGMA foreign_keys = OFF');
  try {
    untracked(() => {
      database.run('SAVEPOINT apt_replay');
      try {
        for (const raw of text.split('\n')) {
          if (!raw) continue;
          let line: JournalLine;
          try { line = JSON.parse(raw) as JournalLine; } catch { continue; }
          if (!line || line.g !== g || !Array.isArray(line.o)) continue;
          for (const e of line.o) {
            const cols = known.get(e.t);
            if (!cols || !Array.isArray(e.c) || !e.c.every((c) => cols.has(c))) continue;
            if (e.u.length) {
              const st = database.prepare(`INSERT OR REPLACE INTO ${ident(e.t)}(rowid, ${identList(e.c)}) VALUES (${qmarks(e.c.length + 1)})`);
              try { for (const row of e.u) { st.run(row); applied++; } } finally { st.free(); }
            }
            if (e.d.length) {
              const st = database.prepare(`DELETE FROM ${ident(e.t)} WHERE rowid = ?`);
              try { for (const id of e.d) { st.run([id]); applied++; } } finally { st.free(); }
            }
          }
        }
        database.run('RELEASE apt_replay');
      } catch (err) {
        try { database.run('ROLLBACK TO apt_replay'); database.run('RELEASE apt_replay'); } catch { /* ignore */ }
        throw err;
      }
    });
  } finally {
    database.run('PRAGMA foreign_keys = ON');
  }
  return applied;
}

/* ─── open / persist ─── */

function mergeBack(taken: Map<string, Set<number>>): void {
  for (const [t, ids] of taken) {
    let set = dirty.get(t);
    if (!set) { set = new Set(); dirty.set(t, set); }
    for (const id of ids) if (!set.has(id)) { set.add(id); dirtyCount++; }
  }
}

function openFromCandidates(sql: SqlJsStatic, candidates: Uint8Array[]): { database: Database; fromSnapshot: boolean } {
  for (const bytes of candidates) {
    try {
      const d = new sql.Database(bytes);
      d.exec('SELECT count(*) FROM sqlite_master');
      return { database: d, fromSnapshot: true };
    } catch { /* corrupt candidate → try next */ }
  }
  return { database: new sql.Database(), fromSnapshot: false };
}

export async function openSqlite(): Promise<Database> {
  if (db) return db;
  if (openPromise) return openPromise;
  openPromise = (async () => {
    const sql = await loadSqlJs();
    const be = backend();
    const { database, fromSnapshot } = openFromCandidates(sql, await be.readSnapshots());
    if (!fromSnapshot) await be.quarantine?.().catch(() => undefined);
    const g = fromSnapshot ? Number(getMetaSafe(database, GEN_KEY) ?? 0) || 0 : 0;
    const before = fromSnapshot ? schemaFingerprint(database) : '';
    applySchema(database);
    const schemaChanged = schemaFingerprint(database) !== before;
    const journal = fromSnapshot ? await be.readJournal() : '';
    stats.replayedOps = replayJournal(database, journal, g);
    gen = g;
    writeGen(database, gen);
    dirty = new Map();
    dirtyCount = 0;
    journalBytes = journal.length;
    // brand-new DB, migrated schema or a long journal → next persist writes a fresh snapshot
    needCheckpoint = !fromSnapshot || schemaChanged || journal.length > JOURNAL_CHECKPOINT_BYTES / 4;
    attachTracking(database);
    db = database;
    return database;
  })();
  try {
    return await openPromise;
  } finally {
    openPromise = null;
  }
}

function getMetaSafe(database: Database, key: string): string | null {
  try { return getMeta(database, key); } catch { return null; }
}

async function checkpoint(database: Database): Promise<void> {
  const taken = dirty;
  dirty = new Map();
  dirtyCount = 0;
  const wasNeeded = needCheckpoint;
  needCheckpoint = false;
  const next = gen + 1;
  let bytes: Uint8Array | null;
  // the snapshot carries generation `next`; the live DB keeps `gen` until the snapshot is safely on disk
  writeGen(database, next);
  try { bytes = database.export(); } finally { writeGen(database, gen); }
  try {
    await backend().writeSnapshot(bytes);
    stats.lastSnapshotBytes = bytes.length;
    bytes = null;
  } catch (e) {
    // The disk state is unknown now (e.g. old file deleted but tmp not renamed yet). Never journal against it:
    // keep retrying full snapshots until one succeeds. Until then saves report the error.
    void wasNeeded;
    mergeBack(taken);
    needCheckpoint = true;
    throw e;
  }
  gen = next;
  writeGen(database, gen);
  journalBytes = 0;
  stats.checkpoints++;
  // stale journal lines carry the old generation and are ignored on the next open
  await backend().resetJournal().catch(() => undefined);
}

async function persistOnce(): Promise<void> {
  const database = db;
  if (!database) return;
  if (needCheckpoint || dirtyCount > DIRTY_CHECKPOINT_ROWS || journalBytes > JOURNAL_CHECKPOINT_BYTES) {
    await checkpoint(database);
    return;
  }
  if (dirtyCount === 0) return;
  const taken = dirty;
  dirty = new Map();
  dirtyCount = 0;
  const ops = collectRowImages(database, taken);
  if (ops === null) { mergeBack(taken); await checkpoint(database); return; }
  if (ops.length === 0) return;
  // leading newline: if a previous append was torn mid-line, this record still starts on its own line
  const line = '\n' + JSON.stringify({ g: gen, o: ops } satisfies JournalLine) + '\n';
  try {
    await backend().appendJournal(line);
  } catch (e) {
    mergeBack(taken);
    throw e;
  }
  journalBytes += line.length;
  stats.journalAppends++;
  stats.lastJournalBytes = line.length;
}

/**
 * Persist pending changes. Calls made while a persist is queued (not yet started) share it, so a burst of
 * writes costs one journal append. Serialized so concurrent writes never interleave on disk.
 */
export function persistSqlite(): Promise<void> {
  if (queuedPersist) return queuedPersist;
  const p = persistChain.catch(() => undefined).then(() => {
    queuedPersist = null;
    return persistOnce();
  });
  queuedPersist = p;
  persistChain = p;
  return p;
}

/** Force a full snapshot now (e.g. before copying the DB file, or from tests). */
export function checkpointSqlite(): Promise<void> {
  requestCheckpoint();
  return persistSqlite();
}

export async function withSqlite<T>(fn: (database: Database) => T | Promise<T>): Promise<T> {
  const database = await openSqlite();
  return fn(database);
}

export async function withSqliteWrite<T>(fn: (database: Database) => T | Promise<T>): Promise<T> {
  const database = await openSqlite();
  // Each statement auto-commits unless fn uses inTransaction(); we persist the touched rows after the batch.
  // Persist runs even if fn throws (rows changed before the throw must not be lost on disk).
  let result: T;
  try {
    result = await fn(database);
  } catch (e) {
    await persistSqlite().catch(() => undefined);
    throw e;
  }
  await persistSqlite();
  return result;
}

/* ─── Auxiliary files (safety backup etc.) — same storage location as the DB, never Preferences ─── */

export async function writeAuxText(name: string, text: string): Promise<void> { await backend().writeAux(name, text); }
export async function readAuxText(name: string): Promise<string | null> {
  try { const v = await backend().readAux(name, 'text'); return typeof v === 'string' ? v : null; } catch { return null; }
}
export async function writeAuxBytes(name: string, bytes: Uint8Array): Promise<void> { await backend().writeAux(name, bytes); }
export async function readAuxBytes(name: string): Promise<Uint8Array | null> {
  try { const v = await backend().readAux(name, 'bytes'); return v instanceof Uint8Array ? v : null; } catch { return null; }
}
export async function deleteAux(name: string): Promise<void> { await backend().deleteAux(name); }

/** Open an independent in-memory DB from SQLite bytes (e.g. the safety copy). Caller must close() it. */
export async function openDetachedDatabase(bytes: Uint8Array): Promise<Database> {
  const sql = await loadSqlJs();
  const d = new sql.Database(bytes);
  applySchema(d);
  return d;
}

/** Full current DB image (rollback snapshots / safety copies). Waits for pending persists first. */
export async function exportCurrentBytes(): Promise<Uint8Array> {
  const database = await openSqlite();
  await persistChain.catch(() => undefined);
  return untracked(() => database.export());
}

/** Replace the open DB with `bytes` (rollback) and persist it as a new snapshot. */
export async function replaceDatabaseWithBytes(bytes: Uint8Array): Promise<void> {
  const sql = await loadSqlJs();
  await persistChain.catch(() => undefined);
  const next = new sql.Database(bytes);
  applySchema(next);
  writeGen(next, gen);
  const prev = db;
  db = next;
  attachTracking(next);
  dirty = new Map();
  dirtyCount = 0;
  if (prev && prev !== next) { try { prev.close(); } catch { /* ignore */ } }
  await checkpointSqlite();
}

/* ─── tests ─── */

/** Tests: force memory-only persistence and wipe DB + stored files. */
export async function resetSqliteForTests(): Promise<void> {
  useMemoryOnly = true;
  backendOverride = null;
  mem.snapshot = null;
  mem.journal = '';
  mem.aux.clear();
  Object.assign(memoryFaults, { failAppend: 0, failSnapshot: 0, failJournalReset: 0, tornAppend: false });
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  db = null;
  openPromise = null;
  persistChain = Promise.resolve();
  queuedPersist = null;
  dirty = new Map();
  dirtyCount = 0;
  needCheckpoint = false;
  journalBytes = 0;
  gen = 0;
  Object.assign(stats, { journalAppends: 0, checkpoints: 0, lastJournalBytes: 0, lastSnapshotBytes: 0, replayedOps: 0 });
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
  if (!db) return mem.snapshot ? new Uint8Array(mem.snapshot) : null;
  return untracked(() => db!.export());
}

/** Tests / stress: close the open DB but keep what is on "disk" (simulates a cold restart or a crash). */
export function closeSqliteKeepBytesForTests(): void {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  db = null;
  openPromise = null;
  persistChain = Promise.resolve();
  queuedPersist = null;
  dirty = new Map();
  dirtyCount = 0;
}

/** Tests: what the memory backend currently holds. */
export function memoryStoreForTests(): { snapshotBytes: number; journal: string } {
  return { snapshotBytes: mem.snapshot?.length ?? 0, journal: mem.journal };
}
