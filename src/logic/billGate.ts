/**
 * شرط‌های شروع «ثبت قبض جدید»: سال مالی فعال (سال جاری در سال‌های فعال)
 * و دورهٔ مدیریت باز برای ساختمان فعال.
 */
import type { ManagementPeriodRow } from '../storage/sqlite/domain';
import type { AppError } from './errors';
import { toPersianDigits } from './formatting';

export function isOpenManagementPeriod(p: ManagementPeriodRow, todayKey: string): boolean {
  if (p.endedEarlyAt) return false;
  return p.startDate <= todayKey && todayKey <= p.endDate;
}

export function hasOpenManagementPeriod(periods: ManagementPeriodRow[], todayKey: string): boolean {
  return periods.some((p) => isOpenManagementPeriod(p, todayKey));
}

/** سال جاری شمسی در فهرست سال‌های فعال تنظیمات هست؟ */
export function isCurrentFinancialYearOpen(activeYears: number[], currentYear: number): boolean {
  return activeYears.includes(currentYear);
}

export function newBillBlockers(opts: {
  activeYears: number[];
  currentYear: number;
  periods: ManagementPeriodRow[];
  todayKey: string;
}): AppError[] {
  const out: AppError[] = [];
  if (!isCurrentFinancialYearOpen(opts.activeYears, opts.currentYear)) {
    out.push({
      code: 'BACKUP_INVALID',
      title: 'ثبت قبض ممکن نیست',
      message:
        `سال مالی جاری (${toPersianDigits(opts.currentYear)}) در «تنظیمات ← سال‌ها» فعال نیست. سال را روشن کنید یا اگر دوره مالی تمام شده، سال مناسب را فعال کنید.`,
    });
  }
  if (!hasOpenManagementPeriod(opts.periods, opts.todayKey)) {
    out.push({
      code: 'BACKUP_INVALID',
      title: 'ثبت قبض ممکن نیست',
      message:
        'برای این ساختمان دورهٔ مدیریت باز وجود ندارد (تمام شده، زودتر بسته شده، یا هنوز ثبت نشده). از «تنظیمات ← دورهٔ مدیریت» دورهٔ جاری را ثبت کنید.',
    });
  }
  return out;
}
