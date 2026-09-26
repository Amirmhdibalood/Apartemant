/** مخزن تنظیمات برنامه */
import type { AppSettings } from '../models/types';
import { DEFAULT_SETTINGS } from '../models/constants';
import { readJson, writeJson } from './kvStore';
import { migrateActiveYears } from '../logic/years';

const SETTINGS_KEY = 'settings';

export function sanitizeSettings(s: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    showSaveWarning: typeof s?.showSaveWarning === 'boolean' ? s.showSaveWarning : DEFAULT_SETTINGS.showSaveWarning,
    // مهاجرت: سال‌های قبل از ۱۴۰۵ حذف می‌شوند؛ اگر چیزی نماند ۱۴۰۵ فعال می‌شود
    activeYears: Array.isArray(s?.activeYears) ? migrateActiveYears(s!.activeYears) : [...DEFAULT_SETTINGS.activeYears],
    dismissedWarnings: Array.isArray(s?.dismissedWarnings) ? s!.dismissedWarnings : [],
  };
}

export const settingsRepository = {
  async get(): Promise<AppSettings> {
    const raw = await readJson<Partial<AppSettings> | null>(SETTINGS_KEY, null);
    const settings = sanitizeSettings(raw);
    // نتیجه مهاجرت (مثلاً حذف سال‌های قدیمی) را همان‌جا ذخیره کن
    if (raw && JSON.stringify(raw.activeYears) !== JSON.stringify(settings.activeYears)) {
      await writeJson(SETTINGS_KEY, settings);
    }
    return settings;
  },
  async save(settings: AppSettings): Promise<void> {
    await writeJson(SETTINGS_KEY, sanitizeSettings(settings));
  },
};
