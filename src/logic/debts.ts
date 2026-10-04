/**
 * گزارش بدهکاران و سابقه پرداخت واحدها — منطق خالص (بدون وابستگی به پلتفرم).
 * واحدها در هر قبض با شماره (واحد ۱، ۲، ...) مشخص می‌شوند؛ بنابراین «واحد» در این گزارش = شماره واحد در همه قبض‌ها.
 */
import type { BillWithUnits, ExpenseType } from '../models/types';
import { lastPaidAt, paidAmount, remainingAmount, unitPayments } from './payments';
import { latestAliases, sanitizeAlias } from './building';

/**
 * مهلت پرداخت پس از ثبت قبض (روز). پرداخت بعد از این مهلت «با تأخیر» حساب می‌شود.
 * (فعلاً ثابت؛ در آینده می‌تواند در تنظیمات قابل تغییر شود.)
 */
export const PAYMENT_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** تعداد روزهای کامل بین دو زمان (حداقل ۰) */
export function daysBetween(fromIso: string, to: Date | string): number {
  const a = Date.parse(fromIso);
  const b = typeof to === 'string' ? Date.parse(to) : to.getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / DAY_MS));
}

export interface DebtItem {
  billId: string;
  year: number;
  month: number;
  expenseType: ExpenseType;
  /** مانده بدهی این واحد در این قبض */
  amount: number;
  /** سهم کامل واحد در این قبض */
  share: number;
  /** مبلغ پرداخت‌شده (پرداخت جزئی) */
  paid: number;
  /** زمان ثبت قبض (ISO) */
  billCreatedAt: string;
  /** روزهای گذشته از ثبت قبض تا امروز */
  daysOutstanding: number;
  /** اسم مستعار واحد در همین قبض (عکس لحظه‌ای) */
  alias: string | null;
}

export interface UnitDebt {
  unitNumber: number;
  /** اسم مستعار از جدیدترین قبض دارای این واحد */
  alias: string | null;
  total: number;
  /** به ترتیب قدیمی‌ترین دوره (سال/ماه) اول */
  items: DebtItem[];
}

export interface DebtorsReport {
  units: UnitDebt[];
  grandTotal: number;
  /** تعداد قبض‌هایی که حداقل یک واحد تسویه‌نشده دارند */
  openBills: number;
  /** همه شماره واحدهایی که در قبض‌ها وجود دارند (برای دسترسی به سابقه پرداخت) */
  allUnitNumbers: number[];
  /** اسم مستعار هر شماره واحد (از جدیدترین قبض دارای آن واحد) */
  aliases: Record<number, string | null>;
}

const byPeriod = (a: { year: number; month: number }, b: { year: number; month: number }) =>
  a.year - b.year || a.month - b.month;

export function debtorsReport(bills: BillWithUnits[], now: Date = new Date()): DebtorsReport {
  const map = new Map<number, UnitDebt>();
  const all = new Set<number>();
  let openBills = 0;
  for (const { bill, units } of bills) {
    let open = false;
    for (const u of units) {
      if (u.vacant) continue; // واحد خالی: نه واحد حساب می‌شود نه بدهی دارد
      all.add(u.unitNumber);
      const remaining = remainingAmount(u);
      if (remaining <= 0) continue;
      open = true;
      const d = map.get(u.unitNumber) ?? { unitNumber: u.unitNumber, alias: null, total: 0, items: [] };
      d.total += remaining;
      d.items.push({
        billId: bill.id,
        year: bill.year,
        month: bill.month,
        expenseType: bill.expenseType,
        amount: remaining,
        share: u.shareAmount,
        paid: paidAmount(u),
        billCreatedAt: bill.createdAt,
        daysOutstanding: daysBetween(bill.createdAt, now),
        alias: sanitizeAlias(u.alias),
      });
      map.set(u.unitNumber, d);
    }
    if (open) openBills += 1;
  }
  const names = latestAliases(bills);
  const units = [...map.values()]
    .map((d) => ({ ...d, alias: names.get(d.unitNumber) ?? null, items: [...d.items].sort((a, b) => byPeriod(a, b) || a.billCreatedAt.localeCompare(b.billCreatedAt)) }))
    .sort((a, b) => b.total - a.total || a.unitNumber - b.unitNumber);
  return {
    units,
    grandTotal: units.reduce((s, u) => s + u.total, 0),
    openBills,
    allUnitNumbers: [...all].sort((a, b) => a - b),
    aliases: Object.fromEntries([...all].map((n) => [n, names.get(n) ?? null])),
  };
}

export type PaymentStatus = 'onTime' | 'late' | 'unknownDate' | 'unpaid';

