/**
 * Idempotent Preferences → IndexedDB migration for bills/units.
 * Keeps Preferences data until verification succeeds; clears large keys only after that.
 * Rollback-safe: on failure, IDB may be partial but Preferences remain source of truth until status=done.
 */
import { Preferences } from '@capacitor/preferences';
import type { Bill, Unit } from '../models/types';
import { migrateBill } from '../logic/billPaid';
import {
  idbCount, idbGetAllBills, idbGetAllUnits, idbGetMeta, idbReplaceAllTables, idbSetMeta,
  type MigrationMeta,
} from './idb';
import { SCHEMA_VERSION } from './schema';

const PREFIX = 'bc.';
const BILLS_KEY = PREFIX + 'bills';
const UNITS_KEY = PREFIX + 'units';
const SCHEMA_KEY = PREFIX + 'schemaVersion';

async function prefsGet(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return null;
  }
}

function parseArray<T>(raw: string | null): T[] {
  if (raw == null || raw === '') return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export async function readLegacyPrefsTables(): Promise<{ bills: Bill[]; units: Unit[]; rawBills: string | null; rawUnits: string | null }> {
  const [rawBills, rawUnits] = await Promise.all([prefsGet(BILLS_KEY), prefsGet(UNITS_KEY)]);
  const bills = parseArray<Bill>(rawBills).map(migrateBill);
  const units = parseArray<Unit>(rawUnits).map((u) => ({ ...u }));
  return { bills, units, rawBills, rawUnits };
}

function verify(a: Bill[], b: Unit[], ca: Bill[], cb: Unit[]): string | null {
  if (a.length !== ca.length) return `bill count mismatch ${a.length}≠${ca.length}`;
  if (b.length !== cb.length) return `unit count mismatch ${b.length}≠${cb.length}`;
  const billIds = new Set(ca.map((x) => x.id));
  for (const x of a) if (!billIds.has(x.id)) return `missing bill ${x.id}`;
  const unitIds = new Set(cb.map((x) => x.id));
  for (const x of b) if (!unitIds.has(x.id)) return `missing unit ${x.id}`;
  return null;
}

/**
 * Ensure IDB holds the canonical bills/units.
 * - If migration already done → no-op (returns current IDB tables).
 * - If Preferences empty and IDB has data → mark done.
 * - If Preferences has data → copy, verify, mark done; leave prefs until clearLegacyPrefsAfterMigration().
 * - Corrupted prefs JSON → treat as empty arrays (do not wipe IDB if already populated).
 */
export async function ensureMigrated(): Promise<{ bills: Bill[]; units: Unit[]; migratedNow: boolean }> {
  const existing = await idbGetMeta<MigrationMeta>('migration');
  if (existing?.status === 'done') {
    const [bills, units] = await Promise.all([idbGetAllBills<Bill>(), idbGetAllUnits<Unit>()]);
    return { bills: bills.map(migrateBill), units, migratedNow: false };
  }

  const legacy = await readLegacyPrefsTables();
  const idbBillCount = await idbCount('bills').catch(() => 0);
  const idbUnitCount = await idbCount('units').catch(() => 0);

  // Preferences empty: either fresh install or already cleared after migration
  if (!legacy.rawBills && !legacy.rawUnits) {
    if (idbBillCount > 0 || idbUnitCount > 0) {
      await idbSetMeta<MigrationMeta>('migration', {
        status: 'done', at: new Date().toISOString(), bills: idbBillCount, units: idbUnitCount,
      });
      const [bills, units] = await Promise.all([idbGetAllBills<Bill>(), idbGetAllUnits<Unit>()]);
      return { bills: bills.map(migrateBill), units, migratedNow: false };
    }
    await idbReplaceAllTables([], [], SCHEMA_VERSION);
    await idbSetMeta<MigrationMeta>('migration', { status: 'done', at: new Date().toISOString(), bills: 0, units: 0 });
    return { bills: [], units: [], migratedNow: true };
  }

  try {
    await idbSetMeta<MigrationMeta>('migration', { status: 'pending', at: new Date().toISOString() });
    await idbReplaceAllTables(legacy.bills, legacy.units, SCHEMA_VERSION);
    const [gotB, gotU] = await Promise.all([idbGetAllBills<Bill>(), idbGetAllUnits<Unit>()]);
    const err = verify(legacy.bills, legacy.units, gotB, gotU);
    if (err) throw new Error(err);
    await idbSetMeta<MigrationMeta>('migration', {
      status: 'done',
      at: new Date().toISOString(),
      bills: gotB.length,
      units: gotU.length,
    });
    return { bills: gotB.map(migrateBill), units: gotU, migratedNow: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await idbSetMeta<MigrationMeta>('migration', {
      status: 'failed', at: new Date().toISOString(), error: message,
    }).catch(() => undefined);
    // Fall back to Preferences data in memory so the app still runs; next launch retries.
    return { bills: legacy.bills, units: legacy.units, migratedNow: false };
  }
}

/** After verified migration, drop large Preferences keys so WebView quota is freed. Idempotent. */
export async function clearLegacyPrefsAfterMigration(): Promise<boolean> {
  const meta = await idbGetMeta<MigrationMeta>('migration');
  if (meta?.status !== 'done') return false;
  const cleared = await idbGetMeta<boolean>('prefsCleared');
  if (cleared) return false;
  await Preferences.remove({ key: BILLS_KEY });
  await Preferences.remove({ key: UNITS_KEY });
  // schemaVersion can stay or go; remove to avoid confusion
  await Preferences.remove({ key: SCHEMA_KEY });
  await idbSetMeta('prefsCleared', true);
  return true;
}

/** Soft near-quota hint only when legacy prefs still hold large payloads (pre-clear). */
export async function legacyPrefsNearQuota(): Promise<{ near: boolean; chars: number }> {
  const [b, u] = await Promise.all([prefsGet(BILLS_KEY), prefsGet(UNITS_KEY)]);
  const chars = (b?.length ?? 0) + (u?.length ?? 0);
  return { near: chars > 3_500_000, chars };
}
