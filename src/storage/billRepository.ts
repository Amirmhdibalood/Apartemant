/**
 * مخزن قبض‌ها و واحدها (دو «جدول» جدا مطابق Entityها: bills و units)
 */
import type { Bill, BillWithUnits, Unit } from '../models/types';
import { readJson, writeJson } from './kvStore';

const BILLS_KEY = 'bills';
const UNITS_KEY = 'units';
const SCHEMA_KEY = 'schemaVersion';
const SCHEMA_VERSION = 1;

interface Tables { bills: Bill[]; units: Unit[] }

let cache: Tables | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Tables> {
  if (cache) return cache;
  const [bills, units] = await Promise.all([
    readJson<Bill[]>(BILLS_KEY, []),
    readJson<Unit[]>(UNITS_KEY, []),
  ]);
  cache = { bills: Array.isArray(bills) ? bills : [], units: Array.isArray(units) ? units : [] };
  return cache;
}

function persist(tables: Tables): Promise<void> {
  cache = tables;
  // نوشتن‌ها به‌ترتیب انجام می‌شوند تا تداخل پیش نیاید
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await writeJson(BILLS_KEY, tables.bills);
      await writeJson(UNITS_KEY, tables.units);
      await writeJson(SCHEMA_KEY, SCHEMA_VERSION);
    });
  return writeChain;
}

const byUnitNumber = (a: Unit, b: Unit) => a.unitNumber - b.unitNumber;

export const billRepository = {
  async getAll(): Promise<BillWithUnits[]> {
    const t = await load();
    return t.bills.map((bill) => ({
      bill,
      units: t.units.filter((u) => u.billId === bill.id).sort(byUnitNumber),
    }));
  },

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
    const bills = t.bills.filter((b) => b.id !== bill.id).concat(bill);
    const others = t.units.filter((u) => u.billId !== bill.id);
    await persist({ bills, units: others.concat(units.map((u) => ({ ...u, billId: bill.id }))) });
  },

  async remove(billId: string): Promise<void> {
    const t = await load();
    await persist({
      bills: t.bills.filter((b) => b.id !== billId),
      units: t.units.filter((u) => u.billId !== billId),
    });
  },

  /** فقط برای تست */
  _resetCache(): void {
    cache = null;
  },
};
