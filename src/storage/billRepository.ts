/**
 * مخزن قبض‌ها و واحدها — SQLite (sql.js) با کش حافظه و ذخیرهٔ ردیف‌به‌ردیف.
 * از ۱.۸.۰: موتور اصلی SQLite؛ IndexedDB فقط منبع مهاجرت است.
 */
import type { Bill, BillWithUnits, Unit } from '../models/types';
import { BillDeleteBlockedError, BillPaidMessages, isBillDeleted, migrateBill, needsBillMigration, restoreBill, softDeleteBill } from '../logic/billPaid';
import { clearLegacyPrefsAfterMigration, ensureMigrated } from './migration';
import { SCHEMA_VERSION } from './schema';
import { withSqlite, withSqliteWrite } from './sqlite/db';
import {
  deleteBillCascade,
  ensureDefaultBuilding,
  getBillBuildingId,
  isSqliteMigrationDone,
  markSqliteMigrationDone,
  readAllBills,
  replaceAllDomain,
  replaceUnitsForBill,
  syncFundDepositsForBill,
  upsertBillRow,
} from './sqlite/domain';
import { DEFAULT_BUILDING_ID } from './sqlite/schema';

export { SCHEMA_VERSION };

interface Tables { bills: Bill[]; units: Unit[] }

interface Store {
  bills: Bill[];
  units: Unit[];
  /** billId → units (sorted by unitNumber) */
  unitsByBill: Map<string, Unit[]>;
  /** billId → buildingId */
  buildingByBill: Map<string, string>;
}

let store: Store | null = null;
let loadPromise: Promise<Store> | null = null;
let writeChain: Promise<void> = Promise.resolve();

type Listener = () => void;
const listeners = new Set<Listener>();

const byUnitNumber = (a: Unit, b: Unit) => a.unitNumber - b.unitNumber;

function buildIndex(units: Unit[]): Map<string, Unit[]> {
  const map = new Map<string, Unit[]>();
  for (const u of units) {
    let arr = map.get(u.billId);
    if (!arr) {
      arr = [];
      map.set(u.billId, arr);
    }
    arr.push(u);
  }
  for (const arr of map.values()) arr.sort(byUnitNumber);
  return map;
}

function makeStore(bills: Bill[], units: Unit[], buildingByBill?: Map<string, string>): Store {
  const map = buildingByBill ?? new Map(bills.map((b) => [b.id, (b as Bill & { buildingId?: string }).buildingId ?? DEFAULT_BUILDING_ID]));
  const cleanBills = bills.map((b) => {
    const { buildingId: _x, ...rest } = b as Bill & { buildingId?: string };
    return migrateBill(rest);
  });
  return { bills: cleanBills, units, unitsByBill: buildIndex(units), buildingByBill: map };
}

function withUnits(s: Store, bill: Bill): BillWithUnits {
  return { bill, units: s.unitsByBill.get(bill.id) ?? [] };
}

