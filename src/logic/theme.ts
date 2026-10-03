/**
 * حالت تاریک/روشن (از نسخه ۱.۶.۳) — منطق خالص و قابل تست.
 * اولین اجرا: پیروی از تم سیستم (prefers-color-scheme)؛ بعد از اولین انتخاب کاربر، همان انتخاب ماندگار می‌شود.
 */
import { DARK_PALETTES, DEFAULT_DARK_PALETTE, type DarkPaletteId } from './darkPalettes';
import { DEFAULT_LIGHT_PALETTE, LIGHT_PALETTES, type LightPaletteId } from './lightPalettes';

export type Theme = 'light' | 'dark';

export const THEME_META_COLORS: Record<Theme, string> = { light: '#DCE8FF', dark: '#0d121f' };

/** رنگ meta theme-color (و پشت نوار وضعیت): پالت انتخابیِ حالت فعلی (روشن پیش‌فرض «آسمانی» = #DCE8FF) */
export function themeMetaColor(theme: Theme, palette: DarkPaletteId = DEFAULT_DARK_PALETTE, lightPalette: LightPaletteId = DEFAULT_LIGHT_PALETTE): string {
  return theme === 'dark' ? DARK_PALETTES[palette].metaColor : LIGHT_PALETTES[lightPalette].metaColor;
}

export function sanitizeTheme(v: unknown): Theme | null {
  return v === 'light' || v === 'dark' ? v : null;
}

/** تم نهایی: انتخاب ذخیره‌شده کاربر، وگرنه تم سیستم */
export function resolveTheme(stored: unknown, systemDark: boolean): Theme {
  return sanitizeTheme(stored) ?? (systemDark ? 'dark' : 'light');
}

export const toggleTheme = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');
