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
