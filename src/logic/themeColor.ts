import { darkHex } from './darkColor';
import { lightHex } from './lightColor';
import type { DarkPaletteId } from './darkPalettes';
import type { LightPaletteId } from './lightPalettes';
import type { Theme } from './theme';

/** رنگ درون‌خطی متناسب با تم و پالت فعلی: تاریک ← darkHex(پالت تاریک)، روشن ← lightHex(پالت روشن؛ «آسمانی» همانی) */
export function adaptThemeColor(hex: string, theme: Theme, dark: DarkPaletteId, light: LightPaletteId): string {
  return theme === 'dark' ? darkHex(hex, dark) : lightHex(hex, light);
}
