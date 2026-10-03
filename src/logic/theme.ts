/**
 * حالت تاریک/روشن (از نسخه ۱.۶.۳) — منطق خالص و قابل تست.
 * اولین اجرا: پیروی از تم سیستم (prefers-color-scheme)؛ بعد از اولین انتخاب کاربر، همان انتخاب ماندگار می‌شود.
 */
export type Theme = 'light' | 'dark';

export const THEME_META_COLORS: Record<Theme, string> = { light: '#DCE8FF', dark: '#0d121f' };

export function sanitizeTheme(v: unknown): Theme | null {
  return v === 'light' || v === 'dark' ? v : null;
}

/** تم نهایی: انتخاب ذخیره‌شده کاربر، وگرنه تم سیستم */
export function resolveTheme(stored: unknown, systemDark: boolean): Theme {
  return sanitizeTheme(stored) ?? (systemDark ? 'dark' : 'light');
}

export const toggleTheme = (t: Theme): Theme => (t === 'dark' ? 'light' : 'dark');
