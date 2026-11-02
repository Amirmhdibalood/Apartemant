import type { ExpenseType } from '../models/types';
import { typeInfo } from './billTypes';
import { darkHex } from './darkColor';
import type { DarkPaletteId } from './darkPalettes';
import { lightHex } from './lightColor';
import type { LightPaletteId } from './lightPalettes';

export type TypeTheme = 'light' | 'dark';
export interface TypeColors { color: string; bg: string; iconBg: string }

/** رنگ‌های آیکون/کاشی نوع هزینه برای تم داده‌شده (در تاریک: مقدار اختصاصی نوع یا معادل محاسبه‌شده) */
export function typeColors(type: ExpenseType | string, theme: TypeTheme, palette?: DarkPaletteId, lightPalette?: LightPaletteId): TypeColors {
  const info = typeInfo(type);
  // روشن: رنگ اصلی هر نوع ثابت (معنایی)؛ فقط زمینه‌های خنثی/ملایم با پالت روشن هماهنگ می‌شوند («آسمانی» = بدون تغییر)
  if (theme === 'light') return { color: info.color, bg: lightHex(info.bg, lightPalette), iconBg: lightHex(info.iconBg, lightPalette) };
  if (info.custom && info.dark) {
    // نوع سفارشی: رنگ اصلیِ تاریکِ تأییدشده ثابت؛ زمینه‌ها همیشه از پالت تاریک
    return { color: info.dark.color, bg: darkHex(info.bg, palette), iconBg: darkHex(info.iconBg, palette) };
  }
  if (info.dark) {
    // مقدار اختصاصی (آب) برای سرمه‌ای؛ در پالت‌های دیگر فقط رنگ اصلی ثابت می‌ماند و زمینه‌ها از پالت می‌آیند
    if (!palette || palette === 'navy') return { ...info.dark };
    return { color: info.dark.color, bg: darkHex(info.bg, palette), iconBg: darkHex(info.iconBg, palette) };
  }
  return { color: darkHex(info.color, palette), bg: darkHex(info.bg, palette), iconBg: darkHex(info.iconBg, palette) };
}

/** رنگ نوارها/درصد در گزارش: در تاریک اگر نوع مقدار تاریک اختصاصی دارد همان، وگرنه همان رنگ اصلی */
export function typeBarColor(type: ExpenseType | string, theme: TypeTheme): string {
  const info = typeInfo(type);
  return theme === 'dark' && info.dark ? info.dark.color : info.color;
}
