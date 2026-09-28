/**
 * گزارش «پرداخت قبض‌ها» (از نسخه ۱.۵.۰) — منطق خالص.
 * برای قبض‌های حذف‌نشده سال انتخاب‌شده (و نوع هزینه اختیاری) که مهلت پرداخت دارند یا پرداخت شده‌اند:
 * مهلت پرداخت، تاریخ پرداخت و وضعیت: زودتر از مهلت / سر موعد / با تأخیر (X روز) / در انتظار / گذشته از مهلت.
 */
import type { Bill, BillWithUnits, ExpenseType } from '../models/types';
import { isBillDeleted, isBillPaid } from './billPaid';
import { jalaliDiffDays, parseJalaliKey, type JalaliDate } from './jalali';
import { toPersianDigits } from './formatting';

export type PaymentTiming =
  | 'early' // زودتر از مهلت
  | 'onTime' // سر موعد
  | 'late' // با تأخیر
  | 'paidNoDue' // پرداخت‌شده، بدون مهلت
  | 'paidUnknown' // پرداخت‌شده، تاریخ نامشخص
  | 'pending' // پرداخت‌نشده، مهلت نرسیده
  | 'overdue'; // پرداخت‌نشده، مهلت گذشته

export interface BillPaymentRow {
  bill: Bill;
  dueDate: JalaliDate | null;
  paidDate: JalaliDate | null;
  timing: PaymentTiming;
  /** روزهای زودتر/تأخیر/مانده/گذشته (همیشه مثبت یا صفر؛ برای وضعیت‌های بدون روز null) */
  days: number | null;
  label: string;
}

export interface BillPaymentSummary {
  total: number;
  /** زودتر از مهلت + سر موعد */
  onTime: number;
  early: number;
  exact: number;
  late: number;
  /** پرداخت‌نشده (در انتظار + گذشته از مهلت) */
  unpaid: number;
  overdue: number;
  /** میانگین روز تأخیر پرداخت‌های با تأخیر */
  avgLateDays: number | null;
}

const fa = (n: number) => toPersianDigits(n);

export function timingLabel(timing: PaymentTiming, days: number | null): string {
  switch (timing) {
    case 'early': return `زودتر از مهلت (${fa(days ?? 0)} روز)`;
    case 'onTime': return 'سر موعد';
    case 'late': return `با تأخیر (${fa(days ?? 0)} روز)`;
    case 'paidNoDue': return 'پرداخت‌شده (بدون مهلت)';
    case 'paidUnknown': return 'پرداخت‌شده (تاریخ نامشخص)';
    case 'pending': return days === 0 ? 'پرداخت‌نشده — مهلت امروز' : `پرداخت‌نشده — ${fa(days ?? 0)} روز مانده`;
    default: return `پرداخت‌نشده — ${fa(days ?? 0)} روز از مهلت گذشته`;
  }
}

export function classifyBillPayment(bill: Bill, today: JalaliDate): BillPaymentRow | null {
  if (isBillDeleted(bill)) return null;
  const dueDate = parseJalaliKey(bill.dueDate);
  const paid = isBillPaid(bill);
  const paidDate = paid ? parseJalaliKey(bill.billPaidDate) : null;
  if (!dueDate && !paid) return null;
  let timing: PaymentTiming;
  let days: number | null = null;
  if (paid) {
    if (!paidDate) timing = 'paidUnknown';
    else if (!dueDate) timing = 'paidNoDue';
    else {
      const diff = jalaliDiffDays(dueDate, paidDate); // مثبت = بعد از مهلت
      timing = diff < 0 ? 'early' : diff === 0 ? 'onTime' : 'late';
      days = Math.abs(diff);
    }
  } else {
    const left = jalaliDiffDays(today, dueDate!);
    timing = left >= 0 ? 'pending' : 'overdue';
    days = Math.abs(left);
  }
  return { bill, dueDate, paidDate, timing, days, label: timingLabel(timing, days) };
}

export interface BillPaymentReport { rows: BillPaymentRow[]; summary: BillPaymentSummary }

/** سطرهای گزارش (به ترتیب مهلت/ماه، جدیدترین اول) + خلاصه */
export function billPaymentReport(
  all: BillWithUnits[], year: number, type: ExpenseType | null, today: JalaliDate,
): BillPaymentReport {
  const rows = all
    .filter(({ bill }) => bill.year === year && (type === null || bill.expenseType === type))
    .map(({ bill }) => classifyBillPayment(bill, today))
    .filter((r): r is BillPaymentRow => r !== null)
    .sort((a, b) => b.bill.month - a.bill.month
      || (b.bill.dueDate ?? '').localeCompare(a.bill.dueDate ?? '')
      || b.bill.createdAt.localeCompare(a.bill.createdAt));
  const count = (t: PaymentTiming) => rows.filter((r) => r.timing === t).length;
  const late = rows.filter((r) => r.timing === 'late');
  const early = count('early');
  const exact = count('onTime');
  const summary: BillPaymentSummary = {
    total: rows.length,
    early,
    exact,
    onTime: early + exact,
    late: late.length,
    unpaid: count('pending') + count('overdue'),
    overdue: count('overdue'),
    avgLateDays: late.length ? Math.round((late.reduce((s, r) => s + (r.days ?? 0), 0) / late.length) * 10) / 10 : null,
  };
  return { rows, summary };
}
