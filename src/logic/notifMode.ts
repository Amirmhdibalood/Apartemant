/**
 * نحوه نمایش اعلان‌ها (از نسخه ۱.۶.۴) — منطق خالص و قابل تست.
 * «پنجره پایین» (پیش‌فرض): برگهٔ پایین صفحه؛ «پنل کشویی»: پنل کوچک زیر زنگوله.
 */
export type NotifMode = 'sheet' | 'dropdown';

export const DEFAULT_NOTIF_MODE: NotifMode = 'sheet';

export const NOTIF_MODES: { id: NotifMode; label: string; hint: string }[] = [
  { id: 'sheet', label: 'پنجره پایین', hint: 'برگه از پایین صفحه باز می‌شود؛ بنر خانه فشرده است.' },
  { id: 'dropdown', label: 'پنل کشویی', hint: 'پنل کوچک زیر زنگوله (اعلان) باز می‌شود؛ بنر خانه کامل است.' },
];

export function sanitizeNotifMode(v: unknown): NotifMode | null {
  return v === 'sheet' || v === 'dropdown' ? v : null;
}
