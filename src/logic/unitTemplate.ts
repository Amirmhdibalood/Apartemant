/**
 * الگوی واحدها: تعداد نفرات واحدهای آخرین قبض ذخیره‌شده، تا قبض جدید با همان واحدها پر شود.
 * (منطق خالص و قابل تست)
 */
import type { BillWithUnits } from '../models/types';

export const MAX_TEMPLATE_UNITS = 500;

/** اعتبارسنجی الگو: آرایه‌ای از اعداد صحیح ۱ تا ۱٬۰۰۰٬۰۰۰ (حداکثر ۵۰۰ واحد)؛ در غیر این صورت null */
export function sanitizeUnitTemplate(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TEMPLATE_UNITS) return null;
  if (!input.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 && n <= 1000000)) return null;
  return [...(input as number[])];
}

/** الگو از روی قبض‌ها: واحدهای جدیدترین قبض ثبت‌شده (بر اساس زمان ثبت) به ترتیب شماره واحد */
export function templateFromBills(bills: BillWithUnits[]): number[] | null {
  if (bills.length === 0) return null;
  const latest = bills.reduce((a, b) => (b.bill.createdAt > a.bill.createdAt ? b : a));
  const counts = [...latest.units].sort((a, b) => a.unitNumber - b.unitNumber).map((u) => u.personCount);
  return sanitizeUnitTemplate(counts);
}
