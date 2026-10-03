import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { darkHex } from '../src/logic/darkColor';
import { DARK_PALETTES } from '../src/logic/darkPalettes';
import { contrastRatio, lightHex, lightSwatches, lightenCssValue } from '../src/logic/lightColor';
import { DEFAULT_LIGHT_PALETTE, LIGHT_PALETTES, LIGHT_PALETTE_ORDER, sanitizeLightPalette, type LightPaletteId } from '../src/logic/lightPalettes';
import { THEME_META_COLORS, themeMetaColor } from '../src/logic/theme';
import { adaptThemeColor } from '../src/logic/themeColor';
import { typeColors } from '../src/logic/typeColor';
import { BILL_IMAGE_BASE, BILL_STATUS_BASE, billImageColors } from '../src/logic/billImageColors';
import { EXPENSE_TYPES, EXPENSE_TYPE_ORDER } from '../src/models/constants';
import { generateLightCss, OUT_CSS, SRC_CSS } from '../scripts/light-css.mjs';
import { LIGHT_ART_FILES, generateLightArt, lightArtName } from '../scripts/light-art.mjs';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { themeRepository, LIGHT_PALETTE_KEY } = await import('../src/storage/themeRepository');
const { backupRepository } = await import('../src/storage/backupRepository');

let state: { theme: 'light' | 'dark'; palette: 'navy' | 'warm'; lightPalette: LightPaletteId } = { theme: 'light', palette: 'navy', lightPalette: 'sky' };
vi.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({ ...state, toggle: () => undefined, setTheme: () => undefined, setPalette: () => undefined, setLightPalette: () => undefined }),
}));
const { ThemePicker } = await import('../src/components/ThemePicker');

const NEW_IDS = LIGHT_PALETTE_ORDER.filter((id) => id !== 'sky');
const read = (f: string) => readFileSync(f, 'utf8');

describe('پالت‌های روشن: داده', () => {
  it('۵ پالت به ترتیب؛ «آسمانی» پیش‌فرض و همانی؛ نام‌ها طبق مصوب', () => {
    expect(LIGHT_PALETTE_ORDER).toEqual(['sky', 'paper', 'mint', 'lavender', 'graycool']);
    expect(DEFAULT_LIGHT_PALETTE).toBe('sky');
    expect(LIGHT_PALETTES.sky.identity).toBe(true);
    expect(NEW_IDS.every((id) => !LIGHT_PALETTES[id].identity)).toBe(true);
    expect(LIGHT_PALETTE_ORDER.map((id) => LIGHT_PALETTES[id].name)).toEqual(['آسمانی', 'کاغذ گرم', 'نعناعی سرد', 'اسلیت یاسی', 'خاکستری سرد (کنتراست بالا)']);
    expect(new Set(LIGHT_PALETTE_ORDER.map((id) => LIGHT_PALETTES[id].desc)).size).toBe(5);
  });
  it('sanitize: فقط شناسه‌های معتبر', () => {
    for (const id of LIGHT_PALETTE_ORDER) expect(sanitizeLightPalette(id)).toBe(id);
    for (const bad of ['navy', '', 'toString', '__proto__', null, undefined, 3, {}]) expect(sanitizeLightPalette(bad)).toBeNull();
  });
  it('پیش‌نمایش (swatch) هر پالت مطابق مقادیر تأییدشدهٔ مَک‌آپ', () => {
    expect(lightSwatches('sky')).toEqual(['#f4f7fc', '#ffffff', '#1c2440', '#2f74f0', '#25a865', '#ef4444']);
    expect(lightSwatches('paper')).toEqual(['#f6efe2', '#fffdf8', '#3b2d21', '#1c60ad', '#1e8751', '#ef4444']);
    expect(lightSwatches('mint')).toEqual(['#edf7f4', '#fbfefd', '#20363c', '#0d7686', '#1e8751', '#ef4444']);
    expect(lightSwatches('lavender')).toEqual(['#f1effa', '#fdfcff', '#231f3d', '#5d4fd6', '#1e8751', '#ef4444']);
    expect(lightSwatches('graycool')).toEqual(['#eceff3', '#ffffff', '#171c22', '#1244b7', '#1e8751', '#ef4444']);
  });
});