async function load(): Promise<Store> {
  if (store) return store;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { bills, units } = await ensureMigrated();
    const buildingByBill = await withSqlite((db) => {
      const m = new Map<string, string>();
      for (const row of readAllBills(db)) m.set(row.id, row.buildingId);
      return m;
    });
    const tables = makeStore(bills, units, buildingByBill);
    store = tables;
    void clearLegacyPrefsAfterMigration().catch(() => undefined);
    if (bills.some(needsBillMigration)) {
      await persistRowLevel(tables, tables.bills, tables.units, false).catch(() => undefined);
    }
    return tables;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function notify(): void {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

function buildingIdFor(s: Store, billId: string, bill?: Bill): string {
  return s.buildingByBill.get(billId)
    ?? (bill as Bill & { buildingId?: string } | undefined)?.buildingId
    ?? DEFAULT_BUILDING_ID;
}

async function persistRowLevel(
  next: Store,
  touchedBills: Bill[],
  _touchedUnits: Unit[],
  doNotify = true,
  mode: 'upsert' | 'replaceAll' | 'purge' = 'upsert',
  purgedIds: string[] = [],
): Promise<void> {
  store = next;
  writeChain = writeChain.catch(() => undefined).then(async () => {
    await withSqliteWrite((db) => {
      ensureDefaultBuilding(db);
      if (mode === 'replaceAll') {
        replaceAllDomain(db, DEFAULT_BUILDING_ID, next.bills, next.units);
        if (!isSqliteMigrationDone(db)) {
          markSqliteMigrationDone(db, next.bills.length, next.units.length);
        }
        return;
      }
      for (const id of purgedIds) deleteBillCascade(db, id);
      if (!isSqliteMigrationDone(db)) {
        markSqliteMigrationDone(db, next.bills.length, next.units.length);
      }
      for (const bill of touchedBills) {
        const bid = buildingIdFor(next, bill.id, bill);
        next.buildingByBill.set(bill.id, bid);
        upsertBillRow(db, bill, bid);
        const units = next.unitsByBill.get(bill.id) ?? [];
        replaceUnitsForBill(db, bill.id, bid, units);
        syncFundDepositsForBill(db, bill, bid, units);
      }
    });
  });
  if (doNotify) {
    void writeChain.then(() => notify(), () => undefined);
  }
  return writeChain;
}

function mapBills(s: Store, bills: Bill[]): BillWithUnits[] {
  return bills.map((b) => withUnits(s, b));
}

export const billRepository = {
  async getAll(): Promise<BillWithUnits[]> {
    const s = await load();
    return mapBills(s, s.bills.filter((b) => !isBillDeleted(b)));
  },

  async getAllWithDeleted(): Promise<BillWithUnits[]> {
    const s = await load();
    return mapBills(s, s.bills);
  },

  async getByYear(year: number, opts?: { includeDeleted?: boolean }): Promise<BillWithUnits[]> {
    const s = await load();
    const bills = s.bills.filter((b) => b.year === year && (opts?.includeDeleted || !isBillDeleted(b)));
    return mapBills(s, bills).sort((a, b) => b.bill.createdAt.localeCompare(a.bill.createdAt));
  },

  async getYears(opts?: { includeDeleted?: boolean }): Promise<number[]> {
    const s = await load();
    const set = new Set<number>();
    for (const b of s.bills) {
      if (!opts?.includeDeleted && isBillDeleted(b)) continue;
      set.add(b.year);
    }
    return [...set].sort((a, b) => a - b);
  },

  async getById(id: string): Promise<BillWithUnits | null> {
    const s = await load();
    const bill = s.bills.find((b) => b.id === id);
    if (!bill) return null;
    return withUnits(s, bill);
  },

  async findByYearMonth(year: number, month: number): Promise<BillWithUnits[]> {
    const s = await load();
    return mapBills(
      s,
      s.bills.filter((b) => !isBillDeleted(b) && b.year === year && b.month === month),
    ).sort((a, b) => b.bill.createdAt.localeCompare(a.bill.createdAt));
  },

  async upsert(bill: Bill, units: Unit[]): Promise<void> {
    const s = await load();
    const migrated = migrateBill(bill);
    const bills = s.bills.filter((b) => b.id !== bill.id).concat(migrated);
    const others = s.units.filter((u) => u.billId !== bill.id);
    const nextUnits = others.concat(units.map((u) => ({ ...u, billId: bill.id })));
    const next = makeStore(bills, nextUnits, new Map(s.buildingByBill));
    if (!next.buildingByBill.has(bill.id)) {
      const existing = await withSqlite((db) => getBillBuildingId(db, bill.id));
      next.buildingByBill.set(bill.id, existing ?? DEFAULT_BUILDING_ID);
    }
    await persistRowLevel(next, [migrated], nextUnits, true, 'upsert');
  },

  async upsertMany(items: { bill: Bill; units: Unit[] }[]): Promise<void> {
    if (items.length === 0) return;
    const s = await load();
    const ids = new Set(items.map((i) => i.bill.id));
    const migratedItems = items.map((i) => ({ bill: migrateBill(i.bill), units: i.units }));
    const bills = s.bills.filter((b) => !ids.has(b.id)).concat(migratedItems.map((i) => i.bill));
    const units = s.units.filter((u) => !ids.has(u.billId))
      .concat(migratedItems.flatMap((i) => i.units.map((u) => ({ ...u, billId: i.bill.id }))));
    const next = makeStore(bills, units, new Map(s.buildingByBill));
    for (const i of migratedItems) {
      if (!next.buildingByBill.has(i.bill.id)) next.buildingByBill.set(i.bill.id, DEFAULT_BUILDING_ID);
    }
    await persistRowLevel(next, migratedItems.map((i) => i.bill), units, true, 'upsert');
  },

  async remove(billId: string, now: Date = new Date()): Promise<void> {
    const s = await load();
    const bill = s.bills.find((b) => b.id === billId);
    if (!bill) return;
    const deleted = softDeleteBill(bill, now);
    const bills = s.bills.map((b) => (b.id === billId ? deleted : b));
    const next = makeStore(bills, s.units, new Map(s.buildingByBill));
    await persistRowLevel(next, [deleted], s.units, true, 'upsert');
  },

  async restore(billId: string): Promise<void> {
    const s = await load();
    if (!s.bills.some((b) => b.id === billId)) return;
    const restored = restoreBill(s.bills.find((b) => b.id === billId)!);
    const bills = s.bills.map((b) => (b.id === billId ? restored : b));
    const next = makeStore(bills, s.units, new Map(s.buildingByBill));
    await persistRowLevel(next, [restored], s.units, true, 'upsert');
  },

  async purge(billId: string): Promise<void> {
    const s = await load();
    const bill = s.bills.find((b) => b.id === billId);
    if (!bill) return;
    if (!isBillDeleted(bill)) throw new BillDeleteBlockedError(BillPaidMessages.purgeNotDeleted);
    const next = makeStore(
      s.bills.filter((b) => b.id !== billId),
      s.units.filter((u) => u.billId !== billId),
      new Map(s.buildingByBill),
    );
    next.buildingByBill.delete(billId);
    await persistRowLevel(next, [], [], true, 'purge', [billId]);
  },

  async exportTables(): Promise<Tables> {
    const s = await load();
    return { bills: s.bills.map((b) => ({ ...b })), units: s.units.map((u) => ({ ...u })) };
  },

  async replaceAll(bills: Bill[], units: Unit[]): Promise<void> {
    const next = makeStore(bills.map(migrateBill), units.map((u) => ({ ...u })));
    await persistRowLevel(next, next.bills, next.units, true, 'replaceAll');
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  _resetCache(): void {
    store = null;
    loadPromise = null;
  },

  async warm(): Promise<void> {
    await load();
  },
};
