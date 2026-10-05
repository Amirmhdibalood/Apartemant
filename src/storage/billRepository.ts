/**
 * مخزن قبض‌ها و واحدها (IndexedDB + حافظه با ایندکس Map).
 * از ۱.۷.۹: دادهٔ بزرگ از Preferences به IndexedDB مهاجرت می‌شود؛ join با Map به‌جای filter تودرتو.
 */
import type { Bill, BillWithUnits, Unit } from '../models/types';
import { BillDeleteBlockedError, BillPaidMessages, isBillDeleted, migrateBill, needsBillMigration, restoreBill, softDeleteBill } from '../logic/billPaid';
import { idbReplaceAllTables } from './idb';
import { clearLegacyPrefsAfterMigration, ensureMigrated } from './migration';
import { SCHEMA_VERSION } from './schema';

export { SCHEMA_VERSION };

interface Tables { bills: Bill[]; units: Unit[] }

interface Store {
  bills: Bill[];
  units: Unit[];
  /** billId → units (sorted by unitNumber) */
  unitsByBill: Map<string, Unit[]>;
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

function makeStore(bills: Bill[], units: Unit[]): Store {
  return { bills, units, unitsByBill: buildIndex(units) };
}

function withUnits(s: Store, bill: Bill): BillWithUnits {
  return { bill, units: s.unitsByBill.get(bill.id) ?? [] };
}

async function load(): Promise<Store> {
  if (store) return store;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { bills, units } = await ensureMigrated();
    const tables = makeStore(bills, units);
    store = tables;
    // fire-and-forget: free Preferences quota after verified migration
    void clearLegacyPrefsAfterMigration().catch(() => undefined);
    if (bills.some(needsBillMigration)) await persist(tables, false).catch(() => undefined);
    return tables;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function persist(s: Store, notify = true): Promise<void> {
  store = s;
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await idbReplaceAllTables(s.bills, s.units, SCHEMA_VERSION);
    });
  if (notify) {
    void writeChain.then(() => listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }), () => undefined);
  }
  return writeChain;
}

function mapBills(s: Store, bills: Bill[]): BillWithUnits[] {
  return bills.map((b) => withUnits(s, b));
}

export const billRepository = {
  /** همه قبض‌های فعال (بدون حذف‌شده‌ها) */
  async getAll(): Promise<BillWithUnits[]> {
    const s = await load();
    return mapBills(s, s.bills.filter((b) => !isBillDeleted(b)));
  },

  /** همه قبض‌ها به‌همراه حذف‌شده‌ها */
  async getAllWithDeleted(): Promise<BillWithUnits[]> {
    const s = await load();
    return mapBills(s, s.bills);
  },

  /**
   * قبض‌های یک سال (فعال، بدون حذف‌شده) — برای گزارش‌ها/سوابق سال‌محور بدون join همهٔ تاریخچه.
   * newest first by createdAt.
   */
  async getByYear(year: number, opts?: { includeDeleted?: boolean }): Promise<BillWithUnits[]> {
    const s = await load();
    const bills = s.bills.filter((b) => b.year === year && (opts?.includeDeleted || !isBillDeleted(b)));
    return mapBills(s, bills).sort((a, b) => b.bill.createdAt.localeCompare(a.bill.createdAt));
  },

  /** سال‌هایی که حداقل یک قبض دارند (بدون join واحدها) */
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
    const bills = s.bills.filter((b) => b.id !== bill.id).concat(migrateBill(bill));
    const others = s.units.filter((u) => u.billId !== bill.id);
    await persist(makeStore(bills, others.concat(units.map((u) => ({ ...u, billId: bill.id })))));
  },

  async upsertMany(items: { bill: Bill; units: Unit[] }[]): Promise<void> {
    if (items.length === 0) return;
    const s = await load();
    const ids = new Set(items.map((i) => i.bill.id));
    const bills = s.bills.filter((b) => !ids.has(b.id)).concat(items.map((i) => migrateBill(i.bill)));
    const units = s.units.filter((u) => !ids.has(u.billId))
      .concat(items.flatMap((i) => i.units.map((u) => ({ ...u, billId: i.bill.id }))));
    await persist(makeStore(bills, units));
  },

  async remove(billId: string, now: Date = new Date()): Promise<void> {
    const s = await load();
    const bill = s.bills.find((b) => b.id === billId);
    if (!bill) return;
    const deleted = softDeleteBill(bill, now);
    await persist(makeStore(s.bills.map((b) => (b.id === billId ? deleted : b)), s.units));
  },

  async restore(billId: string): Promise<void> {
    const s = await load();
    if (!s.bills.some((b) => b.id === billId)) return;
    await persist(makeStore(s.bills.map((b) => (b.id === billId ? restoreBill(b) : b)), s.units));
  },

  async purge(billId: string): Promise<void> {
    const s = await load();
    const bill = s.bills.find((b) => b.id === billId);
    if (!bill) return;
    if (!isBillDeleted(bill)) throw new BillDeleteBlockedError(BillPaidMessages.purgeNotDeleted);
    await persist(makeStore(
      s.bills.filter((b) => b.id !== billId),
      s.units.filter((u) => u.billId !== billId),
    ));
  },

  async exportTables(): Promise<Tables> {
    const s = await load();
    return { bills: s.bills.map((b) => ({ ...b })), units: s.units.map((u) => ({ ...u })) };
  },

  async replaceAll(bills: Bill[], units: Unit[]): Promise<void> {
    await persist(makeStore(bills.map(migrateBill), units.map((u) => ({ ...u }))));
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /** فقط برای تست — کش حافظه را خالی می‌کند (IDB نمی‌زند) */
  _resetCache(): void {
    store = null;
    loadPromise = null;
  },

  /** اطمینان از load مشترک (برای صفحهٔ اصلی / شروع) */
  async warm(): Promise<void> {
    await load();
  },
};
