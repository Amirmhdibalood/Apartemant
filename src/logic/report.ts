/**
 * گزارش هزینه‌های سال — منطق خالص (بدون وابستگی به پلتفرم).
 * جمع هر نوع هزینه، جمع کل، سهم درصدی و ریز ماه‌به‌ماه برای یک سال.
 */
import type { BillWithUnits, ExpenseType } from '../models/types';
import { EXPENSE_TYPE_ORDER } from '../models/constants';
import { paidAmount } from './payments';

export interface TypeTotal {
  type: ExpenseType;
  total: number;
  /** تعداد قبض‌های این نوع */
  count: number;
  /** سهم از جمع کل سال (۰ تا ۱۰۰، با یک رقم اعشار) */
  percent: number;
}

export interface MonthTotal {
  /** ۱ تا ۱۲ */
  month: number;
  total: number;
  count: number;
  /** جمع هر نوع هزینه در این ماه (فقط انواعی که قبض دارند) */
  byType: Partial<Record<ExpenseType, number>>;
}

export interface YearlyReport {
  year: number;
  grandTotal: number;
  billCount: number;
  /** جمع پرداخت‌های واحدها (تسویه کامل + پرداخت‌های جزئی) */
  settledTotal: number;
  /** جمع مانده بدهی واحدها */
  unsettledTotal: number;
  /** همه ۸ نوع هزینه؛ مرتب: بیشترین مبلغ اول، انواع بدون هزینه در انتها به ترتیب ثابت */
  byType: TypeTotal[];
  /** ۱۲ ماه، فروردین تا اسفند */
  byMonth: MonthTotal[];
  /** بیشترین جمع ماهانه (برای مقیاس نمودار) */
  maxMonthTotal: number;
}

/** درصد با یک رقم اعشار */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function yearlyReport(bills: BillWithUnits[], year: number, types: ExpenseType[] = EXPENSE_TYPE_ORDER): YearlyReport {
  const own = bills.filter((b) => b.bill.year === year);
  const totals = new Map<ExpenseType, { total: number; count: number }>(
    types.map((t) => [t, { total: 0, count: 0 }]),
  );
  const byMonth: MonthTotal[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, count: 0, byType: {} }));
  let grandTotal = 0;
  let settledTotal = 0;

  for (const { bill, units } of own) {
    const t = totals.get(bill.expenseType) ?? { total: 0, count: 0 };
    t.total += bill.totalAmount;
    t.count += 1;
    totals.set(bill.expenseType, t);
    grandTotal += bill.totalAmount;
    const m = byMonth[bill.month - 1];
    if (m) {
      m.total += bill.totalAmount;
      m.count += 1;
      m.byType[bill.expenseType] = (m.byType[bill.expenseType] ?? 0) + bill.totalAmount;
    }
    settledTotal += units.reduce((s, u) => s + paidAmount(u), 0);
  }

  const order = (type: ExpenseType) => EXPENSE_TYPE_ORDER.indexOf(type);
  const byType: TypeTotal[] = [...totals.entries()]
    .map(([type, v]) => ({ type, total: v.total, count: v.count, percent: percentOf(v.total, grandTotal) }))
    .sort((a, b) => b.total - a.total || order(a.type) - order(b.type));

  return {
    year,
    grandTotal,
    billCount: own.length,
    settledTotal,
    unsettledTotal: grandTotal - settledTotal,
    byType,
    byMonth,
    maxMonthTotal: Math.max(0, ...byMonth.map((m) => m.total)),
  };
}

/** سال پیش‌فرض گزارش: سال جاری اگر در فهرست باشد، وگرنه آخرین سالی که قبض دارد، وگرنه نزدیک‌ترین سال فهرست */
export function pickReportYear(options: number[], billYears: number[], currentYear: number): number {
  if (options.includes(currentYear) && (billYears.includes(currentYear) || billYears.length === 0)) return currentYear;
  const withBills = billYears.filter((y) => options.includes(y) && y <= currentYear).sort((a, b) => b - a);
  if (withBills.length) return withBills[0];
  if (options.includes(currentYear)) return currentYear;
  const any = [...billYears].sort((a, b) => b - a).find((y) => options.includes(y));
  if (any) return any;
  return options.reduce((best, y) => (Math.abs(y - currentYear) < Math.abs(best - currentYear) ? y : best), options[0] ?? currentYear);
}
