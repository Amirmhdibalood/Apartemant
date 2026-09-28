/**
 * مخزن قبض‌ها و واحدها (دو «جدول» جدا مطابق Entityها: bills و units)
 */
import type { Bill, BillWithUnits, Unit } from '../models/types';
import { readJson, writeJson } from './kvStore';
import { BillDeleteBlockedError, BillPaidMessages, isBillDeleted, migrateBill, needsBillMigration, restoreBill, softDeleteBill } from '../logic/billPaid';

const BILLS_KEY = 'bills';
const UNITS_KEY = 'units';
const SCHEMA_KEY = 'schemaVersion';
/** ۱: تا نسخه ۱.۴ — ۲: از نسخه ۱.۵ (فیلدهای صریح billPaid / billPaidDate / dueDate / deletedAt در هر قبض) */
export const SCHEMA_VERSION = 2;

interface Tables { bills: Bill[]; units: Unit[] }

let cache: Tables | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Tables> {
  if (cache) return cache;
  const [bills, units] = await Promise.all([
    readJson<Bill[]>(BILLS_KEY, []),
    readJson<Unit[]>(UNITS_KEY, []),
  ]);
  const rawBills = Array.isArray(bills) ? bills : [];
  const tables: Tables = { bills: rawBills.map(migrateBill), units: Array.isArray(units) ? units : [] };
  cache = tables;
  // مهاجرت داده‌های نسخه‌های قبلی: پرداخت‌نشده، بدون مهلت پرداخت، حذف‌نشده (یک‌بار در حافظه ذخیره می‌شود)
  if (rawBills.some(needsBillMigration)) await persist(tables, false).catch(() => undefined);
  return tables;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function persist(tables: Tables, notify = true): Promise<void> {
  cache = tables;
  // نوشتن‌ها به‌ترتیب انجام می‌شوند تا تداخل پیش نیاید
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await writeJson(BILLS_KEY, tables.bills);
      await writeJson(UNITS_KEY, tables.units);
      await writeJson(SCHEMA_KEY, SCHEMA_VERSION);
    });
  if (notify) {
    void writeChain.then(() => listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }), () => undefined);
  }
  return writeChain;
}

const byUnitNumber = (a: Unit, b: Unit) => a.unitNumber - b.unitNumber;

const withUnits = (t: Tables, bill: Bill): BillWithUnits => ({
  bill,
  units: t.units.filter((u) => u.billId === bill.id).sort(byUnitNumber),
});

export const billRepository = {
  /** همه قبض‌های فعال (بدون حذف‌شده‌ها) — برای سوابق، گزارش‌ها، بدهکاران، الگوی واحدها و ... */
  async getAll(): Promise<BillWithUnits[]> {
    const t = await load();
    return t.bills.filter((b) => !isBillDeleted(b)).map((b) => withUnits(t, b));
  },

  /** همه قبض‌ها به‌همراه حذف‌شده‌ها (فقط برای فیلتر «حذف‌شده» صفحه سوابق) */
  async getAllWithDeleted(): Promise<BillWithUnits[]> {
    const t = await load();
    return t.bills.map((b) => withUnits(t, b));
  },

  /** یک قبض (حذف‌شده هم برگردانده می‌شود تا جزئیات و «بازگردانی» آن ممکن باشد) */
  async getById(id: string): Promise<BillWithUnits | null> {
    const t = await load();
    const bill = t.bills.find((b) => b.id === id);
    if (!bill) return null;
    return { bill, units: t.units.filter((u) => u.billId === id).sort(byUnitNumber) };
  },

  /** قبض‌های یک سال/ماه مشخص (جدیدترین اول) */
  async findByYearMonth(year: number, month: number): Promise<BillWithUnits[]> {
    const all = await this.getAll();
    return all
      .filter((x) => x.bill.year === year && x.bill.month === month)
      .sort((a, b) => b.bill.createdAt.localeCompare(a.bill.createdAt));
  },

  /** درج یا جایگزینی کامل یک قبض و واحدهایش */
  async upsert(bill: Bill, units: Unit[]): Promise<void> {
    const t = await load();
    const bills = t.bills.filter((b) => b.id !== bill.id).concat(migrateBill(bill));
    const others = t.units.filter((u) => u.billId !== bill.id);
    await persist({ bills, units: others.concat(units.map((u) => ({ ...u, billId: bill.id }))) });
  },

  /**
   * حذف (نرم): قبض به «حذف‌شده» منتقل می‌شود و داده‌هایش باقی می‌ماند.
   * قبض «پرداخت شد» قابل حذف نیست (BillDeleteBlockedError).
   */
  async remove(billId: string, now: Date = new Date()): Promise<void> {
    const t = await load();
    const bill = t.bills.find((b) => b.id === billId);
    if (!bill) return;
    const deleted = softDeleteBill(bill, now);
    await persist({ bills: t.bills.map((b) => (b.id === billId ? deleted : b)), units: t.units });
  },

  /** بازگردانی قبض حذف‌شده */
  async restore(billId: string): Promise<void> {
    const t = await load();
    if (!t.bills.some((b) => b.id === billId)) return;
    await persist({ bills: t.bills.map((b) => (b.id === billId ? restoreBill(b) : b)), units: t.units });
  },

  /** حذف دائمی قبض و واحدهایش — فقط برای قبض حذف‌شده */
  async purge(billId: string): Promise<void> {
    const t = await load();
    const bill = t.bills.find((b) => b.id === billId);
    if (!bill) return;
    if (!isBillDeleted(bill)) throw new BillDeleteBlockedError(BillPaidMessages.purgeNotDeleted);
    await persist({
      bills: t.bills.filter((b) => b.id !== billId),
      units: t.units.filter((u) => u.billId !== billId),
    });
  },

  /** کپی کامل جدول‌ها (برای پشتیبان‌گیری) */
  async exportTables(): Promise<Tables> {
    const t = await load();
    return { bills: t.bills.map((b) => ({ ...b })), units: t.units.map((u) => ({ ...u })) };
  },

  /** جایگزینی کامل همه قبض‌ها و واحدها (برای بازیابی از پشتیبان) */
  async replaceAll(bills: Bill[], units: Unit[]): Promise<void> {
    await persist({ bills: bills.map(migrateBill), units: units.map((u) => ({ ...u })) });
  },

  /** اطلاع از هر تغییر ذخیره‌شده (مثلاً برای زمان‌بندی دوباره یادآوری مهلت پرداخت) */
  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /** فقط برای تست */
  _resetCache(): void {
    cache = null;
  },
};
