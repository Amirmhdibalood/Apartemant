/**
 * هشدار مهلت پرداخت داخل برنامه (از نسخه ۱.۵.۱) — منطق خالص.
 * برای هر قبض پرداخت‌نشده و حذف‌نشده که «مهلت پرداخت» آن فرداست، امروز است یا گذشته، یک کارت هشدار قرمز روشن
 * بالای صفحه اصلی نمایش داده می‌شود (بدون اعلان سیستمی و بدون هیچ مجوز اندروید).
 * بستن هر کارت فقط برای همان اجرای برنامه است؛ در اجرای بعدی، اگر هنوز صدق کند، دوباره نمایش داده می‌شود.
 */
import type { Bill } from '../models/types';
import { EXPENSE_TYPES, monthName } from '../models/constants';
import { isBillDeleted, isBillPaid } from './billPaid';
import { daysUntilDue } from './billStatus';
import type { JalaliDate } from './jalali';
import { toPersianDigits } from './formatting';

/** از چند روز قبل از مهلت هشدار نمایش داده شود (۱ = از فردا) */
export const ALERT_DAYS_BEFORE = 1;

export type DueAlertKind = 'tomorrow' | 'today' | 'overdue';

export interface DueAlert {
  /** کلید یکتا (قبض + مهلت)؛ با تغییر مهلت، کارت بسته‌شده دوباره نمایش داده می‌شود */
  key: string;
  billId: string;
  kind: DueAlertKind;
  /** روز گذشته از مهلت (برای overdue)، در غیر این صورت ۰ */
  overdueDays: number;
  text: string;
}

const billLabel = (bill: Pick<Bill, 'expenseType' | 'month' | 'year'>) =>
  `${EXPENSE_TYPES[bill.expenseType]?.label ?? ''} (${monthName(bill.month)} ${toPersianDigits(bill.year)})`;

/** متن هشدار، مثل «فردا مهلت پرداخت قبض گاز (مهر ۱۴۰۵) است» */
export function dueAlertText(bill: Pick<Bill, 'expenseType' | 'month' | 'year'>, kind: DueAlertKind, overdueDays = 0): string {
  const label = billLabel(bill);
  if (kind === 'tomorrow') return `فردا مهلت پرداخت قبض ${label} است`;
  if (kind === 'today') return `امروز آخرین مهلت پرداخت قبض ${label} است`;
  return `مهلت پرداخت قبض ${label} ${toPersianDigits(overdueDays)} روز گذشته است`;
}

/** هشدار یک قبض یا null (پرداخت‌شده، حذف‌شده، بدون مهلت یا مهلت بیش از یک روز دیگر) */
export function dueAlertFor(bill: Bill, today: JalaliDate): DueAlert | null {
  if (isBillPaid(bill) || isBillDeleted(bill)) return null;
  const d = daysUntilDue(bill, today);
  if (d === null || d > ALERT_DAYS_BEFORE) return null;
  const kind: DueAlertKind = d === 1 ? 'tomorrow' : d === 0 ? 'today' : 'overdue';
  const overdueDays = d < 0 ? -d : 0;
  return { key: `${bill.id}@${bill.dueDate}`, billId: bill.id, kind, overdueDays, text: dueAlertText(bill, kind, overdueDays) };
}

/** همه هشدارها؛ فوری‌ترین اول (بیشترین روز گذشته، سپس امروز، سپس فردا) */
export function selectDueAlerts(bills: Bill[], today: JalaliDate): DueAlert[] {
  const order = (a: DueAlert) => (a.kind === 'overdue' ? -a.overdueDays : a.kind === 'today' ? 0 : 1);
  return bills
    .map((b) => dueAlertFor(b, today))
    .filter((a): a is DueAlert => a !== null)
    .sort((a, b) => order(a) - order(b) || a.billId.localeCompare(b.billId));
}

/** حذف هشدارهایی که در همین اجرای برنامه بسته شده‌اند */
export function withoutDismissed(alerts: DueAlert[], dismissed: ReadonlySet<string>): DueAlert[] {
  return alerts.filter((a) => !dismissed.has(a.key));
}
