/** مخزن تنظیمات برنامه */
import type { AppSettings } from '../models/types';
import { DEFAULT_SETTINGS } from '../models/constants';
import { readJson, writeJson } from './kvStore';

const SETTINGS_KEY = 'settings';

function sanitize(s: Partial<AppSettings> | null | undefined): AppSettings {
  const activeYears = Array.isArray(s?.activeYears)
    ? Array.from(new Set(s!.activeYears.filter((y) => Number.isInteger(y)))).sort((a, b) => a - b)
    : DEFAULT_SETTINGS.activeYears;
  return {
    showSaveWarning: typeof s?.showSaveWarning === 'boolean' ? s.showSaveWarning : DEFAULT_SETTINGS.showSaveWarning,
    activeYears: activeYears.length ? activeYears : DEFAULT_SETTINGS.activeYears,
    dismissedWarnings: Array.isArray(s?.dismissedWarnings) ? s!.dismissedWarnings : [],
  };
}

export const settingsRepository = {
  async get(): Promise<AppSettings> {
    return sanitize(await readJson<Partial<AppSettings> | null>(SETTINGS_KEY, null));
  },
  async save(settings: AppSettings): Promise<void> {
    await writeJson(SETTINGS_KEY, sanitize(settings));
  },
};
