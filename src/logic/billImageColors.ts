import type { UnitStatusKind } from './billImage';
import { lightHex } from './lightColor';
import type { LightPaletteId } from './lightPalettes';

/** رنگ‌های پایهٔ تصویر قبض (پالت «آسمانی») */
export const BILL_IMAGE_BASE = {
  bg: '#EEF3FC', card: '#FFFFFF', text: '#1C2440', text2: '#3D4660', muted: '#7A8398', border: '#E4E9F2',
  headRow: '#F2F5FA', zebra: '#FAFBFE', primary: '#2F74F0', primarySoft: '#EAF1FE',
  purple: '#7C3AED', purpleSoft: '#F3E8FF', tealSoft: '#E0F7F1', teal: '#0F766E',
};
export const BILL_STATUS_BASE: Record<UnitStatusKind, { fg: string; bg: string }> = {
  settled: { fg: '#1F9557', bg: '#E8F7EF' },
  partial: { fg: '#B7791F', bg: '#FFF6E0' },
  unpaid: { fg: '#D64533', bg: '#FDECEC' },
};
export type BillImageColors = { C: typeof BILL_IMAGE_BASE; STATUS: typeof BILL_STATUS_BASE };

/** رنگ‌های تصویر قبض برای پالت روشن انتخابی (تصویر همیشه روشن است؛ «آسمانی» = همان رنگ‌های قبلی) */
export function billImageColors(palette: LightPaletteId): BillImageColors {
  const C = Object.fromEntries(Object.entries(BILL_IMAGE_BASE).map(([k, v]) => [k, lightHex(v, palette)])) as typeof BILL_IMAGE_BASE;
  const STATUS = Object.fromEntries(Object.entries(BILL_STATUS_BASE).map(([k, v]) => [k, { fg: lightHex(v.fg, palette), bg: lightHex(v.bg, palette) }])) as typeof BILL_STATUS_BASE;
  return { C, STATUS };
}