export interface PaymentEntry {
  billId: string;
  year: number;
  month: number;
  expenseType: ExpenseType;
  /** سهم واحد در این قبض */
  amount: number;
  paid: number;
  remaining: number;
  /** پرداخت‌ها (کامل/جزئی) با تاریخ؛ paidAt = null یعنی نامشخص */
  payments: { amount: number; paidAt: string | null }[];
  billCreatedAt: string;
  /** تاریخ تسویه (آخرین پرداخت) برای واحد تسویه‌شده */
  settledAt: string | null;
  status: PaymentStatus;
  /** پرداخت‌شده: روز از ثبت قبض تا پرداخت؛ پرداخت‌نشده: روز از ثبت قبض تا امروز؛ تاریخ نامشخص: null */
  days: number | null;
  /** روزهای تأخیر بعد از مهلت پرداخت (برای پرداخت‌نشده‌ها تا امروز) */
  daysLate: number;
}

export type PayerRating = 'good' | 'average' | 'bad' | 'unknown';

export interface PaymentHistory {
  unitNumber: number;
  /** اسم مستعار از جدیدترین قبض دارای این واحد */
  alias: string | null;
  /** جدیدترین دوره اول */
  entries: PaymentEntry[];
  totalBilled: number;
  totalPaid: number;
  totalOwed: number;
  paidCount: number;
  unpaidCount: number;
  onTimeCount: number;
  lateCount: number;
  /** میانگین روز تا پرداخت (فقط پرداخت‌های دارای تاریخ)؛ null اگر داده‌ای نباشد */
  avgDaysToPay: number | null;
  rating: PayerRating;
}

export function paymentHistory(bills: BillWithUnits[], unitNumber: number, now: Date = new Date()): PaymentHistory {
  const entries: PaymentEntry[] = [];
  for (const { bill, units } of bills) {
    const u = units.find((x) => x.unitNumber === unitNumber);
    // واحد بدون سهم (واحد خالی در آن قبض) در سابقه پرداخت حساب نمی‌شود
    if (!u || u.vacant || u.shareAmount === 0) continue;
    let status: PaymentStatus;
    let days: number | null;
    const remaining = remainingAmount(u);
    const payments = unitPayments(u).map((p) => ({ amount: p.amount, paidAt: p.paidAt }));
    const allDated = payments.length > 0 && payments.every((p) => p.paidAt);
    const settledAt = remaining === 0 && allDated ? lastPaidAt(u) : null;
    if (remaining > 0) {
      status = 'unpaid';
      days = daysBetween(bill.createdAt, now);
    } else if (settledAt) {
      days = daysBetween(bill.createdAt, settledAt);
      status = days > PAYMENT_GRACE_DAYS ? 'late' : 'onTime';
    } else {
      status = 'unknownDate';
      days = null;
    }
    entries.push({
      billId: bill.id,
      year: bill.year,
      month: bill.month,
      expenseType: bill.expenseType,
      amount: u.shareAmount,
      paid: paidAmount(u),
      remaining,
      payments,
      billCreatedAt: bill.createdAt,
      settledAt,
      status,
      days,
      daysLate: days === null ? 0 : Math.max(0, days - PAYMENT_GRACE_DAYS),
    });
  }
  entries.sort((a, b) => byPeriod(b, a) || b.billCreatedAt.localeCompare(a.billCreatedAt));

  const paid = entries.filter((e) => e.status !== 'unpaid');
  const dated = entries.filter((e) => e.status === 'onTime' || e.status === 'late');
  const onTimeCount = entries.filter((e) => e.status === 'onTime').length;
  const lateCount = entries.filter((e) => e.status === 'late').length;
  const overdueUnpaid = entries.filter((e) => e.status === 'unpaid' && e.daysLate > 0).length;
  const avgDaysToPay = dated.length ? Math.round((dated.reduce((s, e) => s + (e.days ?? 0), 0) / dated.length) * 10) / 10 : null;
  const totalBilled = entries.reduce((s, e) => s + e.amount, 0);
  const totalPaid = entries.reduce((s, e) => s + e.paid, 0);

  // امتیاز ساده: سهم پرداخت‌های به‌موقع از (پرداخت‌های دارای تاریخ + بدهی‌های گذشته از مهلت)
  const judged = dated.length + overdueUnpaid;
  let rating: PayerRating = 'unknown';
  if (judged > 0) {
    const ratio = onTimeCount / judged;
    rating = ratio >= 0.8 ? 'good' : ratio >= 0.5 ? 'average' : 'bad';
  }

  return {
    unitNumber,
    alias: latestAliases(bills).get(unitNumber) ?? null,
    entries,
    totalBilled,
    totalPaid,
    totalOwed: entries.reduce((s, e) => s + e.remaining, 0),
    paidCount: paid.length,
    unpaidCount: entries.length - paid.length,
    onTimeCount,
    lateCount,
    avgDaysToPay,
    rating,
  };
}

export const RATING_LABELS: Record<PayerRating, string> = {
  good: 'خوش‌حساب',
  average: 'متوسط',
  bad: 'بدحساب',
  unknown: 'بدون داده کافی',
};