describe('پالت‌های روشن: تبدیل رنگ', () => {
  it('«آسمانی» دقیقاً همانی است (هگز، CSS، سفید و rgba)', () => {
    for (const v of ['#F4F7FC', '#2f74f0', '#ABC', 'rgba(47, 116, 240, 0.25)', '0 4px 18px rgba(33, 56, 102, 0.07)']) expect(lightenCssValue(v, false, false, 'sky')).toBe(v);
    expect(lightHex('#EEF4FF', 'sky')).toBe('#EEF4FF');
    expect(lightHex('نامعتبر', 'paper')).toBe('نامعتبر');
  });
  it('پس‌زمینه و کارت هر پالت به رنگ تعریف‌شده می‌رسند؛ سفید رنگ/آیکون و سفید شفاف سفید می‌مانند', () => {
    for (const id of NEW_IDS) {
      expect(lightHex('#f4f7fc', id)).toBe(LIGHT_PALETTES[id].bg);
      expect(lightHex('#ffffff', id)).toBe(LIGHT_PALETTES[id].card);
      expect(lightenCssValue('#fff', true, false, id)).toBe('#fff');
      expect(lightenCssValue('rgba(255,255,255,0.25)', false, false, id)).toBe('rgba(255,255,255,0.25)');
      expect(lightenCssValue('#ffffff', false, false, id)).toBe(LIGHT_PALETTES[id].card);
    }
  });
  it('رنگ‌های معنایی ثابت: قرمز، زرد، رنگ اصلی نوع هزینه‌ها دست نمی‌خورند', () => {
    for (const id of NEW_IDS) {
      expect(lightHex('#ef4444', id)).toBe('#ef4444');
      expect(lightHex('#f7c23c', id)).toBe('#f7c23c');
      for (const t of EXPENSE_TYPE_ORDER) expect(typeColors(t, 'light', undefined, id).color).toBe(EXPENSE_TYPES[t].color);
    }
  });
  it('رنگ‌مایهٔ سطوح و تأکید هر پالت متفاوت از سایرین است', () => {
    const acc = NEW_IDS.map((id) => lightHex('#2f74f0', id));
    expect(new Set([...acc, '#2f74f0']).size).toBe(5);
    const bgs = LIGHT_PALETTE_ORDER.map((id) => lightHex('#f4f7fc', id));
    expect(new Set(bgs).size).toBe(5);
  });
  it('۵۰۰ رنگ تصادفی: خروجی هگز معتبر؛ سطح روشن روشن و متن تیره تیره می‌ماند', () => {
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    for (let i = 0; i < 500; i++) {
      const g = Math.round(rnd() * 255), tint = Math.round(rnd() * 12);
      const hex = '#' + [g, g, Math.min(255, g + tint)].map((v) => v.toString(16).padStart(2, '0')).join('');
      for (const id of NEW_IDS) {
        const out = lightHex(hex, id);
        expect(out).toMatch(/^#[0-9a-f]{6}$/);
        if (g >= 235) expect(contrastRatio(out, '#000000')).toBeGreaterThan(14); // روشن می‌ماند
        if (g <= 60) expect(contrastRatio(out, '#ffffff')).toBeGreaterThan(7); // تیره می‌ماند
      }
    }
  });
});

describe('پالت‌های روشن: کنتراست', () => {
  for (const id of NEW_IDS) {
    const P = LIGHT_PALETTES[id];
    const [bg, card, text, primary, success] = lightSwatches(id);
    const hc = id === 'graycool';
    describe(P.name, () => {
      it('متن و متن دوم روی زمینه/کارت ≥ ۷؛ متن کم‌رنگ ≥ ۴٫۵ (کنتراست‌بالا ≥ ۷)', () => {
        expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(text, card)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(lightHex('#3d4660', id), card)).toBeGreaterThanOrEqual(7);
        const muted = lightHex('#7a8398', id);
        expect(contrastRatio(muted, bg)).toBeGreaterThanOrEqual(hc ? 7 : 4.5);
        expect(contrastRatio(muted, card)).toBeGreaterThanOrEqual(hc ? 7 : 4.5);
      });
      it('رنگ تأکید: سفید روی آن و خودِ آن روی کارت/زمینه ≥ ۴٫۵؛ دکمهٔ فشرده و متن روی نرم هم', () => {
        expect(contrastRatio('#ffffff', primary)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(primary, card)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(primary, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio('#ffffff', lightHex('#2563d9', id))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(primary, lightHex('#eaf1fe', id))).toBeGreaterThanOrEqual(4.3);
        if (hc) expect(contrastRatio(primary, bg)).toBeGreaterThanOrEqual(7);
      });
      it('سبز موفق: سفید روی آن ≥ ۴٫۵ و متن سبز تیره روی کارت ≥ ۴٫۵', () => {
        expect(contrastRatio('#ffffff', success)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio('#ffffff', lightHex('#1f9557', id))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(lightHex('#1f6b44', id), card)).toBeGreaterThanOrEqual(4.5);
      });
      it('حاشیه و کلید خاموش از کارت جدا می‌مانند و کارت از زمینه', () => {
        expect(contrastRatio(card, bg)).toBeGreaterThanOrEqual(1.05);
        expect(contrastRatio(lightHex('#e4e9f2', id), card)).toBeGreaterThanOrEqual(hc ? 1.3 : 1.1);
        expect(contrastRatio(lightHex('#c3cad8', id), card)).toBeGreaterThanOrEqual(1.4);
      });
    });
  }
  it('وضعیت‌های تصویر قبض در هر پالت روی زمینهٔ خودشان خوانا هستند', () => {
    for (const id of LIGHT_PALETTE_ORDER) {
      const { C, STATUS } = billImageColors(id);
      expect(contrastRatio(C.text, C.card)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(C.muted, C.card)).toBeGreaterThanOrEqual(id === 'sky' ? 3.5 : 4.5);
      expect(contrastRatio(C.primary, C.primarySoft)).toBeGreaterThanOrEqual(id === 'sky' ? 3.5 : 4.3);
      for (const k of ['settled', 'partial', 'unpaid'] as const) expect(contrastRatio(STATUS[k].fg, STATUS[k].bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('CSS تولیدشده (light.generated.css)', () => {
  const css = generateLightCss(read(SRC_CSS));
  it('با فایل ذخیره‌شده همگام است (npm run theme:generate)', () => {
    expect(read(OUT_CSS)).toBe(css);
  });
  it('«آسمانی» بلوک ندارد؛ هر پالت دیگر بلوک متغیرهای خودش را دارد', () => {
    expect(css).not.toContain('data-light="sky"');
    for (const id of NEW_IDS) {
      const P = LIGHT_PALETTES[id];
      const m = css.match(new RegExp(`:root\\[data-theme="light"\\]\\[data-light="${id}"\\] \\{ --bg: (#[0-9a-f]{6});`));
      expect(m?.[1]).toBe(P.bg);
      expect(css).toContain(`:root[data-theme="light"][data-light="${id}"] .bottom-nav`);
    }
  });
  it('هر قاعدهٔ دارای متن سفید و زمینهٔ تک‌رنگ: کنتراست ≥ ۴٫۵ در همهٔ پالت‌های جدید', () => {
    const bad: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim(), body = m[2];
      if (!/(^|;\s*)color:\s*#fff\b/.test(body.replace(/^\s+/, ''))) continue;
      const bgm = body.match(/(?:^|;\s*|\s)background(?:-color)?:\s*(#[0-9a-f]{6})\s*[;}]?/);
      if (bgm && !Object.values(LIGHT_PALETTES).some((P) => P.card === bgm[1]) && contrastRatio('#ffffff', bgm[1]) < 4.5) bad.push(`${sel} → ${bgm[1]}`);
    }
    expect(bad).toEqual([]);
  });
  it('زمینه‌های سفید (چک‌باکس، ردیف سال) فقط به رنگ کارت می‌روند، نه رنگ پُر', () => {
    for (const id of NEW_IDS) {
      expect(css).toContain(`[data-light="${id}"] .checkbox__box { border: 1.6px solid`);
      const m = css.match(new RegExp(`\\[data-light="${id}"\\] \\.checkbox__box \\{[^}]*background: (#[0-9a-f]{6})`));
      expect(m?.[1]).toBe(LIGHT_PALETTES[id].card);
    }
  });
  it('متغیرهای رنگ پُر (:root) برای متن سفید کافی‌اند: primary، success، danger ≥ ۴٫۵', () => {
    for (const id of NEW_IDS) {
      const root = css.match(new RegExp(`\\[data-light="${id}"\\] \\{ (--bg:[^}]*)\\}`))![1];
      for (const v of ['--primary', '--primary-press', '--success', '--success-press', '--danger']) {
        const c = root.match(new RegExp(`${v}: (#[0-9a-f]{6});`))![1];
        expect(contrastRatio('#ffffff', c), `${id} ${v}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('هیچ قاعدهٔ دارکِ تولیدی با قاعدهٔ روشن تداخل ندارد (پیشوند data-theme="light")', () => {
    const dark = read('src/styles/dark.generated.css');
    expect(dark).not.toContain('data-light');
    expect(css).not.toContain('data-theme="dark"');
  });
  it('main.tsx فایل را بعد از قاعده‌های پایه بارگذاری می‌کند', () => {
    const main = read('src/main.tsx');
    expect(main.indexOf("./styles/global.css")).toBeLessThan(main.indexOf('./styles/light.generated.css'));
  });
});

describe('تصویر صفحه ورود برای پالت‌های روشن', () => {
  it('برای ۴ پالت جدید × (عمودی/افقی) فایل همگام تولید می‌شود؛ «آسمانی» همان فایل اصلی', () => {
    expect(LIGHT_ART_FILES).toHaveLength(8);
    for (const { id, src, out } of LIGHT_ART_FILES) {
      expect(read(out)).toBe(generateLightArt(read(src), id));
      expect(out.endsWith(lightArtName(src.split('/').pop()!, id))).toBe(true);
    }
    const intro = read('src/screens/introArt.ts');
    for (const id of NEW_IDS) expect(intro).toContain(`intro-art-light-${id}.svg`);
    expect(intro).toContain("sky: { portrait: introArt, landscape: introArtLandscape }");
    expect(read('src/screens/IntroScreen.tsx')).toContain('introArtFor(theme === \'dark\', palette, lightPalette)');
  });
  it('رنگ‌های SVG هر پالت واقعاً عوض می‌شوند', () => {
    const base = read('src/assets/intro-art.svg');
    for (const id of NEW_IDS) expect(read(`src/assets/intro-art-light-${id}.svg`)).not.toBe(base);
  });
});

describe('ذخیره‌سازی و پشتیبان', () => {
  it('کلید lightPalette؛ پیش‌فرض آسمانی؛ مقدار خراب = آسمانی', async () => {
    expect(LIGHT_PALETTE_KEY).toBe('lightPalette');
    expect(await themeRepository.getLightPalette()).toBe('sky');
    await themeRepository.saveLightPalette('lavender');
    expect(mem.get('lightPalette')).toBe('"lavender"');
    expect(await themeRepository.getLightPalette()).toBe('lavender');
    mem.set('lightPalette', '"nope"');
    expect(await themeRepository.getLightPalette()).toBe('sky');
  });
  it('در فایل پشتیبان نیست و با بازیابی دست‌نخورده می‌ماند', async () => {
    await themeRepository.saveLightPalette('graycool');
    await themeRepository.save('light');
    const text = JSON.stringify(await backupRepository.collect());
    expect(text).not.toContain('lightPalette');
    expect(text).not.toContain('graycool');
    await backupRepository.replaceAll({ bills: [], units: [], settings: { showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] }, building: { units: [{ alias: null, defaultPersons: 1 }] } });
    expect(await themeRepository.getLightPalette()).toBe('graycool');
    expect(await themeRepository.get()).toBe('light');
  });
});

describe('انتخابگر «تم»: روشن مثل تاریک بازمی‌شود', () => {
  const render = (s: typeof state) => { state = s; return renderToStaticMarkup(createElement(ThemePicker)); };
  it('بدون «به‌زودی»؛ ۵ ردیف رادیویی روشن با نام، توضیح و پیش‌نمایش؛ «پیش‌فرض» فقط برای آسمانی', () => {
    const html = render({ theme: 'light', palette: 'navy', lightPalette: 'sky' });
    expect(html).not.toContain('به‌زودی');
    expect(html).not.toContain('tp-soon');
    const light = html.slice(html.indexOf('aria-label="پالت‌های روشن"'));
    expect(light.match(/role="radio"/g)).toHaveLength(5);
    expect(light.match(/tp-def/g)).toHaveLength(1);
    for (const id of LIGHT_PALETTE_ORDER) {
      expect(light).toContain(LIGHT_PALETTES[id].name);
      expect(light).toContain(LIGHT_PALETTES[id].desc);
      expect(light).toContain(`background:${lightSwatches(id)[0]}`);
    }
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2); // هر دو سر بازشونده، پیش‌فرض بسته
    expect(html.match(/class="tp-body"[^>]*hidden/g)).toHaveLength(2);
  });
  it('فقط پالت روشن فعلی (در حالت روشن) تیک دارد؛ در حالت تاریک هیچ پالت روشنی تیک ندارد', () => {
    const mint = render({ theme: 'light', palette: 'warm', lightPalette: 'mint' });
    expect(mint.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(mint).toMatch(/aria-checked="true" class="tp-pal is-active"[^>]*>(?:(?!<button).)*نعناعی سرد/s);
    expect(mint).toContain('پالت: نعناعی سرد');
    expect(mint).toContain('پالت: قهوه‌ای گرم');
    const dark = render({ theme: 'dark', palette: 'warm', lightPalette: 'mint' });
    expect(dark.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(dark).toMatch(/aria-checked="true" class="tp-pal is-active"[^>]*>(?:(?!<button).)*قهوه‌ای گرم/s);
    expect(dark).toContain('پالت: نعناعی سرد'); // پالت روشن در حالت تاریک هم نگه داشته می‌شود
  });
  it('کد انتخابگر هگز ثابت ندارد (همه از پالت)', () => {
    expect(read('src/components/ThemePicker.tsx')).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});

describe('اعمال تم: ریشه، meta، نوار وضعیت، هم‌گامی با دکمهٔ سرصفحه', () => {
  it('meta theme-color: آسمانی همان مقدار قبلی؛ سایر پالت‌ها پس‌زمینهٔ خودشان؛ تاریک بدون تغییر', () => {
    expect(themeMetaColor('light')).toBe(THEME_META_COLORS.light);
    expect(themeMetaColor('light', 'navy', 'sky')).toBe('#DCE8FF');
    for (const id of NEW_IDS) expect(themeMetaColor('light', 'navy', id)).toBe(LIGHT_PALETTES[id].bg);
    expect(themeMetaColor('dark', 'warm', 'paper')).toBe(DARK_PALETTES.warm.metaColor);
  });
  it('ThemeContext: data-light، آینهٔ سبک، setLightPalette حالت را «روشن» می‌کند و ذخیره می‌کند', () => {
    const src = read('src/context/ThemeContext.tsx');
    expect(src).toContain('dataset.light = lightPalette');
    expect(src).toContain('themeMetaColor(theme, palette, lightPalette)');
    expect(src).toContain('themeRepository.saveLightPalette(p)');
    expect(src).toMatch(/setLightPalette = useCallback\(\(p: LightPaletteId\) => \{[\s\S]*?setStored\('light'\)[\s\S]*?themeRepository\.save\('light'\)/);
    expect(src).toContain('themeRepository.getLightPalette()');
    expect(src).toContain('adaptThemeColor(hex, theme, palette, lightPalette)');
    const html = read('index.html');
    expect(html).toContain("r.dataset.light =");
    expect(html).toContain('bc.themeMirror');
  });
  it('دکمهٔ ماه/خورشید فقط حالت را عوض می‌کند (پالت‌ها حفظ می‌شوند)', () => {
    expect(read('src/components/ThemeToggle.tsx')).toContain('toggle');
    const ctx = read('src/context/ThemeContext.tsx');
    expect(ctx).toMatch(/const toggle = useCallback\(\(\) => \{\s*const next = toggleTheme\(theme\);/);
  });
  it('adaptThemeColor: تاریک ← پالت تاریک؛ روشن ← پالت روشن (آسمانی همانی)', () => {
    expect(adaptThemeColor('#EEF4FF', 'dark', 'warm', 'paper')).toBe(darkHex('#EEF4FF', 'warm'));
    expect(adaptThemeColor('#EEF4FF', 'light', 'warm', 'sky')).toBe('#EEF4FF');
    expect(adaptThemeColor('#EEF4FF', 'light', 'navy', 'paper')).toBe(lightHex('#EEF4FF', 'paper'));
    expect(adaptThemeColor('#EEF4FF', 'light', 'navy', 'paper')).not.toBe('#EEF4FF');
  });
  it('آیکون نوع هزینه: روشن + پالت ← زمینه‌ها تطبیق می‌یابند؛ آسمانی دست‌نخورده', () => {
    for (const t of EXPENSE_TYPE_ORDER) {
      expect(typeColors(t, 'light')).toEqual({ color: EXPENSE_TYPES[t].color, bg: EXPENSE_TYPES[t].bg, iconBg: EXPENSE_TYPES[t].iconBg });
      expect(typeColors(t, 'light', 'navy', 'sky')).toEqual(typeColors(t, 'light'));
    }
    expect(typeColors('water', 'light', undefined, 'paper').bg).toBe(lightHex(EXPENSE_TYPES.water.bg, 'paper'));
    expect(typeColors('water', 'light', undefined, 'paper').bg).not.toBe(EXPENSE_TYPES.water.bg);
  });
});

describe('تصویر قبض با پالت روشن', () => {
  it('آسمانی = رنگ‌های قبلی؛ سایر پالت‌ها تغییر می‌کنند؛ رنگ معنایی (بنفش/فیروزه‌ای) ثابت', () => {
    const sky = billImageColors('sky');
    expect(sky.C).toEqual(BILL_IMAGE_BASE);
    expect(sky.STATUS).toEqual(BILL_STATUS_BASE);
    for (const id of NEW_IDS) {
      const x = billImageColors(id);
      expect(x.C.bg).not.toBe(BILL_IMAGE_BASE.bg);
      expect(x.C.primary).not.toBe(BILL_IMAGE_BASE.primary);
      expect(x.C.card).toBe(LIGHT_PALETTES[id].card);
      expect(x.C.purple.toLowerCase()).toBe(BILL_IMAGE_BASE.purple.toLowerCase());
      expect(x.C.teal.toLowerCase()).toBe(BILL_IMAGE_BASE.teal.toLowerCase());
      expect(x.STATUS.unpaid.fg).not.toBe('');
    }
  });
  it('renderBillImage پالت را از data-light می‌خواند و مستقل از پالت تاریک است', () => {
    const src = read('src/services/billImage.tsx');
    expect(src).toContain('document.documentElement.dataset.light');
    expect(src).toContain('billImageColors(lp)');
    expect(src).not.toMatch(/darkPalettes|darkColor|useTheme|data-palette/);
  });
});

describe('نسخه و متن‌ها', () => {
  it('package.json: نسخه معتبر و versionCode ≥ ۲۱ (نسخهٔ پالت‌های روشن ۱.۶.۱۳ بود)', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.versionCode).toBeGreaterThanOrEqual(21);
  });
  it('دستور theme:generate همهٔ مولدها را اجرا می‌کند', () => {
    const s = JSON.parse(read('package.json')).scripts['theme:generate'] as string;
    for (const f of ['dark-css', 'dark-art', 'light-css', 'light-art']) expect(s).toContain(`scripts/${f}.mjs`);
  });
});
