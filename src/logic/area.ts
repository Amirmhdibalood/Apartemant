/**
 * متراژ واحدها (از نسخه ۱.۶.۵) — منطق خالص و قابل تست.
 *
 * - متراژ بر حسب مترمربع است و اعشار (حداکثر ۳ رقم) مجاز است؛ مثل «۷۵٫۵».
 * - برای محاسبه، متراژ «امن» به عدد صحیح (هزارم مترمربع) مقیاس می‌شود (۷۵٫۵ ← ۷۵۵۰۰)؛
 *   تقسیم با همان الگوریتم «بزرگ‌ترین باقیمانده» و BigInt انجام می‌شود، پس جمع سهم‌ها همیشه دقیقاً برابر مبلغ کل است.
 * - نبودن متراژ (null) = وارد نشده؛ فقط تقسیم «بر اساس متراژ» به آن نیاز دارد.
 */
import { normalizeDigits, toPersianDigits } from './formatting';

export const AREA_DECIMALS = 3;
export const AREA_SCALE = 10 ** AREA_DECIMALS;
/** حداکثر متراژ یک واحد (مترمربع) */
export const MAX_AREA = 100000;

/** ورودی حین تایپ: ارقام فارسی/عربی → انگلیسی، «٫» «،» «,» «/» → نقطه، فقط یک نقطه، حداکثر ۳ رقم اعشار و ۶ رقم صحیح */
export function sanitizeAreaInput(input: string): string {
  const s = normalizeDigits(input).replace(/[٫،,/]/g, '.').replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  let intPart = dot < 0 ? s : s.slice(0, dot);
  const frac = dot < 0 ? null : s.slice(dot + 1).replace(/\./g, '').slice(0, AREA_DECIMALS);
  intPart = intPart.replace(/^0+(?=\d)/, '').slice(0, 6);
  if (frac === null) return intPart;
  return (intPart === '' ? '0' : intPart) + '.' + frac;
}

/** مقدار معتبر متراژ (عدد مثبت، حداکثر ۳ رقم اعشار، ≤ MAX_AREA)؛ در غیر این صورت null */
export function parseArea(input: unknown): number | null {
  let n: number;
  if (typeof input === 'number') n = input;
  else if (typeof input === 'string') {
    // سخت‌گیرانه: کاراکتر اضافه (مثل «-» یا «e») نامعتبر است؛ فقط ارقام و یک ممیز
    const t = normalizeDigits(input.trim()).replace(/[٫،,/]/g, '.').replace(/\.$/, '');
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(t)) return null;
    n = Number(t);
  } else return null;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AREA) return null;
  const milli = Math.round(n * AREA_SCALE);
  if (milli <= 0 || Math.abs(n * AREA_SCALE - milli) > 1e-6) return null; // بیش از ۳ رقم اعشار
  return milli / AREA_SCALE;
}

/** متراژ ← عدد صحیح (هزارم مترمربع) برای محاسبه */
export function areaToMilli(area: number): number {
  return Math.round(area * AREA_SCALE);
}

/** رشته ویرایشی متراژ ذخیره‌شده: ۷۵ ← «75»، ۷۵٫۵ ← «75.5»؛ نبودن ← «» */
export function areaToInput(area: number | null | undefined): string {
  const a = parseArea(area ?? null);
  return a === null ? '' : String(a);
}

/** نمایش متراژ (ارقام فارسی، ممیز «٫»، بدون صفر اضافه): ۷۵٫۵ ← «۷۵٫۵»، ۱۲۰۰ ← «۱٬۲۰۰» */
export function formatArea(area: number): string {
  const [i, f] = String(area).split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return toPersianDigits(grouped + (f ? '٫' + f : ''));
}

/** جمع متراژ واحدهای غیرخالی که متراژ معتبر دارند (مترمربع، بدون خطای اعشار) */
export function sumAreas(areas: (string | number | null | undefined)[], vacant?: boolean[]): number {
  let milli = 0;
  areas.forEach((a, i) => {
    if (vacant?.[i]) return;
    const p = parseArea(a ?? null);
    if (p !== null) milli += areaToMilli(p);
  });
  return milli / AREA_SCALE;
}

/** شماره‌های (۱-مبنا) واحدهای غیرخالی که متراژ معتبر ندارند */
export function unitsMissingArea(areas: (string | number | null | undefined)[], vacant: boolean[] | undefined, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    if (vacant?.[i]) continue;
    if (parseArea(areas[i] ?? null) === null) out.push(i + 1);
  }
  return out;
}
