import type { ExpenseType } from '../models/types';
import { EXPENSE_TYPES } from '../models/constants';
import { darkHex } from './darkColor';
import type { DarkPaletteId } from './darkPalettes';

export type TypeTheme = 'light' | 'dark';
export interface TypeColors { color: string; bg: string; iconBg: string }

/** رنگ‌های آیکون/کاشی نوع هزینه برای تم داده‌شده (در تاریک: مقدار اختصاصی نوع یا معادل محاسبه‌شده) */
export function typeColors(type: ExpenseType, theme: TypeTheme, palette?: DarkPaletteId): TypeColors {
  const info = EXPENSE_TYPES[type];
  if (theme === 'light') return { color: info.color, bg: info.bg, iconBg: info.iconBg };
  if (info.dark) {
    // مقدار اختصاصی (آب) برای سرمه‌ای؛ در پالت‌های دیگر فقط رنگ اصلی ثابت می‌ماند و زمینه‌ها از پالت می‌آیند
    if (!palette || palette === 'navy') return { ...info.dark };
    return { color: info.dark.color, bg: darkHex(info.bg, palette), iconBg: darkHex(info.iconBg, palette) };
  }
  return { color: darkHex(info.color, palette), bg: darkHex(info.bg, palette), iconBg: darkHex(info.iconBg, palette) };
}

/** رنگ نوارها/درصد در گزارش: در تاریک اگر نوع مقدار تاریک اختصاصی دارد همان، وگرنه همان رنگ اصلی */
export function typeBarColor(type: ExpenseType, theme: TypeTheme): string {
  const info = EXPENSE_TYPES[type];
  return theme === 'dark' && info.dark ? info.dark.color : info.color;
}
