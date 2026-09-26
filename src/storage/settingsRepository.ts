/** مخزن تنظیمات برنامه */
import type { AppSettings } from '../models/types';
import { readJson, writeJson } from './kvStore';
import { sanitizeSettings } from '../logic/settings';

export { sanitizeSettings };

const SETTINGS_KEY = 'settings';

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
