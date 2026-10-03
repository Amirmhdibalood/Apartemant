/** انتخاب تم کاربر ('light' | 'dark')؛ نبودن = پیروی از تم سیستم. عمداً داخل فایل پشتیبان نیست (ترجیح همین گوشی است). */
import { readJson, writeJson } from './kvStore';
import { sanitizeTheme, type Theme } from '../logic/theme';
import { DEFAULT_DARK_PALETTE, sanitizeDarkPalette, type DarkPaletteId } from '../logic/darkPalettes';

const KEY = 'theme';
/** پالت تم تاریک (از ۱.۶.۱۲)؛ مثل خود تم عمداً بیرون از فایل پشتیبان است */
export const PALETTE_KEY = 'darkPalette';

export const themeRepository = {
  async get(): Promise<Theme | null> {
    return sanitizeTheme(await readJson<unknown>(KEY, null));
  },
  async save(theme: Theme): Promise<void> {
    await writeJson(KEY, theme);
  },
  async getPalette(): Promise<DarkPaletteId> {
    return sanitizeDarkPalette(await readJson<unknown>(PALETTE_KEY, null)) ?? DEFAULT_DARK_PALETTE;
  },
  async savePalette(id: DarkPaletteId): Promise<void> {
    await writeJson(PALETTE_KEY, id);
  },
};
