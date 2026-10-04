import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { darkHex } from '../src/logic/darkColor';
import { DARK_PALETTES, DARK_PALETTE_ORDER } from '../src/logic/darkPalettes';
import { LIGHT_PALETTES, LIGHT_PALETTE_ORDER } from '../src/logic/lightPalettes';

const global = readFileSync('src/styles/global.css', 'utf-8');
const lightGen = readFileSync('src/styles/light.generated.css', 'utf-8');
const lightCss = readFileSync('src/styles/light.css', 'utf-8');
const darkCss = readFileSync('src/styles/dark.css', 'utf-8');
const mainTsx = readFileSync('src/main.tsx', 'utf-8');

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const esc = (s: string) => s.replace(/[.[\]{}()*+?^$|\\]/g, '\\$&');
const varIn = (css: string, selector: string, name: string) => {
  const m = css.match(new RegExp('^' + esc(selector) + '\\s*\\{([^}]*)\\}', 'm'));
  const v = m?.[1].match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  if (!v) throw new Error(`var --${name} not found in ${selector}`);
  return v[1];
};
const MIN = 3;

interface Colors { card: string; on: string; onPress: string; success: string; offBg: string; offRing: string; offThumb: string; onThumb: string }

function lightColors(id: (typeof LIGHT_PALETTE_ORDER)[number]): Colors {
  const sel = `:root[data-theme="light"][data-light="${id}"]`;
  const offSel = sel;
  const base = LIGHT_PALETTES[id].identity
    ? { card: '#ffffff', on: varIn(global, ':root', 'primary'), onPress: varIn(global, ':root', 'primary-press'), success: varIn(global, ':root', 'success') }
    : { card: varIn(lightGen, sel, 'card'), on: varIn(lightGen, sel, 'primary'), onPress: varIn(lightGen, sel, 'primary-press'), success: varIn(lightGen, sel, 'success') };
  return { ...base, offBg: varIn(lightCss, offSel, 'sw-off-bg'), offRing: varIn(lightCss, offSel, 'sw-off-ring'), offThumb: varIn(lightCss, offSel, 'sw-off-thumb'), onThumb: '#ffffff' };
}
function darkColors(id: (typeof DARK_PALETTE_ORDER)[number]): Colors {
  const E = DARK_PALETTES[id].extras;
  return { card: darkHex('#ffffff', id), on: E.swOnBg, onPress: E.swOnRing, success: E.successFill, offBg: E.swOffBg, offRing: E.swOffRing, offThumb: E.swThumb, onThumb: '#ffffff' };
}

const themes: { name: string; c: Colors }[] = [
  ...LIGHT_PALETTE_ORDER.map((id) => ({ name: `روشن/${LIGHT_PALETTES[id].name}`, c: lightColors(id) })),
  ...DARK_PALETTE_ORDER.map((id) => ({ name: `تاریک/${DARK_PALETTES[id].name}`, c: darkColors(id) })),
];

describe('تمایز کلید روشن/خاموش در همهٔ ۹ تم (WCAG 1.4.11، ≥ ۳:۱)', () => {
  it('هر ۹ تم (۵ روشن + ۴ تاریک) پوشش داده می‌شوند', () => {
    expect(themes).toHaveLength(9);
  });

  for (const { name, c } of themes) {
    describe(name, () => {
      it('مسیر روشن در برابر مسیر خاموش ≥ ۳:۱ و در برابر کارت ≥ ۳:۱', () => {
        expect(ratio(c.on, c.offBg), `on/off ${c.on} ${c.offBg}`).toBeGreaterThanOrEqual(MIN);
        expect(ratio(c.on, c.card), `on/card ${c.on} ${c.card}`).toBeGreaterThanOrEqual(MIN);
      });
      it('خاموش: لبهٔ مسیر نسبت به کارت ≥ ۳:۱ و رنگ مسیر با رنگ روشن یکی نیست', () => {
        expect(ratio(c.offRing, c.card), `ring/card ${c.offRing} ${c.card}`).toBeGreaterThanOrEqual(MIN);
        expect(c.offBg.toLowerCase()).not.toBe(c.on.toLowerCase());
      });
      it('دستگیرهٔ هر دو حالت روی مسیر خودش دیده می‌شود (خاموش ≥ ۳، روشن ≥ ۲٫۵)', () => {
        expect(ratio(c.offThumb, c.offBg), `thumb-off ${c.offThumb} ${c.offBg}`).toBeGreaterThanOrEqual(MIN);
        expect(ratio(c.onThumb, c.on), `thumb-on ${c.onThumb} ${c.on}`).toBeGreaterThanOrEqual(2.5);
      });
      it('چک‌باکس تیک‌خورده (سبز) از کارت ≥ ۳:۱ جداست', () => {
        expect(ratio(c.success, c.card), `success/card ${c.success} ${c.card}`).toBeGreaterThanOrEqual(MIN);
      });
    });
  }
});

describe('قاعده‌های CSS: حالت روشن در هیچ تمی با قاعدهٔ خودکار پنهان نمی‌شود', () => {
  it('light.css بعد از light.generated.css وارد می‌شود (برابر ویژگی ⇒ دیرتر برنده است) و dark.css بعد از dark.generated.css', () => {
    expect(mainTsx.indexOf("styles/light.generated.css")).toBeGreaterThan(-1);
    expect(mainTsx.indexOf("styles/light.css")).toBeGreaterThan(mainTsx.indexOf("styles/light.generated.css"));
    expect(mainTsx.indexOf("styles/dark.css'")).toBeGreaterThan(mainTsx.indexOf("styles/dark.generated.css"));
  });

  for (const id of LIGHT_PALETTE_ORDER) {
    it(`light.css برای پالت ${id}: خاموش/روشن/دستگیره/چک‌باکس صریح و روشن = var(--primary)`, () => {
      const pre = `:root[data-theme="light"][data-light="${id}"]`;
      const get = (tail: string) => {
        const re = new RegExp('(?:^|,\\n)' + esc(pre + tail) + '(?=,|\\s*\\{)[^{]*\\{([^}]*)\\}', 'm');
        const m = lightCss.match(re);
        if (!m) throw new Error('rule not found: ' + pre + tail);
        return m[1];
      };
      expect(get(' .switch')).toContain('background: var(--sw-off-bg)');
      expect(get(' .switch.is-on')).toContain('background: var(--primary)');
      expect(get(' .switch.is-on .switch__thumb')).toContain('background: #fff');
      expect(get(' .switch__thumb')).toContain('var(--sw-off-thumb)');
      expect(get(' .checkbox.is-checked .checkbox__box')).toContain('background: var(--success)');
    });
  }

  it('dark.css: روشن از var(--sw-on-bg) و خاموش از var(--sw-off-bg) پر می‌شود', () => {
    expect(darkCss).toMatch(/\.switch\.is-on \{ background: var\(--sw-on-bg\)/);
    expect(darkCss).toMatch(/\.switch \{ background: var\(--sw-off-bg\)/);
  });

  it('جهت دستگیره در RTL درست است: خاموش = راست (آغاز)، روشن = چپ (انتها)', () => {
    expect(global).toMatch(/\.switch__thumb \{[^}]*right: 3px/);
    expect(global).toMatch(/\.switch\.is-on \.switch__thumb \{ right: 23px/);
  });
});
