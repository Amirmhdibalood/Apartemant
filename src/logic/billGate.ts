/**
 * شرط‌های شروع «ثبت قبض جدید»: دست‌کم یک سالِ باز در «دوره‌ها ← سال‌ها» برای ساختمان فعال،
 * و اگر کلید «مدیر ساختمان» روشن است، مدیرِ فعال (دورهٔ مدیریتِ بازی که امروز را پوشش می‌دهد).
 */
import type { MgmtPeriod } from './periods';
import { activePeriod, isPeriodActive } from './periods';
import type { AppError } from './errors';

export function isOpenManagementPeriod(p: Pick<MgmtPeriod, 'startDate' | 'endDate' | 'endedEarlyAt'>, todayKey: string): boolean {
  return isPeriodActive(p, todayKey);
}

export function hasOpenManagementPeriod(periods: readonly MgmtPeriod[], todayKey: string): boolean {
  return activePeriod(periods, todayKey) !== null;
}

/** سالی برای ثبت قبض باز است؟ (در فهرست سال‌ها هست و بسته نشده) */
export function isYearOpen(openYears: readonly number[], year: number): boolean {
  return openYears.includes(year);
}

export function newBillBlockers(opts: {
  /** سال‌های باز ساختمان فعال */
  openYears: readonly number[];
  mgmtEnabled: boolean;
  periods: readonly MgmtPeriod[];
  todayKey: string;
}): AppError[] {
  const out: AppError[] = [];
  if (opts.openYears.length === 0) {
    out.push({
      code: 'BACKUP_INVALID',
      title: 'ثبت قبض ممکن نیست',
      message: 'برای این ساختمان هیچ سال بازی نیست. از «دوره‌ها ← سال‌ها» با «افزودن سال» سال جاری را اضافه کنید.',
    });
  }
  if (opts.mgmtEnabled && !hasOpenManagementPeriod(opts.periods, opts.todayKey)) {
    out.push({
      code: 'BACKUP_INVALID',
      title: 'ثبت قبض ممکن نیست',
      message:
        'برای این ساختمان مدیر فعالی ثبت نشده است (دورهٔ قبلی بسته شده یا هنوز مدیری ثبت نشده). از «دوره‌ها ← مدیر ساختمان» مدیر جدید را ثبت کنید یا کلید «مدیر ساختمان» را خاموش کنید.',
    });
  }
  return out;
}
