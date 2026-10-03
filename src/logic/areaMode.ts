/**
 * نحوه نمایش متراژ (از نسخه ۱.۶.۵) — فقط ترجیح ظاهری، داخل فایل پشتیبان نیست (مثل تم).
 * «ستون کنار نفرات»: متراژ ستونی در همان ردیف واحد است.
 * «خط جدا زیر هر واحد» (پیش‌فرض): متراژ در خط دوم هر واحد می‌آید.
 */
export type AreaMode = 'column' | 'line';

export const DEFAULT_AREA_MODE: AreaMode = 'line';

export const AREA_MODES: { id: AreaMode; label: string; hint: string }[] = [
  { id: 'column', label: 'ستون کنار نفرات', hint: 'متراژ ستونی کنار نفرات در ردیف هر واحد است؛ در تقسیم بر اساس متراژ، ستون نفرات جای خود را به متراژ می‌دهد.' },
  { id: 'line', label: 'خط جدا زیر هر واحد', hint: 'متراژ در یک خط جدا زیر هر واحد می‌آید و در نتیجه، نوار «قیمت هر مترمربع» نمایش داده می‌شود.' },
];

export function sanitizeAreaMode(v: unknown): AreaMode | null {
  return v === 'column' || v === 'line' ? v : null;
}
