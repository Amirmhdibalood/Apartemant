/**
 * «گزارش نموداری» (از ۱.۷.۰) — منطق خالص: مبلغ قبض‌ها در بازهٔ ماه‌ها برای مقایسه (میله‌ای/خطی) و سهم هر نوع (دایره‌ای).
 * - مبلغ هر ماه = جمع مبلغ قبض‌های حذف‌نشدهٔ آن ماه (برای یک نوع یا همهٔ انواع فعال).
 * - تغییر نسبت به ماه قبل: فقط وقتی هر دو ماه قبض دارند (درصد فقط اگر ماه قبل صفر نباشد).
 * - بیشترین/کمترین: بین ماه‌های دارای قبض، فقط وقتی دست‌کم دو ماه داده و مقدارها یکسان نباشند.
 */
import type { BillWithUnits, ExpenseType } from '../models/types';
import { EXPENSE_TYPE_ORDER } from '../models/constants';
import { isBillDeleted } from './billPaid';

export interface ChartMonth {
  month: number;
  total: number;
  count: number;
  /** تغییر نسبت به ماه قبلِ بازه (مثبت = افزایش)؛ null اگر یکی از دو ماه قبض نداشته باشد یا اولین ماه باشد */
  delta: number | null;
  /** درصد تغییر؛ null اگر delta نیست یا ماه قبل صفر بود */
  percent: number | null;
  isMax: boolean;
  isMin: boolean;
}

export interface ChartSeries {
  year: number;
  type: ExpenseType | null;
  from: number;
  to: number;
  months: ChartMonth[];
  /** جمع بازه و میانگین ماه‌های دارای قبض */
  total: number;
  average: number;
  monthsWithData: number;
  max: ChartMonth | null;
  min: ChartMonth | null;
}

export interface TypeShare { type: ExpenseType; total: number; percent: number; count: number }

/** بازهٔ ماه‌ها (۱ تا ۱۲)؛ اگر برعکس باشد جابه‌جا می‌شود */
export function normalizeRange(from: number, to: number): [number, number] {
  const f = Math.min(12, Math.max(1, Math.trunc(from) || 1));
  const t = Math.min(12, Math.max(1, Math.trunc(to) || 12));
  return f <= t ? [f, t] : [t, f];
}

function billsOf(all: BillWithUnits[], year: number, type: ExpenseType | null, types?: ExpenseType[]) {
  return all.filter((x) => !isBillDeleted(x.bill) && x.bill.year === year && (type ? x.bill.expenseType === type : !types || types.includes(x.bill.expenseType)));
}

export function chartSeries(all: BillWithUnits[], year: number, type: ExpenseType | null, fromMonth: number, toMonth: number, types?: ExpenseType[]): ChartSeries {
  const [from, to] = normalizeRange(fromMonth, toMonth);
  const own = billsOf(all, year, type, types);
  const months: ChartMonth[] = [];
  for (let m = from; m <= to; m++) {
    const inMonth = own.filter((x) => x.bill.month === m);
    months.push({ month: m, total: inMonth.reduce((s, x) => s + x.bill.totalAmount, 0), count: inMonth.length, delta: null, percent: null, isMax: false, isMin: false });
  }
  for (let i = 1; i < months.length; i++) {
    const a = months[i - 1], b = months[i];
    if (a.count > 0 && b.count > 0) {
      b.delta = b.total - a.total;
      b.percent = a.total > 0 ? (b.delta / a.total) * 100 : null;
    }
  }
  const withData = months.filter((m) => m.count > 0);
  let max: ChartMonth | null = null, min: ChartMonth | null = null;
  if (withData.length >= 2) {
    const hi = Math.max(...withData.map((m) => m.total)), lo = Math.min(...withData.map((m) => m.total));
    if (hi !== lo) {
      for (const m of withData) { m.isMax = m.total === hi; m.isMin = m.total === lo; }
      max = withData.find((m) => m.isMax) ?? null;
      min = withData.find((m) => m.isMin) ?? null;
    }
  }
  const total = months.reduce((s, m) => s + m.total, 0);
  return { year, type, from, to, months, total, average: withData.length ? total / withData.length : 0, monthsWithData: withData.length, max, min };
}

/** سهم هر نوع از مجموع بازه (دایره‌ای)؛ فقط انواع دارای مبلغ، بزرگ‌ترین اول */
export function typeShares(all: BillWithUnits[], year: number, fromMonth: number, toMonth: number, types?: ExpenseType[]): { shares: TypeShare[]; total: number } {
  const [from, to] = normalizeRange(fromMonth, toMonth);
  const own = billsOf(all, year, null, types).filter((x) => x.bill.month >= from && x.bill.month <= to);
  const map = new Map<ExpenseType, { total: number; count: number }>();
  for (const { bill } of own) {
    const v = map.get(bill.expenseType) ?? { total: 0, count: 0 };
    v.total += bill.totalAmount; v.count += 1;
    map.set(bill.expenseType, v);
  }
  const total = [...map.values()].reduce((s, v) => s + v.total, 0);
  const shares = [...map.entries()]
    .map(([type, v]) => ({ type, total: v.total, count: v.count, percent: total > 0 ? (v.total / total) * 100 : 0 }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total || EXPENSE_TYPE_ORDER.indexOf(a.type) - EXPENSE_TYPE_ORDER.indexOf(b.type));
  return { shares, total };
}
