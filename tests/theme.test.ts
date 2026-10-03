import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptColor, darkenCssValue, darkHex, hexToRgb } from '../src/logic/darkColor';
import { resolveTheme, sanitizeTheme, THEME_META_COLORS, toggleTheme } from '../src/logic/theme';
import { generateDarkCss, OUT_CSS, SRC_CSS } from '../scripts/dark-css.mjs';
import { ART_FILES, generateDarkArt } from '../scripts/dark-art.mjs';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { themeRepository } = await import('../src/storage/themeRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { billRepository } = await import('../src/storage/billRepository');

const lum = (hex: string) => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('انتخاب تم', () => {
  it('اولین اجرا از تم سیستم پیروی می‌کند؛ انتخاب کاربر همیشه مقدم است', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('garbage', true)).toBe('dark');
    expect(sanitizeTheme(42)).toBeNull();
    expect(toggleTheme('dark')).toBe('light');
    expect(toggleTheme('light')).toBe('dark');
    expect(THEME_META_COLORS.dark).toBe('#0d121f');
  });

  describe('ماندگاری', () => {
    beforeEach(() => { mem.clear(); billRepository._resetCache(); });
    it('پیش‌فرض null (پیروی از سیستم)، سپس انتخاب ذخیره می‌شود', async () => {
      expect(await themeRepository.get()).toBeNull();
      await themeRepository.save('dark');
      expect(await themeRepository.get()).toBe('dark');
      mem.set('theme', JSON.stringify('weird'));
      expect(await themeRepository.get()).toBeNull();
    });
    it('تم داخل فایل پشتیبان نیست و بازیابی آن را عوض نمی‌کند', async () => {
      await themeRepository.save('light');
      expect(JSON.stringify(await backupRepository.collect())).not.toContain('"theme"');
      await backupRepository.replaceAll({
        bills: [], units: [], settings: { showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] }, building: { units: [{ alias: null, defaultPersons: 1 }] },
      });
      expect(await themeRepository.get()).toBe('light');
    });
  });
});

