import { describe, expect, it } from 'vitest';
import { EXPENSE_TYPES, EXPENSE_TYPE_ORDER } from '../src/models/constants';
import { darkHex, hexToRgb } from '../src/logic/darkColor';
import { typeBarColor, typeColors } from '../src/logic/typeColor';

const lum = (hex: string) => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('رنگ نوع هزینه «آب» (سرمه‌ای عمیق)', () => {
  it('مقادیر تأییدشده', () => {
    expect(typeColors('water', 'light')).toEqual({ color: '#14307A', bg: '#E3E6EF', iconBg: '#C2C9DC' });
    expect(typeColors('water', 'dark')).toEqual({ color: '#B6D4FF', bg: '#28344B', iconBg: '#384660' });
  });
  it('روشن: نسبت به کارت سفید، پس‌زمینه صفحه و گرادیان آبی خلاصهٔ گزارش متمایز است', () => {
    const c = EXPENSE_TYPES.water.color;
    expect(contrast(c, '#ffffff')).toBeGreaterThan(7);
    expect(contrast(c, '#f4f7fc')).toBeGreaterThan(7);
    expect(contrast(c, '#2f74f0')).toBeGreaterThan(2.5);
    expect(contrast(c, '#4f8df5')).toBeGreaterThan(2.5);
    expect(contrast(EXPENSE_TYPES.water.iconBg, '#ffffff')).toBeGreaterThan(1.4);
  });
  it('تاریک: نسبت به کارت، پس‌زمینه و گرادیان آبی تاریک خلاصهٔ گزارش متمایز است', () => {
    const c = typeColors('water', 'dark').color;
    expect(contrast(c, '#151e33')).toBeGreaterThan(7);
    expect(contrast(c, '#0d121f')).toBeGreaterThan(7);
    expect(contrast(c, '#1c67ef')).toBeGreaterThan(2.8);
    expect(contrast(c, '#1b2742')).toBeGreaterThan(7); // مسیر نوار
  });
  it('نوارهای گزارش در تاریک از مقدار تاریک آب استفاده می‌کنند، در روشن از رنگ اصلی', () => {
    expect(typeBarColor('water', 'dark')).toBe('#B6D4FF');
    expect(typeBarColor('water', 'light')).toBe('#14307A');
  });
  it('سایر نوع‌ها بدون تغییر: روشن همان رنگ، نوار تاریک همان رنگ خام، آیکون تاریک معادل محاسبه‌شده', () => {
    for (const t of EXPENSE_TYPE_ORDER.filter((x) => x !== 'water')) {
      const info = EXPENSE_TYPES[t];
      expect(typeColors(t, 'light')).toEqual({ color: info.color, bg: info.bg, iconBg: info.iconBg });
      expect(typeBarColor(t, 'dark')).toBe(info.color);
      expect(typeColors(t, 'dark')).toEqual({ color: darkHex(info.color), bg: darkHex(info.bg), iconBg: darkHex(info.iconBg) });
    }
  });
});
