import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { darkHex } from '../src/logic/darkColor';
import { DARK_PALETTES, DARK_PALETTE_ORDER } from '../src/logic/darkPalettes';

const dark = readFileSync('src/styles/dark.css', 'utf-8');
const gen = readFileSync('src/styles/dark.generated.css', 'utf-8');

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rule = (sel: string) => {
  const m = dark.match(new RegExp(sel.replace(/[.[\]]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error('rule not found: ' + sel);
  return m[1];
};
const prop = (body: string, p: string) => body.match(new RegExp(p + ':\\s*([^;]+);'))?.[1].trim() ?? '';
const SW = ':root[data-theme="dark"][data-palette] .switch';

describe('کلید روشن/خاموش در حالت تاریک (قاعده‌ها با متغیر پالت)', () => {
  const off = rule(SW);
  const on = rule(SW + '.is-on');

  it('روشن و خاموش قاعدهٔ جدا دارند و قاعدهٔ روشن از خودکارِ generated قوی‌تر/دیرتر است', () => {
    expect(gen).toContain(':root[data-theme="dark"] .switch {');
    expect(prop(on, 'background')).not.toBe(prop(off, 'background'));
    expect(prop(on, 'background')).toBe('var(--sw-on-bg)');
    expect(prop(off, 'background')).toBe('var(--sw-off-bg)');
    expect(dark).toContain('.checkbox.is-checked .checkbox__box { background: var(--success-fill)');
  });

  for (const id of DARK_PALETTE_ORDER) {
    describe(`پالت ${DARK_PALETTES[id].name}`, () => {
      const E = DARK_PALETTES[id].extras;
      const CARD = darkHex('#ffffff', id);
      it('خاموش: لبهٔ ۲px نسبت به کارت ≥ ۳:۱؛ روشن: رنگ برند با کنتراست کافی؛ دستگیرهٔ سفید روی پرشده', () => {
        expect(ratio(E.swOffRing, CARD)).toBeGreaterThanOrEqual(3);
        expect(ratio(E.primaryFill, CARD)).toBeGreaterThanOrEqual(2.5);
        expect(ratio('#ffffff', E.primaryFill)).toBeGreaterThanOrEqual(4.5);
        expect(ratio('#ffffff', E.primaryFillPress)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(E.primaryFill, E.swOffBg)).toBeGreaterThanOrEqual(1.3);
        expect(ratio(E.swThumb, E.swOffBg)).toBeGreaterThanOrEqual(3);
      });
      it('چک‌باکس تیک‌خورده: سفید روی سبز پرشده ≥ ۴٫۵؛ لبه‌ها از کارت جدا', () => {
        expect(ratio('#ffffff', E.successFill)).toBeGreaterThanOrEqual(4.5);
        expect(ratio('#ffffff', E.successFillPress)).toBeGreaterThanOrEqual(4.5);
        expect(ratio('#ffffff', E.dangerFill)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(E.cbRing, CARD)).toBeGreaterThanOrEqual(3);
        expect(ratio(E.cbOnBorder, CARD)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
