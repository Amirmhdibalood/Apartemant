/**
 * گزارش «پرداخت قبض‌ها» (از نسخه ۱.۵.۰) — منطق خالص.
 * برای همهٔ قبض‌های حذف‌نشده سال انتخاب‌شده (و نوع هزینه اختیاری):
 * مهلت پرداخت، تاریخ پرداخت و وضعیت: زودتر از مهلت / سر موعد / با تأخیر (X روز) / در انتظار / گذشته از مهلت.
 * (از ۱.۶.۱۴) قبض **بدون مهلت** هم دیده می‌شود: فقط بر اساس «پرداخت شد» یا «پرداخت‌شده» است یا «پرداخت‌نشده»؛
 * هر قبض دقیقاً در یکی از این دو دسته است (paid + unpaid = total) و چیزی مبتنی بر مهلت (تأخیر، گذشته از مهلت) برایش حساب نمی‌شود.
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
  | 'overdue' // پرداخت‌نشده، مهلت گذشته
  | 'unpaidNoDue'; // پرداخت‌نشده، بدون مهلت (فقط پرداخت‌نشده است؛ هرگز «گذشته از مهلت» نمی‌شود)

/** وضعیت‌های «پرداخت‌شده» (بقیه همه «پرداخت‌نشده»‌اند) */
export const PAID_TIMINGS: readonly PaymentTiming[] = ['early', 'onTime', 'late', 'paidNoDue', 'paidUnknown'];
export const isPaidTiming = (t: PaymentTiming): boolean => PAID_TIMINGS.includes(t);

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
  /** پرداخت‌شده (همهٔ حالت‌ها، از جمله بدون مهلت/بدون تاریخ) */
  paid: number;
  /** پرداخت‌شده‌های بدون مهلت یا بدون تاریخ پرداخت (نه به‌موقع نه با تأخیر قابل قضاوت) */
  paidUndated: number;
  /** پرداخت‌نشده (در انتظار + گذشته از مهلت + بدون مهلت)؛ paid + unpaid = total */
  unpaid: number;
  overdue: number;
  /** پرداخت‌نشده‌های بدون مهلت (بخشی از unpaid) */
  unpaidNoDue: number;
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
    case 'unpaidNoDue': return 'پرداخت‌نشده (بدون مهلت)';
    default: return `پرداخت‌نشده — ${fa(days ?? 0)} روز از مهلت گذشته`;
  }
}

export function classifyBillPayment(bill: Bill, today: JalaliDate): BillPaymentRow | null {
  if (isBillDeleted(bill)) return null;
  const dueDate = parseJalaliKey(bill.dueDate);
  const paid = isBillPaid(bill);
  const paidDate = paid ? parseJalaliKey(bill.billPaidDate) : null;
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
  } else if (!dueDate) {
    timing = 'unpaidNoDue'; // بدون مهلت: فقط «پرداخت‌نشده»
  } else {
    const left = jalaliDiffDays(today, dueDate);
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
    paid: rows.filter((r) => isPaidTiming(r.timing)).length,
    paidUndated: count('paidNoDue') + count('paidUnknown'),
    unpaid: count('pending') + count('overdue') + count('unpaidNoDue'),
    overdue: count('overdue'),
    unpaidNoDue: count('unpaidNoDue'),
    avgLateDays: late.length ? Math.round((late.reduce((s, r) => s + (r.days ?? 0), 0) / late.length) * 10) / 10 : null,
  };
  return { rows, summary };
}

/** فیلتر وضعیت گزارش «پرداخت قبض‌ها» (از ۱.۶.۴): کارت‌های خلاصه همان فیلتر هستند */
export type PaymentStatusFilter = 'all' | 'paid' | 'onTime' | 'late' | 'unpaid';

export const PAYMENT_STATUS_LABEL: Record<PaymentStatusFilter, string> = {
  all: 'همه', paid: 'پرداخت‌شده', onTime: 'به‌موقع', late: 'با تأخیر', unpaid: 'پرداخت‌نشده',
};

/**
 * پرداخت‌شده = همهٔ پرداخت‌شده‌ها (به‌موقع + با تأخیر + بدون مهلت/تاریخ)؛ پرداخت‌نشده = در انتظار + گذشته از مهلت + بدون مهلت؛
 * به‌موقع = زودتر + سر موعد. «پرداخت‌شده» و «پرداخت‌نشده» یکدیگر را کامل می‌کنند (هر قبض در دقیقاً یکی).
 */
export function matchesPaymentStatus(row: Pick<BillPaymentRow, 'timing'>, status: PaymentStatusFilter): boolean {
  switch (status) {
    case 'onTime': return row.timing === 'early' || row.timing === 'onTime';
    case 'late': return row.timing === 'late';
    case 'paid': return isPaidTiming(row.timing);
    case 'unpaid': return !isPaidTiming(row.timing);
    default: return true;
  }
}

export function filterPaymentRows<T extends Pick<BillPaymentRow, 'timing'>>(rows: T[], status: PaymentStatusFilter): T[] {
  return status === 'all' ? rows : rows.filter((r) => matchesPaymentStatus(r, status));
}

/** لمس کارتِ فعال، فیلتر را برمی‌دارد (همه)؛ لمس کارت دیگر آن را فعال می‌کند */
export function toggleStatusFilter(current: PaymentStatusFilter, tapped: PaymentStatusFilter): PaymentStatusFilter {
  return current === tapped ? 'all' : tapped;
}