describe('پالت تاریک (گزینه ۲ سرمه‌ای عمیق)', () => {
  it('رنگ‌های پایه دقیقاً مطابق نمونه تأییدشده', () => {
    expect(darkHex('#f4f7fc')).toBe('#0d121f'); // پس‌زمینه
    expect(darkHex('#ffffff')).toBe('#151e33'); // کارت
    expect(darkHex('#fff')).toBe('#151e33');
    expect(darkHex('#1c2440')).toBe('#d2d8e4'); // متن
  });
  it('رنگ نامعتبر بدون تغییر؛ حالت روشن بدون تغییر', () => {
    expect(darkHex('red')).toBe('red');
    expect(adaptColor('#EEF4FF', 'light')).toBe('#EEF4FF');
    expect(adaptColor('#EEF4FF', 'dark')).not.toBe('#EEF4FF');
  });
  it('پس‌زمینه‌های ملایم تیره می‌شوند و رنگ‌های برند خوانا می‌مانند', () => {
    for (const hex of ['#EEF4FF', '#FFF8E6', '#FFF3EA', '#F4F0FF', '#E9FAF8', '#FFF0ED', '#FDEEF6', '#F2F4F8', '#DCE9FF', '#FFEFC2']) {
      expect(lum(darkHex(hex))).toBeLessThan(0.05);
    }
    for (const hex of ['#2F7BF5', '#F2B01E', '#F47A20', '#8B5CF6', '#0EA5A4', '#E0533D', '#DB2777', '#5B6478']) {
      expect(contrast(darkHex(hex), '#151e33')).toBeGreaterThan(3);
    }
  });
  it('کنتراست متن اصلی/ثانویه روی پس‌زمینه و کارت کافی است', () => {
    const bg = darkHex('#f4f7fc'), card = darkHex('#ffffff');
    expect(contrast(darkHex('#1c2440'), bg)).toBeGreaterThan(9);
    expect(contrast(darkHex('#1c2440'), card)).toBeGreaterThan(8);
    expect(contrast(darkHex('#3d4660'), card)).toBeGreaterThan(6);
    expect(contrast(darkHex('#7a8398'), card)).toBeGreaterThan(4.5);
  });
  it('مقدار CSS: سایه‌ها تیره می‌مانند؛ سفیدِ color روشن می‌ماند؛ سفیدِ background کارت می‌شود', () => {
    expect(darkenCssValue('0 4px 18px rgba(33, 56, 102, 0.07)')).toBe('0 4px 18px rgba(0,0,0,0.21)');
    expect(darkenCssValue('#fff', true)).toBe('#f4f6fa');
    expect(darkenCssValue('#fff', false)).toBe('#151e33');
    expect(darkenCssValue('linear-gradient(135deg, #2f74f0 0%, #4f8df5 100%)')).toMatch(/^linear-gradient\(135deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/);
    expect(darkenCssValue('10px 5px')).toBe('10px 5px');
  });
});

describe('استایل تاریک تولیدشده', () => {
  const css = readFileSync(OUT_CSS, 'utf8');
  it('با global.css همگام است (npm run theme:generate)', () => {
    expect(css).toBe(generateDarkCss(readFileSync(SRC_CSS, 'utf8')));
  });
  it('همه متغیرهای رنگی :root بازتعریف شده‌اند و همه قاعده‌ها زیر data-theme=dark هستند', () => {
    const root = readFileSync(SRC_CSS, 'utf8').match(/:root\s*{([^}]*)}/)![1];
    const vars = [...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].filter((m) => /#|rgba?\(/.test(m[2])).map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(15);
    const block = css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)![1];
    for (const v of vars) expect(block).toContain(`${v}:`);
    const selectors = css.split('\n').filter((l) => /\{\s*$|\{ .* \}$/.test(l) && !l.startsWith('@') && !l.startsWith('/*'));
    for (const l of selectors) expect(l.startsWith(':root[data-theme="dark"]') || l.startsWith(',') === false).toBe(true);
    expect(css).toContain(':root[data-theme="dark"] .bottom-nav');
    expect(css).toContain(':root[data-theme="dark"] .year-picker');
    expect(css).toContain(':root[data-theme="dark"] .dialog');
  });
  it('رنگ روشن سفید/خنثی به‌عنوان زمینه باقی نمانده است', () => {
    expect(css).not.toMatch(/background(-color)?:\s*#(fff|ffffff|f4f7fc|f5f7fb)\b/i);
  });
});

describe('تصویر شبانه صفحه ورود', () => {
  it('نسخه تاریک intro-art با نسخه روشن همگام است و رنگ روشن آسمان ندارد', () => {
    for (const { src, out } of ART_FILES) {
      const dark = readFileSync(out, 'utf8');
      expect(dark).toBe(generateDarkArt(readFileSync(src, 'utf8')));
      expect(dark).not.toMatch(/#(BFD6FF|E4EEFF|F7FAFF|DCE8FF)/i);
    }
  });
});

describe('محل دکمه‌ها و تصویر قبض', () => {
  it('دکمه ماه/خورشید کنار «؟» در هدر است', async () => {
    const { ThemeProvider } = await import('../src/context/ThemeContext');
    const { NotifProvider } = await import('../src/context/NotifContext');
    const { AppHeader } = await import('../src/components/AppHeader');
    const html = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(NotifProvider, null, createElement(AppHeader, { title: 'سوابق', onHelp: () => {}, onBack: () => {} }))));
    expect(html).toContain('راهنما (آموزش)');
    expect(html).toContain('حالت تاریک');
    expect(html.indexOf('راهنما (آموزش)')).toBeLessThan(html.indexOf('حالت تاریک'));
    expect(html.indexOf('اعلان‌ها')).toBeLessThan(html.indexOf('راهنما (آموزش)')); // زنگوله کنار «؟»
    expect(html).toContain('app-header--two');
    const noHelp = renderToStaticMarkup(createElement(ThemeProvider, null, createElement(NotifProvider, null, createElement(AppHeader, { title: 'آموزش' }))));
    expect(noHelp).not.toContain('حالت تاریک');
  });
  it('تصویر قبض (canvas) از تم مستقل است: رنگ ثابت و بدون وابستگی به تم/CSS', () => {
    for (const f of ['../src/services/billImage.tsx', '../src/logic/billImage.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src).not.toMatch(/darkColor|ThemeContext|useTheme|useAdapt|getComputedStyle|data-theme|prefers-color-scheme/);
    }
  });
});
