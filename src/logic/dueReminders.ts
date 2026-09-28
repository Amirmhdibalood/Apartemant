/**
 * یادآوری مهلت پرداخت قبض با اعلان محلی (از نسخه ۱.۵.۰) — محاسبه خالص اعلان‌هایی که باید زمان‌بندی شوند.
 * قاعده: یک روز قبل از «مهلت پرداخت» قبض ساعت ۹:۰۰ به وقت محلی گوشی، فقط برای قبض پرداخت‌نشده و حذف‌نشده؛
 * اگر زمان یادآوری گذشته باشد (مهلت کمتر از یک روز دیگر است) اعلانی زمان‌بندی نمی‌شود.
 */
import type { Bill } from '../models/types';
import { EXPENSE_TYPES, monthName } from '../models/constants';
import { isBillDeleted, isBillPaid } from './billPaid';
import { addJalaliDays, jalaliToGregorian, parseJalaliKey } from './jalali';
import { toPersianDigits } from './formatting';

export const REMINDER_DAYS_BEFORE = 1;
export const REMINDER_HOUR = 9;
export const REMINDER_CHANNEL_ID = 'due-reminders';

export interface DueReminder {
  /** شناسه عددی پایدار اعلان (از روی شناسه قبض) */
  id: number;
  billId: string;
  /** زمان اعلان (وقت محلی گوشی) */
  at: Date;
  title: string;
  body: string;
}

/** شناسه عددی مثبت ۳۱ بیتی و پایدار برای هر قبض (FNV-1a) */
export function reminderIdFor(billId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < billId.length; i++) {
    h ^= billId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 1) || 1;
}

/** متن اعلان، مثل «یادآوری: فردا مهلت پرداخت قبض گاز (مهر ۱۴۰۵) است» */
export function reminderBody(bill: Pick<Bill, 'expenseType' | 'month' | 'year'>): string {
  const label = EXPENSE_TYPES[bill.expenseType]?.label ?? '';
  return `یادآوری: فردا مهلت پرداخت قبض ${label} (${monthName(bill.month)} ${toPersianDigits(bill.year)}) است`;
}

/** یادآوری یک قبض یا null (پرداخت‌شده، حذف‌شده، بدون مهلت یا زمان گذشته) */
export function reminderFor(bill: Bill, now: Date): DueReminder | null {
  if (isBillPaid(bill) || isBillDeleted(bill)) return null;
  const due = parseJalaliKey(bill.dueDate);
  if (!due) return null;
  const g = jalaliToGregorian(addJalaliDays(due, -REMINDER_DAYS_BEFORE));
  const at = new Date(g.year, g.month - 1, g.day, REMINDER_HOUR, 0, 0, 0);
  if (at.getTime() <= now.getTime()) return null;
  return { id: reminderIdFor(bill.id), billId: bill.id, at, title: 'مهلت پرداخت قبض', body: reminderBody(bill) };
}

/** همه یادآوری‌هایی که باید زمان‌بندی شوند (به ترتیب زمان) */
export function planReminders(bills: Bill[], now: Date): DueReminder[] {
  return bills
    .map((b) => reminderFor(b, now))
    .filter((r): r is DueReminder => r !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
