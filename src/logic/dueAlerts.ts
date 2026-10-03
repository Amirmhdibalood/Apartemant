/**
 * هشدار/اعلان مهلت پرداخت داخل برنامه (از نسخه ۱.۵.۱؛ مرکز اعلان‌ها با زنگوله از ۱.۶.۴) — منطق خالص.
 * برای هر قبض پرداخت‌نشده و حذف‌نشده که «مهلت پرداخت» آن ۲ روز دیگر، فردا، امروز یا گذشته است، یک اعلان ساخته می‌شود
 * (بدون اعلان سیستمی و بدون هیچ مجوز اندروید). همه اعلان‌ها زیر زنگوله می‌مانند تا قبض پرداخت یا حذف شود؛
 * کارت بنر صفحه اصلی را می‌شود بست (فقط تا اجرای بعدی) و اعلانِ زنگوله را حذف نمی‌کند.
 */
import type { Bill } from '../models/types';
import { EXPENSE_TYPES, monthName } from '../models/constants';
import { isBillDeleted, isBillPaid } from './billPaid';
import { daysUntilDue } from './billStatus';
import type { JalaliDate } from './jalali';
import { toPersianDigits } from './formatting';

/** از چند روز قبل از مهلت اعلان نمایش داده شود (۲ = از ۲ روز قبل) */
export const ALERT_DAYS_BEFORE = 2;

export type DueAlertKind = 'in2days' | 'tomorrow' | 'today' | 'overdue';

export interface DueAlert {
  /** کلید یکتا (قبض + مهلت)؛ با تغییر مهلت، کارت بسته‌شده دوباره نمایش داده می‌شود */
  key: string;
  billId: string;
  kind: DueAlertKind;
  /** روز گذشته از مهلت (برای overdue)، در غیر این صورت ۰ */
  overdueDays: number;
  text: string;
  /** برای آیکون و عنوان در مرکز اعلان‌ها */
  expenseType: Bill['expenseType'];
  /** مثل «گاز (مهر ۱۴۰۵)» */
  title: string;
  dueDate: string | null;
  /** روز تا مهلت (منفی = گذشته) */
  days: number;
}

export const billLabel = (bill: Pick<Bill, 'expenseType' | 'month' | 'year'>) =>
  `${EXPENSE_TYPES[bill.expenseType]?.label ?? ''} (${monthName(bill.month)} ${toPersianDigits(bill.year)})`;

/** متن هشدار، مثل «فردا مهلت پرداخت قبض گاز (مهر ۱۴۰۵) است» */
export function dueAlertText(bill: Pick<Bill, 'expenseType' | 'month' | 'year'>, kind: DueAlertKind, overdueDays = 0): string {
  const label = billLabel(bill);
  if (kind === 'in2days') return `۲ روز دیگر مهلت پرداخت قبض ${label} است`;
  if (kind === 'tomorrow') return `فردا مهلت پرداخت قبض ${label} است`;
  if (kind === 'today') return `امروز آخرین مهلت پرداخت قبض ${label} است`;
  return `مهلت پرداخت قبض ${label} ${toPersianDigits(overdueDays)} روز گذشته است`;
}

/** هشدار یک قبض یا null (پرداخت‌شده، حذف‌شده، بدون مهلت یا مهلت بیش از ۲ روز دیگر) */
export function dueAlertFor(bill: Bill, today: JalaliDate): DueAlert | null {
  if (isBillPaid(bill) || isBillDeleted(bill)) return null;
  const d = daysUntilDue(bill, today);
  if (d === null || d > ALERT_DAYS_BEFORE) return null;
  const kind: DueAlertKind = d === 2 ? 'in2days' : d === 1 ? 'tomorrow' : d === 0 ? 'today' : 'overdue';
  const overdueDays = d < 0 ? -d : 0;
  return { key: `${bill.id}@${bill.dueDate}`, billId: bill.id, kind, overdueDays, text: dueAlertText(bill, kind, overdueDays),
    expenseType: bill.expenseType, title: billLabel(bill), dueDate: bill.dueDate ?? null, days: d,
  };
}

/** همه هشدارها؛ فوری‌ترین اول (بیشترین روز گذشته، سپس امروز، فردا، ۲ روز دیگر) */
export function selectDueAlerts(bills: Bill[], today: JalaliDate): DueAlert[] {
  const order = (a: DueAlert) => (a.kind === 'overdue' ? -a.overdueDays : a.kind === 'today' ? 0 : a.kind === 'tomorrow' ? 1 : 2);
  return bills
    .map((b) => dueAlertFor(b, today))
    .filter((a): a is DueAlert => a !== null)
    .sort((a, b) => order(a) - order(b) || a.billId.localeCompare(b.billId));
}

/** حذف هشدارهایی که در همین اجرای برنامه بسته شده‌اند */
export function withoutDismissed(alerts: DueAlert[], dismissed: ReadonlySet<string>): DueAlert[] {
  return alerts.filter((a) => !dismissed.has(a.key));
}

export const ALERT_KIND_ORDER: DueAlertKind[] = ['overdue', 'today', 'tomorrow', 'in2days'];
export const ALERT_SECTION_TITLE: Record<DueAlertKind, string> = {
  overdue: 'سررسید گذشته', today: 'امروز', tomorrow: 'فردا', in2days: 'دو روز دیگر',
};

/** نشان کوتاه هر اعلان: «۳ روز گذشته»، «امروز»، «فردا»، «۲ روز دیگر» */
export function alertChipText(a: Pick<DueAlert, 'kind' | 'overdueDays'>): string {
  if (a.kind === 'overdue') return `${toPersianDigits(a.overdueDays)} روز گذشته`;
  return a.kind === 'today' ? 'امروز' : a.kind === 'tomorrow' ? 'فردا' : '۲ روز دیگر';
}

/** گروه‌بندی برای فهرست اعلان‌ها (ترتیب: گذشته، امروز، فردا، ۲ روز دیگر)؛ گروه خالی حذف می‌شود */
export function groupAlerts(alerts: DueAlert[]): { kind: DueAlertKind; title: string; items: DueAlert[] }[] {
  return ALERT_KIND_ORDER
    .map((kind) => ({ kind, title: ALERT_SECTION_TITLE[kind], items: alerts.filter((a) => a.kind === kind) }))
    .filter((g) => g.items.length > 0);
}

/**
 * بنر صفحه اصلی بر اساس حالت نمایش اعلان‌ها:
 *  - «پنجره پایین» (sheet): فقط فوری‌ترین مورد + «و N اعلان دیگر — مشاهده همه»
 *  - «پنل کشویی» (dropdown): همه کارت‌ها مثل قبل
 */
export function bannerFor(visible: DueAlert[], mode: 'sheet' | 'dropdown'): { shown: DueAlert[]; more: number } {
  if (mode === 'sheet' && visible.length > 1) return { shown: visible.slice(0, 1), more: visible.length - 1 };
  return { shown: visible, more: 0 };
}
