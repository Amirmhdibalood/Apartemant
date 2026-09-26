/** منطق سال‌های فعال */
import { FIRST_YEAR, LAST_YEAR } from '../models/constants';
import { toPersianDigits } from './formatting';

export function yearRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

/**
 * فعال/غیرفعال کردن یک سال. اگر با این کار هیچ سال فعالی باقی نماند null برمی‌گرداند
 * (حداقل یک سال همیشه باید فعال بماند).
 */
export function toggleYear(active: number[], year: number): number[] | null {
  if (active.includes(year)) {
    if (active.length <= 1) return null;
    return active.filter((y) => y !== year);
  }
  return [...active, year].sort((a, b) => a - b);
}

/** همه سال‌های قابل انتخاب در تنظیمات: ۱۴۰۵ تا ۱۵۰۵ */
export function selectableYears(): number[] {
  return yearRange(FIRST_YEAR, LAST_YEAR);
}

/**
 * مهاجرت/پاک‌سازی سال‌های فعال ذخیره‌شده: فقط سال‌های صحیح در بازه ۱۴۰۵ تا ۱۵۰۵ باقی می‌مانند
 * (مثلاً ۱۴۰۳ و ۱۴۰۴ نسخه‌های قبلی حذف می‌شوند). اگر هیچ سالی باقی نماند، ۱۴۰۵ فعال می‌شود.
 */
export function migrateActiveYears(input: unknown): number[] {
  const list = Array.isArray(input) ? input : [];
  const valid = list.filter((y): y is number => Number.isInteger(y) && y >= FIRST_YEAR && y <= LAST_YEAR);
  const out = Array.from(new Set(valid)).sort((a, b) => a - b);
  return out.length ? out : [FIRST_YEAR];
}

/**
 * سال‌های کشوی «سوابق»: سال‌های فعال + سال‌هایی که قبض ذخیره‌شده دارند
 * (تا قبض‌های سال‌های قدیمی‌تر مثل ۱۴۰۴ همچنان قابل مشاهده باشند).
 */
export function recordYearOptions(activeYears: number[], billYears: number[]): number[] {
  return Array.from(new Set([...activeYears, ...billYears])).sort((a, b) => a - b);
}

/** خلاصه سال‌های فعال، مثلاً «۱۴۰۵، ۱۴۰۶ و ۲ سال دیگر» */
export function activeYearsSummary(active: number[], max = 3): string {
  const sorted = [...active].sort((a, b) => a - b);
  const shown = sorted.slice(0, max).map((y) => toPersianDigits(y)).join('، ');
  const rest = sorted.length - max;
  return rest > 0 ? `${shown} و ${toPersianDigits(rest)} سال دیگر` : shown;
}
