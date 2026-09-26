/** تاریخ شمسی جاری دستگاه (با Intl؛ در صورت عدم پشتیبانی مقدار پیش‌فرض) */
export interface JalaliYM { year: number; month: number }

export function currentJalali(now: Date = new Date()): JalaliYM {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(now);
    const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '', 10);
    const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '', 10);
    if (year > 1300 && year < 1700 && month >= 1 && month <= 12) return { year, month };
  } catch {
    /* ignore */
  }
  return { year: 1405, month: 1 };
}

/** یک سال پیش‌فرض از بین سال‌های فعال انتخاب می‌کند (سال جاری اگر فعال باشد) */
export function pickDefaultYear(activeYears: number[], preferred: number): number {
  if (activeYears.includes(preferred)) return preferred;
  const sorted = [...activeYears].sort((a, b) => a - b);
  const notAfter = sorted.filter((y) => y <= preferred);
  return notAfter.length ? notAfter[notAfter.length - 1] : sorted[0];
}

export interface JalaliDateTime { year: number; month: number; day: number; hour: number; minute: number }

/** تاریخ و ساعت شمسی یک لحظه (به وقت محلی دستگاه) */
export function jalaliDateTime(date: Date = new Date()): JalaliDateTime | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '', 10);
    const r = { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
    if (r.year > 1300 && r.year < 1700 && r.month >= 1 && r.month <= 12 && r.day >= 1 && r.day <= 31) return r;
  } catch {
    /* ignore */
  }
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** مثل 1405-07-04 (ارقام انگلیسی؛ برای نام فایل) */
export function jalaliIsoDate(date: Date = new Date()): string {
  const j = jalaliDateTime(date);
  if (!j) return date.toISOString().slice(0, 10);
  return `${j.year}-${pad2(j.month)}-${pad2(j.day)}`;
}

/** تاریخ شمسی کوتاه مثل 1405/07/04 (ارقام انگلیسی، هماهنگ با سایر اعداد برنامه) */
export function formatJalaliDate(date: Date): string {
  const j = jalaliDateTime(date);
  if (!j) return date.toISOString().slice(0, 10);
  return `${j.year}/${pad2(j.month)}/${pad2(j.day)}`;
}

/** مثل «۱۴۰۵/۰۷/۰۴ ساعت ۱۴:۳۰» */
export function formatJalaliDateTimeFa(date: Date): string {
  const j = jalaliDateTime(date);
  const fa = (s: string) => s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  if (!j) return fa(date.toISOString().slice(0, 16).replace('T', ' '));
  return fa(`${j.year}/${pad2(j.month)}/${pad2(j.day)}`) + ' ساعت ' + fa(`${pad2(j.hour)}:${pad2(j.minute)}`);
}
