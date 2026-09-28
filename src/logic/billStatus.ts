/**
 * رنگ و وضعیت نمایشی قبض در «سوابق» و سربرگ جزئیات (از نسخه ۱.۵.۰) — منطق خالص.
 * - پرداخت‌شده → سبز روشن
 * - پرداخت‌نشده → آبی روشن
 * - پرداخت‌نشده و نزدیک/گذشته از مهلت پرداخت (حداکثر DUE_SOON_DAYS روز مانده یا گذشته) → قرمز روشن
 * - حذف‌شده → خاکستری
 * این رنگ‌ها فقط در برنامه‌اند و در تصویر اشتراکی قبض نمایش داده نمی‌شوند.
 */
import type { Bill } from '../models/types';
import { isBillDeleted, isBillPaid } from './billPaid';
import { jalaliDiffDays, parseJalaliKey, type JalaliDate } from './jalali';
import { toPersianDigits } from './formatting';

/** «نزدیک مهلت» = حداکثر این تعداد روز تا مهلت پرداخت مانده (یا گذشته است) */
export const DUE_SOON_DAYS = 3;

/** پیش‌فرض مهلت پرداخت هنگام افزودن: امروز + این تعداد روز */
export const DEFAULT_DUE_OFFSET_DAYS = 7;

export type BillTone = 'paid' | 'unpaid' | 'due' | 'deleted';

type StatusBill = Pick<Bill, 'billPaid' | 'dueDate' | 'deletedAt'>;

/** تعداد روز مانده تا مهلت پرداخت (منفی = گذشته)، یا null اگر مهلت ندارد */
export function daysUntilDue(bill: Pick<Bill, 'dueDate'>, today: JalaliDate): number | null {
  const due = parseJalaliKey(bill.dueDate);
  return due ? jalaliDiffDays(today, due) : null;
}

export function billTone(bill: StatusBill, today: JalaliDate): BillTone {
  if (isBillDeleted(bill)) return 'deleted';
  if (isBillPaid(bill)) return 'paid';
  const d = daysUntilDue(bill, today);
  return d !== null && d <= DUE_SOON_DAYS ? 'due' : 'unpaid';
}

/** متن کوتاه مهلت، مثل «۲ روز تا مهلت پرداخت» / «مهلت پرداخت امروز» / «۳ روز از مهلت گذشته» */
export function dueText(bill: Pick<Bill, 'dueDate'>, today: JalaliDate): string | null {
  const d = daysUntilDue(bill, today);
  if (d === null) return null;
  if (d === 0) return 'مهلت پرداخت امروز';
  if (d === 1) return 'مهلت پرداخت فردا';
  if (d > 0) return `${toPersianDigits(d)} روز تا مهلت پرداخت`;
  return `${toPersianDigits(-d)} روز از مهلت گذشته`;
}

/** برچسب نشان وضعیت کارت قبض */
export function toneLabel(tone: BillTone): string {
  switch (tone) {
    case 'paid': return 'پرداخت شد';
    case 'due': return 'نزدیک/گذشته از مهلت';
    case 'deleted': return 'حذف‌شده';
    default: return 'پرداخت نشده';
  }
}

/** راهنمای رنگ‌ها بالای فهرست سوابق */
export const TONE_LEGEND: { tone: BillTone; label: string }[] = [
  { tone: 'paid', label: 'پرداخت‌شده' },
  { tone: 'unpaid', label: 'پرداخت‌نشده' },
  { tone: 'due', label: `مهلت نزدیک (${toPersianDigits(DUE_SOON_DAYS)} روز یا کمتر) یا گذشته` },
];
