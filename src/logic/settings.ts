/** پاک‌سازی/مهاجرت تنظیمات ذخیره‌شده (خالص، بدون وابستگی به ذخیره‌ساز) */
import type { AppSettings, WarningId } from '../models/types';
import { DEFAULT_SETTINGS } from '../models/constants';
import { migrateActiveYears } from './years';

const WARNING_IDS: WarningId[] = ['saveConfirm', 'lastUnitSettle', 'duplicateBill', 'roundingAdjust'];

export function sanitizeSettings(s: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    showSaveWarning: typeof s?.showSaveWarning === 'boolean' ? s.showSaveWarning : DEFAULT_SETTINGS.showSaveWarning,
    // مهاجرت: سال‌های قبل از ۱۴۰۵ حذف می‌شوند؛ اگر چیزی نماند ۱۴۰۵ فعال می‌شود
    activeYears: Array.isArray(s?.activeYears) ? migrateActiveYears(s!.activeYears) : [...DEFAULT_SETTINGS.activeYears],
    dismissedWarnings: Array.isArray(s?.dismissedWarnings)
      ? Array.from(new Set(s!.dismissedWarnings.filter((w): w is WarningId => WARNING_IDS.includes(w as WarningId))))
      : [],
  };
}
