/**
 * پالت‌های تم تاریک (از نسخه ۱.۶.۱۲) — داده‌های خالص؛ هم مولد CSS (scripts/dark-css.mjs) هم رنگ‌های درون‌خطی در زمان اجرا
 * و هم پیش‌نمایش کوچک انتخابگر از همین‌جا می‌خوانند، پس همیشه یک‌دست‌اند.
 * سرمه‌ای عمیق پالت پیش‌فرض است و خروجی‌اش دقیقاً همان ۱.۶.۱۱ است.
 */
export type DarkPaletteId = 'navy' | 'charcoal' | 'amoled' | 'warm';

/** رنگ‌های «دستی» وابسته به پالت که در dark.css به‌صورت متغیر مصرف می‌شوند */
export interface PaletteExtras {
  primaryFill: string; primaryFillPress: string; successFill: string; successFillPress: string; dangerFill: string;
  swOffBg: string; swOffRing: string; swThumb: string; swOnBg: string; swOnRing: string; cbRing: string; cbOnBorder: string;
  warnBorder: string; warnColor: string; warnBg: string; ppmBorder: string; badgeAreaBg: string; badgeAreaColor: string;
}

export interface DarkPalette {
  id: DarkPaletteId;
  name: string;
  desc: string;
  /** روشنایی HSL پس‌زمینهٔ صفحه و کارت */
  bgL: number; cardL: number;
  /** رنگ‌مایهٔ سطوح خنثی */
  neutralHue: number; neutralSat: number;
  /** اشباع متن/آیکون‌های تیره‌ی خنثی و سقف اشباع خاکستری‌های میانی */
  textSat: number; greyCap: number;
  /** اگر عدد باشد، رنگ‌مایه‌های آبی (برند) به این رنگ‌مایه برمی‌گردند (تأکید) */
  accentHue: number | null;
  /** رنگ نوار وضعیت/meta theme-color */
  metaColor: string;
  extras: PaletteExtras;
}

const NAVY_EXTRAS: PaletteExtras = {
  primaryFill: '#2e68d6', primaryFillPress: '#2658bd', successFill: '#1c7f4f', successFillPress: '#166b42', dangerFill: '#c93838',
  swOffBg: '#2a3858', swOffRing: '#7a89ad', swThumb: '#aab4cf', swOnBg: '#4d8bff', swOnRing: '#7fa6f5', cbRing: '#7a89ad', cbOnBorder: '#64df9e',
  warnBorder: '#6b2f33', warnColor: '#ffb4ad', warnBg: '#3a1f26', ppmBorder: '#2c4a86', badgeAreaBg: '#17423f', badgeAreaColor: '#7de3d3',
};

export const DARK_PALETTES: Record<DarkPaletteId, DarkPalette> = {
  navy: {
    id: 'navy', name: 'سرمه‌ای عمیق', desc: 'آبی-سرمه‌ای آرام؛ تم تاریک فعلی (پیش‌فرض)',
    bgL: 0.085, cardL: 0.14, neutralHue: 222, neutralSat: 0.42, textSat: 0.25, greyCap: 0.15, accentHue: null,
    metaColor: '#0d121f', extras: NAVY_EXTRAS,
  },
  charcoal: {
    id: 'charcoal', name: 'زغالی خنثی', desc: 'خاکستری بی‌رنگ با تأکید آبی',
    bgL: 0.075, cardL: 0.12, neutralHue: 220, neutralSat: 0.06, textSat: 0.03, greyCap: 0.04, accentHue: null,
    metaColor: '#121314',
    extras: { ...NAVY_EXTRAS, swOffBg: '#2e3033', swOffRing: '#868a91', swThumb: '#b3b7bd', cbRing: '#868a91', warnBorder: '#6b3434', warnBg: '#321f1f', ppmBorder: '#33518f' },
  },
  amoled: {
    id: 'amoled', name: 'مشکی AMOLED', desc: 'سیاه خالص؛ مناسب نمایشگرهای AMOLED',
    bgL: 0, cardL: 0.065, neutralHue: 220, neutralSat: 0, textSat: 0, greyCap: 0, accentHue: null,
    metaColor: '#000000',
    extras: { ...NAVY_EXTRAS, swOffBg: '#26272a', swOffRing: '#8a8d92', swThumb: '#b6b9be', cbRing: '#8a8d92', warnBorder: '#6b3434', warnBg: '#2a1517', ppmBorder: '#33518f', badgeAreaBg: '#10312f' },
  },
  warm: {
    id: 'warm', name: 'قهوه‌ای گرم', desc: 'اسلیت گرم با تأکید فیروزه‌ای',
    bgL: 0.09, cardL: 0.135, neutralHue: 28, neutralSat: 0.12, textSat: 0.06, greyCap: 0.08, accentHue: 172,
    metaColor: '#1a1714',
    extras: {
      ...NAVY_EXTRAS, primaryFill: '#12806f', primaryFillPress: '#0f6b5d', swOffBg: '#3a332c', swOffRing: '#9b8f82', swThumb: '#c4b9ab', swOnBg: '#26b5a0',
      swOnRing: '#6fd6c4', cbRing: '#9b8f82', warnBorder: '#703a30', warnBg: '#3a2420', ppmBorder: '#2b6a60', badgeAreaBg: '#143e38',
    },
  },
};

export const DARK_PALETTE_ORDER: DarkPaletteId[] = ['navy', 'charcoal', 'amoled', 'warm'];
export const DEFAULT_DARK_PALETTE: DarkPaletteId = 'navy';

export function sanitizeDarkPalette(v: unknown): DarkPaletteId | null {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DARK_PALETTES, v) ? (v as DarkPaletteId) : null;
}

/** رنگ‌های مرجع روشن که پیش‌نمایش انتخابگر از روی آن‌ها ساخته می‌شود: پس‌زمینه، کارت، متن، اصلی، موفق، خطا */
export const PREVIEW_LIGHT_COLORS = ['#f4f7fc', '#ffffff', '#1c2440', '#2f74f0', '#25a865', '#ef4444'] as const;
