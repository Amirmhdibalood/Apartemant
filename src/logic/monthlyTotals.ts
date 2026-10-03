/**
 * گزارش‌های «جمع قبض‌های ماه» و «با جزئیات» (از ۱.۷.۰) — منطق خالص.
 * برای یک سال/ماه: سهم هر واحد از همهٔ قبض‌های حذف‌نشدهٔ آن ماه (آب، برق، گاز، شارژ …) جمع زده می‌شود = «قابل پرداخت».
 * - واحد خالی (در همهٔ قبض‌های آن ماه): سهم صفر؛ «خالی» نوشته می‌شود و در شمار واحدها نمی‌آید.
 * - اگر واحدی در بعضی قبض‌ها خالی و در بقیه پر باشد، فقط سهم قبض‌های پرِ آن حساب می‌شود.
 * - نوع قبضِ خاموش (تنظیمات) با `types` یا با useVisibleBills کنار می‌رود.
 * - جمع کل واحدها = جمع مبلغ قبض‌های ماه (تقسیم هرگز تومان کم یا زیاد نمی‌کند).
 */
import type { BillWithUnits, ExpenseType } from '../models/types';
import { EXPENSE_TYPE_ORDER } from '../models/constants';
import { isBillDeleted } from './billPaid';
import { sanitizeAlias } from './building';
import { paidAmount, remainingAmount } from './payments';

export type MonthlyUnitStatus = 'vacant' | 'paid' | 'partial' | 'unpaid';

export interface MonthlyBillRef { billId: string; expenseType: ExpenseType; totalAmount: number }

export interface MonthlyUnitItem {
  billId: string;
  expenseType: ExpenseType;
  amount: number;
  paid: number;
  remaining: number;
}

export interface MonthlyUnit {
  unitNumber: number;
  alias: string | null;
  personCount: number;
  vacant: boolean;
  /** سهم از هر قبض ماه (به ترتیب نوع هزینه)؛ برای واحد خالی تهی */
  items: MonthlyUnitItem[];
  /** جمع سهم‌ها = قابل پرداخت */
  total: number;
  paid: number;
  remaining: number;
  status: MonthlyUnitStatus;
}

export interface MonthlyTotals {
  year: number;
  month: number;
  bills: MonthlyBillRef[];
  /** جمع مبلغ قبض‌ها به تفکیک نوع (فقط انواع دارای قبض) */
  byType: { type: ExpenseType; total: number; count: number }[];
  units: MonthlyUnit[];
  grandTotal: number;
  paidTotal: number;
  remainingTotal: number;
  /** جمع مبلغ قبض‌های ماه (باید با grandTotal برابر باشد) */
  billsTotal: number;
  /** واحدهای غیرخالی / خالی */
  occupiedCount: number;
  vacantCount: number;
}

const typeIndex = (t: ExpenseType) => EXPENSE_TYPE_ORDER.indexOf(t);

export function monthlyTotals(all: BillWithUnits[], year: number, month: number, types?: ExpenseType[]): MonthlyTotals {
  const own = all
    .filter((x) => !isBillDeleted(x.bill) && x.bill.year === year && x.bill.month === month && (!types || types.includes(x.bill.expenseType)))
    .sort((a, b) => typeIndex(a.bill.expenseType) - typeIndex(b.bill.expenseType) || a.bill.createdAt.localeCompare(b.bill.createdAt));

  const bills: MonthlyBillRef[] = own.map(({ bill }) => ({ billId: bill.id, expenseType: bill.expenseType, totalAmount: bill.totalAmount }));
  const typeMap = new Map<ExpenseType, { total: number; count: number }>();
  for (const b of bills) {
    const t = typeMap.get(b.expenseType) ?? { total: 0, count: 0 };
    t.total += b.totalAmount; t.count += 1;
    typeMap.set(b.expenseType, t);
  }

  interface Acc { alias: string | null; aliasAt: string; persons: number; personsAt: string; anyLive: boolean; items: MonthlyUnitItem[] }
  const map = new Map<number, Acc>();
  for (const { bill, units } of own) {
    for (const u of units) {
      const a = map.get(u.unitNumber) ?? { alias: null, aliasAt: '', persons: 0, personsAt: '', anyLive: false, items: [] };
      const al = sanitizeAlias(u.alias);
      if (al && bill.createdAt >= a.aliasAt) { a.alias = al; a.aliasAt = bill.createdAt; }
      if (u.vacant !== true) {
        a.anyLive = true;
        if (bill.createdAt >= a.personsAt) { a.persons = u.personCount; a.personsAt = bill.createdAt; }
        a.items.push({ billId: bill.id, expenseType: bill.expenseType, amount: u.shareAmount, paid: paidAmount(u), remaining: remainingAmount(u) });
      }
      map.set(u.unitNumber, a);
    }
  }

  const units: MonthlyUnit[] = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([unitNumber, a]) => {
      const vacant = !a.anyLive;
      const total = a.items.reduce((s, i) => s + i.amount, 0);
      const paid = a.items.reduce((s, i) => s + i.paid, 0);
      const remaining = a.items.reduce((s, i) => s + i.remaining, 0);
      const status: MonthlyUnitStatus = vacant ? 'vacant' : remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      return { unitNumber, alias: a.alias, personCount: a.persons, vacant, items: a.items, total, paid, remaining, status };
    });

  const live = units.filter((u) => !u.vacant);
  return {
    year, month, bills,
    byType: [...typeMap.entries()].map(([type, v]) => ({ type, ...v })),
    units,
    grandTotal: live.reduce((s, u) => s + u.total, 0),
    paidTotal: live.reduce((s, u) => s + u.paid, 0),
    remainingTotal: live.reduce((s, u) => s + u.remaining, 0),
    billsTotal: bills.reduce((s, b) => s + b.totalAmount, 0),
    occupiedCount: live.length,
    vacantCount: units.length - live.length,
  };
}

/** ماه‌هایی از سال که دست‌کم یک قبض (حذف‌نشده) دارند */
export function monthsWithBills(all: BillWithUnits[], year: number): number[] {
  return [...new Set(all.filter((x) => !isBillDeleted(x.bill) && x.bill.year === year).map((x) => x.bill.month))].sort((a, b) => a - b);
}
