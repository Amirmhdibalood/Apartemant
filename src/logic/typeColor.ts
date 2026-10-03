import type { ExpenseType } from '../models/types';
import { EXPENSE_TYPES } from '../models/constants';
import { darkHex } from './darkColor';

export type TypeTheme = 'light' | 'dark';
export interface TypeColors { color: string; bg: string; iconBg: string }

/** رنگ‌های آیکون/کاشی نوع هزینه برای تم داده‌شده (در تاریک: مقدار اختصاصی نوع یا معادل محاسبه‌شده) */
export function typeColors(type: ExpenseType, theme: TypeTheme): TypeColors {
  const info = EXPENSE_TYPES[type];
  if (theme === 'light') return { color: info.color, bg: info.bg, iconBg: info.iconBg };
  if (info.dark) return { ...info.dark };
  return { color: darkHex(info.color), bg: darkHex(info.bg), iconBg: darkHex(info.iconBg) };
}

/** رنگ نوارها/درصد در گزارش: در تاریک اگر نوع مقدار تاریک اختصاصی دارد همان، وگرنه همان رنگ اصلی */
export function typeBarColor(type: ExpenseType, theme: TypeTheme): string {
  const info = EXPENSE_TYPES[type];
  return theme === 'dark' && info.dark ? info.dark.color : info.color;
}
