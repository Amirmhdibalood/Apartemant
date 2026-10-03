/**
 * نمادهای قابل انتخاب (از نسخه ۱.۶.۷) — فقط ترجیح ظاهری؛ در کلیدهای جدا ذخیره می‌شوند و داخل فایل پشتیبان نیستند (مثل تم).
 * - «نماد واحد»: آواتار دایره‌ای هر واحد (فرم قبض، نتیجه، گزارش بدهکاران). پیش‌فرض: در.
 * - «نماد متراژ»: نشانِ سرستون متراژ در حالت «بر اساس متراژ» (فرم قبض و تنظیمات ← ساختمان). پیش‌فرض: m².
 */
export type UnitIconId = 'door' | 'building' | 'key' | 'home' | 'number' | 'person';
export type AreaIconId = 'arrows' | 'plan' | 'm2' | 'expand' | 'homeRuler' | 'none';

export const DEFAULT_UNIT_ICON: UnitIconId = 'door';
export const DEFAULT_AREA_ICON: AreaIconId = 'm2';

export const UNIT_ICONS: { id: UnitIconId; label: string }[] = [
  { id: 'door', label: 'در' },
  { id: 'building', label: 'ساختمان' },
  { id: 'key', label: 'کلید' },
  { id: 'home', label: 'خانه' },
  { id: 'number', label: 'شماره‌ی واحد' },
  { id: 'person', label: 'آدمک' },
];

export const AREA_ICONS: { id: AreaIconId; label: string }[] = [
  { id: 'arrows', label: 'مربع با پیکان' },
  { id: 'plan', label: 'نقشهٔ طبقه' },
  { id: 'm2', label: 'نماد m²' },
  { id: 'expand', label: 'چهار گوشه' },
  { id: 'homeRuler', label: 'خانه با خط‌کش' },
  { id: 'none', label: 'بدون نماد' },
];

export function sanitizeUnitIcon(v: unknown): UnitIconId | null {
  return UNIT_ICONS.some((o) => o.id === v) ? (v as UnitIconId) : null;
}
export function sanitizeAreaIcon(v: unknown): AreaIconId | null {
  return AREA_ICONS.some((o) => o.id === v) ? (v as AreaIconId) : null;
}
