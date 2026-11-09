/**
 * شرط شروع «ثبت قبض جدید»: اگر کلید «مدیر ساختمان» روشن است، مدیرِ فعال (دورهٔ مدیریتِ بازی که امروز را پوشش می‌دهد).
 * (از ۱.۹.۱ سال جاری همیشه خودکار وجود دارد؛ شرط سال لازم نیست.)
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

export function newBillBlockers(opts: {
  mgmtEnabled: boolean;
  periods: readonly MgmtPeriod[];
  todayKey: string;
}): AppError[] {
  const out: AppError[] = [];
  if (opts.mgmtEnabled && !hasOpenManagementPeriod(opts.periods, opts.todayKey)) {
    out.push({
      code: 'BACKUP_INVALID',
      title: 'ثبت قبض ممکن نیست',
      message:
        'برای این تاریخ مدیر فعالی ثبت نشده است.\nبه «مدیر ساختمان» بروید و مدیر جدید انتخاب کنید، یا کلید «مدیر ساختمان» را خاموش کنید.',
    });
  }
  return out;
}
