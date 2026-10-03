import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adaptColor, darkHex, hexToRgb, paletteSwatches, rgbToHsl } from '../src/logic/darkColor';
import { DARK_PALETTES, DARK_PALETTE_ORDER, DEFAULT_DARK_PALETTE, sanitizeDarkPalette, type DarkPaletteId } from '../src/logic/darkPalettes';
import { themeMetaColor, THEME_META_COLORS } from '../src/logic/theme';
import { typeColors } from '../src/logic/typeColor';
import { EXPENSE_TYPE_ORDER } from '../src/models/constants';
import { generateDarkCss, OUT_CSS, SRC_CSS } from '../scripts/dark-css.mjs';
import { ART_FILES, artName, generateDarkArt } from '../scripts/dark-art.mjs';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { themeRepository, PALETTE_KEY } = await import('../src/storage/themeRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { billRepository } = await import('../src/storage/billRepository');

let themeState: { theme: 'light' | 'dark'; palette: DarkPaletteId } = { theme: 'dark', palette: 'navy' };
vi.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({ ...themeState, toggle: () => undefined, setTheme: () => undefined, setPalette: () => undefined }),
}));
const { ThemePicker } = await import('../src/components/ThemePicker');

const lum = (hex: string) => {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

/** متغیرهای یک پالت در CSS تولیدشده (پایه سرمه‌ای + بازنویسی پالت) */
function cssVars(css: string, id: DarkPaletteId): Record<string, string> {
  const grab = (head: string) => {
    const out: Record<string, string> = {};
    let i = css.indexOf(head + ' { --');
    while (i >= 0) {
      const body = css.slice(i + head.length + 3, css.indexOf('}', i));
      for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
      i = css.indexOf(head + ' { --', i + 1);
    }
    return out;
  };
  return { ...grab(':root[data-theme="dark"]'), ...(id === 'navy' ? {} : grab(`:root[data-theme="dark"][data-palette="${id}"]`)) };
}
const css = readFileSync(OUT_CSS, 'utf8');
const prng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

describe('تعریف پالت‌ها', () => {
  it('۴ پالت با نام فارسی و ترتیب ثابت؛ پیش‌فرض سرمه‌ای عمیق', () => {
    expect(DARK_PALETTE_ORDER).toEqual(['navy', 'charcoal', 'amoled', 'warm']);
    expect(DARK_PALETTE_ORDER.map((i) => DARK_PALETTES[i].name)).toEqual(['سرمه‌ای عمیق', 'زغالی خنثی', 'مشکی AMOLED', 'قهوه‌ای گرم']);
    expect(DEFAULT_DARK_PALETTE).toBe('navy');
    expect(new Set(DARK_PALETTE_ORDER.map((i) => DARK_PALETTES[i].metaColor)).size).toBe(4);
  });
  it('sanitizeDarkPalette فقط شناسه‌های معتبر را می‌پذیرد', () => {
    for (const id of DARK_PALETTE_ORDER) expect(sanitizeDarkPalette(id)).toBe(id);
    for (const bad of ['', 'Navy', 'light', 'dark', null, undefined, 3, {}, '__proto__', 'toString', 'constructor']) expect(sanitizeDarkPalette(bad)).toBeNull();
  });
  it('رنگ meta/نوار وضعیت: روشن ثابت، تاریک = پس‌زمینهٔ همان پالت', () => {
    expect(themeMetaColor('light', 'warm')).toBe(THEME_META_COLORS.light);
    expect(themeMetaColor('dark')).toBe('#0d121f');
    for (const id of DARK_PALETTE_ORDER) expect(themeMetaColor('dark', id)).toBe(darkHex('#f4f7fc', id));
  });
});

describe('تبدیل رنگ هر پالت', () => {
  it('سرمه‌ای دقیقاً مثل ۱.۶.۱۱ است (بدون پالت = سرمه‌ای)', () => {
    for (const hex of ['#f4f7fc', '#ffffff', '#1c2440', '#2f74f0', '#eef4ff', '#ef4444', '#7a8398']) {
      expect(darkHex(hex)).toBe(darkHex(hex, 'navy'));
    }
    expect(darkHex('#f4f7fc', 'navy')).toBe('#0d121f');
    expect(darkHex('#ffffff', 'navy')).toBe('#151e33');
  });
  it('پس‌زمینه/کارت هر پالت: مقادیر مورد انتظار و کارت روشن‌تر از پس‌زمینه', () => {
    expect(darkHex('#f4f7fc', 'amoled')).toBe('#000000');
    expect(darkHex('#f4f7fc', 'charcoal')).toBe('#121314');
    expect(darkHex('#f4f7fc', 'warm')).toBe('#1a1714');
    for (const id of DARK_PALETTE_ORDER) expect(lum(darkHex('#ffffff', id))).toBeGreaterThan(lum(darkHex('#f4f7fc', id)) - 1e-9);
    expect(lum(darkHex('#ffffff', 'amoled'))).toBeGreaterThan(0);
  });
  it('پالت‌ها واقعاً فرق دارند (پس‌زمینه و کارت و تأکید)', () => {
    const bgs = new Set(DARK_PALETTE_ORDER.map((i) => darkHex('#f4f7fc', i)));
    const cards = new Set(DARK_PALETTE_ORDER.map((i) => darkHex('#ffffff', i)));
    expect(bgs.size).toBe(4); expect(cards.size).toBe(4);
    // تأکید فیروزه‌ای فقط در «قهوه‌ای گرم»؛ بقیه آبی می‌مانند
    const hue = (id: DarkPaletteId) => rgbToHsl(hexToRgb(darkHex('#2f74f0', id)))[0];
    expect(Math.abs(hue('warm') - 172)).toBeLessThan(6);
    for (const id of ['navy', 'charcoal', 'amoled'] as const) expect(Math.abs(hue(id) - hue('navy'))).toBeLessThan(1);
    // AMOLED و زغالی بی‌رنگ‌اند
    expect(rgbToHsl(hexToRgb(darkHex('#ffffff', 'amoled')))[1]).toBe(0);
    expect(rgbToHsl(hexToRgb(darkHex('#ffffff', 'charcoal')))[1]).toBeLessThan(0.1);
  });
  it('adaptColor: روشن بدون تغییر؛ تاریک وابسته به پالت', () => {
    expect(adaptColor('#EEF4FF', 'light', 'warm')).toBe('#EEF4FF');
    expect(adaptColor('#EEF4FF', 'dark', 'warm')).toBe(darkHex('#EEF4FF', 'warm'));
    expect(adaptColor('#EEF4FF', 'dark', 'warm')).not.toBe(adaptColor('#EEF4FF', 'dark', 'navy'));
  });
  it('رنگ آیکون انواع هزینه در هر پالت معتبر و روی کارت همان پالت خوانا است', () => {
    for (const id of DARK_PALETTE_ORDER) {
      const card = darkHex('#ffffff', id);
      for (const t of EXPENSE_TYPE_ORDER) {
        const c = typeColors(t, 'dark', id);
        for (const v of [c.color, c.bg, c.iconBg]) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
        expect(contrast(c.color, card)).toBeGreaterThan(3);
      }
    }
    expect(typeColors('water', 'dark').color).toBe(typeColors('water', 'dark', 'navy').color);
    expect(typeColors('water', 'light', 'warm')).toEqual(typeColors('water', 'light'));
  });
  it('پیش‌نمایش: ۶ رنگ معتبر که با تبدیل واقعی یکی است', () => {
    for (const id of DARK_PALETTE_ORDER) {
      const sw = paletteSwatches(id);
      expect(sw).toHaveLength(6);
      expect(sw[0]).toBe(darkHex('#f4f7fc', id));
      expect(sw[1]).toBe(darkHex('#ffffff', id));
      sw.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
    }
  });
  it('تصادفی (۱۰۰۰ رنگ × ۴ پالت): همیشه هگز معتبر؛ متن تیره روی کارت و پس‌زمینه کنتراست ≥ ۴٫۵؛ سطوح روشن تیره می‌شوند', () => {
    const r = prng(7);
    for (let n = 0; n < 1000; n++) {
      const rgb = [0, 0, 0].map(() => Math.floor(r() * 256));
      const hex = '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
      const [, s, l] = rgbToHsl(rgb as [number, number, number]);
      for (const id of DARK_PALETTE_ORDER) {
        const out = darkHex(hex, id);
        expect(out).toMatch(/^#[0-9a-f]{6}$/);
        if (l < 0.45 && s < 0.45) { // متن/آیکون تیره روشن می‌شود
          expect(contrast(out, darkHex('#ffffff', id))).toBeGreaterThanOrEqual(4.5);
          expect(contrast(out, darkHex('#f4f7fc', id))).toBeGreaterThanOrEqual(4.5);
        }
        if (l >= 0.9 && s < 0.2) expect(lum(out)).toBeLessThan(0.09); // سطح روشن خنثی ← تیره
      }
    }
  });
});

describe('CSS تولیدشده برای هر پالت', () => {
  it('با global.css همگام است و برای هر پالت غیرپیش‌فرض بلوک جدا دارد', () => {
    expect(css).toBe(generateDarkCss(readFileSync(SRC_CSS, 'utf8')));
    for (const id of DARK_PALETTE_ORDER.filter((i) => i !== 'navy')) {
      expect(css).toContain(`:root[data-theme="dark"][data-palette="${id}"] { --bg:`);
      expect(css).toContain(`:root[data-theme="dark"][data-palette="${id}"] .bottom-nav`);
    }
    expect(css).not.toContain('data-palette="navy"'); // سرمه‌ای = پایه، بدون بلوک اضافه
  });
  it('پایه با ۱.۶.۱۱ یکی است: متغیرهای سرمه‌ای', () => {
    const v = cssVars(css, 'navy');
    expect(v['--bg']).toBe('#0d121f'); expect(v['--card']).toBe('#151e33'); expect(v['--text']).toBe('#d2d8e4');
    expect(v['--primary-fill']).toBe('#2e68d6');
  });
  for (const id of DARK_PALETTE_ORDER) {
    it(`پالت ${DARK_PALETTES[id].name}: همهٔ متغیرهای رنگی تعریف شده و کنتراست متن/ثانویه/کم‌رنگ/برند کافی است`, () => {
      const v = cssVars(css, id);
      for (const k of ['--bg', '--card', '--text', '--text-2', '--muted', '--border', '--primary', '--success', '--danger', '--warning', '--primary-soft', '--soft-panel', '--primary-fill', '--sw-off-bg', '--warn-bg', '--badge-area-bg']) {
        expect(v[k], `${id} ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(v['--bg']).toBe(darkHex('#f4f7fc', id));
      expect(v['--card']).toBe(darkHex('#ffffff', id));
      for (const bg of [v['--bg'], v['--card'], v['--soft-panel']]) {
        expect(contrast(v['--text'], bg)).toBeGreaterThan(8);
        expect(contrast(v['--text-2'], bg)).toBeGreaterThan(6);
        expect(contrast(v['--muted'], bg)).toBeGreaterThanOrEqual(4.5);
      }
      for (const k of ['--primary', '--success', '--danger', '--warning']) expect(contrast(v[k], v['--card'])).toBeGreaterThan(4.5);
      expect(contrast(v['--text'], v['--primary-soft'])).toBeGreaterThan(7);
      expect(contrast(v['--primary'], v['--primary-soft'])).toBeGreaterThanOrEqual(3.5);
      expect(contrast(v['--warn-color'], v['--warn-bg'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v['--badge-area-color'], v['--badge-area-bg'])).toBeGreaterThanOrEqual(4.5);
      // متغیرهای دستی همان تعریف palette هستند
      expect(v['--primary-fill']).toBe(DARK_PALETTES[id].extras.primaryFill);
    });
  }
  it('قاعده‌های دستی dark.css فقط با متغیر پالت رنگ می‌دهند (بدون هگز ثابت جز سفید و سایه)', () => {
    const manual = readFileSync('src/styles/dark.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const hexes = [...manual.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    expect(hexes.filter((h) => h !== '#fff')).toEqual([]);
    expect(manual).not.toMatch(/:root\[data-theme="dark"\]\s+\./); // همه با [data-palette] قوی‌تر شده‌اند
  });
});

describe('تصویر شبانه صفحه ورود برای هر پالت', () => {
  it('۴ پالت × ۲ تصویر؛ همگام با نسخهٔ روشن؛ نام فایل سرمه‌ای مثل قبل', () => {
    expect(ART_FILES).toHaveLength(8);
    expect(artName('intro-art.svg', 'navy')).toBe('intro-art-dark.svg');
    expect(artName('intro-art-landscape.svg', 'warm')).toBe('intro-art-landscape-dark-warm.svg');
    const skies = new Set<string>();
    for (const { id, src, out } of ART_FILES) {
      const dark = readFileSync(out, 'utf8');
      expect(dark).toBe(generateDarkArt(readFileSync(src, 'utf8'), id));
      expect(dark).not.toMatch(/#(BFD6FF|E4EEFF|F7FAFF|DCE8FF|AFCBFF|F3F7FF)/i);
      if (src.endsWith('intro-art.svg')) skies.add(dark);
    }
    expect(skies.size).toBe(4);
  });
});

describe('ماندگاری انتخاب پالت', () => {
  beforeEach(() => { mem.clear(); billRepository._resetCache(); });
  it('پیش‌فرض سرمه‌ای؛ ذخیره و خواندن؛ مقدار خراب ← سرمه‌ای', async () => {
    expect(await themeRepository.getPalette()).toBe('navy');
    for (const id of DARK_PALETTE_ORDER) { await themeRepository.savePalette(id); expect(await themeRepository.getPalette()).toBe(id); }
    mem.set(PALETTE_KEY, JSON.stringify('rainbow'));
    expect(await themeRepository.getPalette()).toBe('navy');
    mem.set(PALETTE_KEY, JSON.stringify(42));
    expect(await themeRepository.getPalette()).toBe('navy');
  });
  it('پالت داخل پشتیبان نیست و بازیابی آن را عوض نمی‌کند؛ تم مستقل از پالت ذخیره می‌شود', async () => {
    await themeRepository.savePalette('amoled');
    await themeRepository.save('light');
    const text = JSON.stringify(await backupRepository.collect());
    expect(text).not.toContain('darkPalette');
    expect(text).not.toContain('amoled');
    await backupRepository.replaceAll({
      bills: [], units: [], settings: { showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] }, building: { units: [{ alias: null, defaultPersons: 1 }] },
    });
    expect(await themeRepository.getPalette()).toBe('amoled');
    expect(await themeRepository.get()).toBe('light');
  });
});

describe('انتخابگر «تم» در تنظیمات', () => {
  const render = (state: typeof themeState) => { themeState = state; return renderToStaticMarkup(createElement(ThemePicker)); };
  it('گروه «تم» با دو حالت: تاریک (بازشونده، پیش‌فرض بسته) و روشن با نشان «به‌زودی»', () => {
    const html = render({ theme: 'dark', palette: 'navy' });
    expect(html).toContain('<h3 class="settings-sub" id="theme-title">تم</h3>');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('>تاریک<');
    expect(html).toContain('>روشن<');
    expect(html).toContain('به‌زودی');
    expect(html).toContain('پالت: سرمه‌ای عمیق');
    expect(html).toContain('role="radiogroup" aria-label="پالت‌های تاریک"');
    expect(html).toMatch(/class="tp-body"[^>]*hidden/); // بسته: دیده نمی‌شود و فوکوس نمی‌گیرد
  });
  it('۴ پالت با نام، توضیح، پیش‌نمایش و نشان «پیش‌فرض» فقط برای سرمه‌ای', () => {
    const html = render({ theme: 'dark', palette: 'navy' });
    for (const id of DARK_PALETTE_ORDER) {
      expect(html).toContain(DARK_PALETTES[id].name);
      expect(html).toContain(DARK_PALETTES[id].desc);
      expect(html).toContain(`background:${darkHex('#f4f7fc', id)}`);
    }
    expect(html.match(/tp-mini"/g)).toHaveLength(4);
    expect(html.match(/tp-def/g)).toHaveLength(1);
    expect(html.match(/role="radio"/g)).toHaveLength(4);
  });
  it('فقط پالت فعلی (در حالت تاریک) تیک دارد؛ در حالت روشن هیچ‌کدام و «روشن» فعال است', () => {
    const warm = render({ theme: 'dark', palette: 'warm' });
    expect(warm.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(warm).toMatch(/aria-checked="true" class="tp-pal is-active"[^>]*>(?:(?!<button).)*قهوه‌ای گرم/s);
    expect(warm).toContain('tp-mode is-current'); // تاریک
    expect(warm).toContain('aria-pressed="false"'); // روشن
    const light = render({ theme: 'light', palette: 'warm' });
    expect(light).not.toContain('aria-checked="true"');
    expect(light).toContain('aria-pressed="true"');
    expect(light).toContain('پالت: قهوه‌ای گرم'); // پالت در حالت روشن هم نگه داشته می‌شود
  });
  it('CSS انتخابگر بدون هگز ثابت (همه با متغیر) و بدون اسکرول افقی', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const block = css.slice(css.indexOf('انتخابگر «تم»'), css.indexOf('آکاردئون بخش‌های تنظیمات'));
    expect(block).toContain('.tp-pal');
    const hexes = [...block.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    expect(hexes.every((h) => h === '#fff')).toBe(true);
    expect(block).not.toMatch(/overflow-x:\s*scroll|width:\s*\d{3,}px/);
  });
});

describe('تصویر قبض و نوار وضعیت', () => {
  it('تصویر قبض همچنان از تم/پالت مستقل است', () => {
    for (const f of ['../src/services/billImage.tsx', '../src/logic/billImage.ts']) {
      expect(readFileSync(new URL(f, import.meta.url), 'utf8')).not.toMatch(/darkPalettes|darkColor|useTheme|useAdapt|data-palette/);
    }
  });
  it('ThemeProvider پالت را روی ریشه، meta و نوار وضعیت اعمال می‌کند', () => {
    const src = readFileSync('src/context/ThemeContext.tsx', 'utf8');
    expect(src).toContain('dataset.palette = palette');
    expect(src).toContain('themeMetaColor(theme, palette)');
    expect(src).toContain('SystemBarsStyle.Dark');
  });
});
