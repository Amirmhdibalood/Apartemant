/** انتخاب تم کاربر ('light' | 'dark')؛ نبودن = پیروی از تم سیستم. عمداً داخل فایل پشتیبان نیست (ترجیح همین گوشی است). */
import { readJson, writeJson } from './kvStore';
import { sanitizeTheme, type Theme } from '../logic/theme';

const KEY = 'theme';

export const themeRepository = {
  async get(): Promise<Theme | null> {
    return sanitizeTheme(await readJson<unknown>(KEY, null));
  },
  async save(theme: Theme): Promise<void> {
    await writeJson(KEY, theme);
  },
};
