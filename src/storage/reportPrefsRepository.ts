/** گزارش‌های نمایش‌داده‌شده؛ عمداً داخل فایل پشتیبان نیست (ترجیح همین گوشی است). */
import { readJson, writeJson } from './kvStore';
import { DEFAULT_REPORT_PREFS, sanitizeReportPrefs, type ReportPrefs } from '../logic/reportPrefs';

export const REPORT_PREFS_KEY = 'reportPrefs';

export const reportPrefsRepository = {
  async get(): Promise<ReportPrefs> {
    return sanitizeReportPrefs(await readJson<unknown>(REPORT_PREFS_KEY, DEFAULT_REPORT_PREFS));
  },
  async save(p: ReportPrefs): Promise<void> {
    await writeJson(REPORT_PREFS_KEY, sanitizeReportPrefs(p));
  },
};
