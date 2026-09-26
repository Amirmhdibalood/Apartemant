/**
 * توابع خالص فرمت‌دهی/تبدیل اعداد (بدون وابستگی به UI)
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** تبدیل ارقام فارسی/عربی به ارقام انگلیسی (بقیه کاراکترها دست‌نخورده می‌مانند) */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) { out += String(p); continue; }
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) { out += String(a); continue; }
    out += ch;
  }
  return out;
}

/** تبدیل ارقام انگلیسی به فارسی (فقط برای نمایش متن) */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** فقط ارقام انگلیسی را نگه می‌دارد (پس از نرمال‌سازی ارقام فارسی/عربی) */
export function onlyDigits(input: string): string {
  return normalizeDigits(input).replace(/[^0-9]/g, '');
}

/** حذف صفرهای ابتدایی ("000123" → "123"، "000" → "0") */
export function stripLeadingZeros(digits: string): string {
  const s = digits.replace(/^0+(?=\d)/, '');
  return s;
}

/** افزودن جداکننده هزارگان به رشته‌ای از ارقام: "12500000" → "12,500,000" */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** فرمت یک عدد صحیح با جداکننده هزارگان و ارقام انگلیسی */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '';
  const negative = value < 0;
  const digits = String(Math.trunc(Math.abs(value)));
  return (negative ? '-' : '') + groupDigits(digits);
}

/** تبدیل متن ورودی کاربر (با کاما/ارقام فارسی) به عدد؛ اگر خالی/نامعتبر باشد null */
export function parseAmount(input: string): number | null {
  const digits = onlyDigits(input);
  if (digits === '') return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export interface ReformatResult {
  /** ارقام خام (بدون کاما) */
  digits: string;
  /** متن نمایشی با کاما */
  display: string;
  /** موقعیت جدید مکان‌نما در متن نمایشی */
  caret: number;
}

/**
 * فرمت مجدد فیلد مبلغ هنگام تایپ، با حفظ موقعیت مکان‌نما.
 * ایده: تعداد «ارقام» قبل از مکان‌نما را می‌شماریم و پس از فرمت، مکان‌نما را
 * بعد از همان تعداد رقم قرار می‌دهیم. به این ترتیب تایپ پشت‌سرهم هر تعداد رقم
 * (و حذف/درج در وسط عدد) بدون پرش مکان‌نما کار می‌کند.
 */
export function reformatAmountInput(rawValue: string, rawCaret: number): ReformatResult {
  const normalized = normalizeDigits(rawValue);
  const caret = Math.max(0, Math.min(rawCaret, normalized.length));
  const digitsBeforeCaretRaw = onlyDigits(normalized.slice(0, caret)).length;
  const allDigits = onlyDigits(normalized);
  const digits = stripLeadingZeros(allDigits);
  const removedZeros = allDigits.length - digits.length;
  const digitsBeforeCaret = Math.max(0, digitsBeforeCaretRaw - removedZeros);
  const display = groupDigits(digits);

  let newCaret = 0;
  let seen = 0;
  if (digitsBeforeCaret > 0) {
    for (let i = 0; i < display.length; i++) {
      if (/\d/.test(display[i])) seen++;
      if (seen === digitsBeforeCaret) { newCaret = i + 1; break; }
    }
    if (seen < digitsBeforeCaret) newCaret = display.length;
  }
  return { digits, display, caret: newCaret };
}

/** نرمال‌سازی ورودی تعداد نفرات: فقط ارقام انگلیسی، حداکثر ۴ رقم */
export function sanitizePersonCount(input: string): string {
  return stripLeadingZeros(onlyDigits(input)).slice(0, 4);
}
