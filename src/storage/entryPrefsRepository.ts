/** انواع/روش‌های فعال؛ عمداً داخل فایل پشتیبان نیست (ترجیح همین گوشی است). */
import { readJson, writeJson } from './kvStore';
import { DEFAULT_ENTRY_PREFS, sanitizeEntryPrefs, type EntryPrefs } from '../logic/entryPrefs';

export const ENTRY_PREFS_KEY = 'entryPrefs';

export const entryPrefsRepository = {
  async get(): Promise<EntryPrefs> {
    return sanitizeEntryPrefs(await readJson<unknown>(ENTRY_PREFS_KEY, DEFAULT_ENTRY_PREFS));
  },
  async save(p: EntryPrefs): Promise<void> {
    await writeJson(ENTRY_PREFS_KEY, sanitizeEntryPrefs(p));
  },
};
