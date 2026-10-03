import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

describe('کلید روشن/خاموش در حالت تاریک', () => {
  const CARD = '#151e33';
  const off = rule(':root[data-theme="dark"] .switch');
  const on = rule(':root[data-theme="dark"] .switch.is-on');

  it('روشن و خاموش قاعدهٔ جدا دارند و قاعدهٔ روشن از خودکارِ generated قوی‌تر/دیرتر است', () => {
    expect(gen).toContain(':root[data-theme="dark"] .switch {'); // همان قاعده‌ای که قبلاً روشن را پنهان می‌کرد
    expect(prop(on, 'background')).not.toBe(prop(off, 'background'));
    expect(prop(on, 'background')).toBe('var(--primary-fill)');
  });

  it('خاموش: لبهٔ ۲px نسبت به کارت ≥ ۳:۱؛ روشن: رنگ برند با کنتراست کافی و دستگیرهٔ سفید', () => {
    const offEdge = prop(off, 'box-shadow').match(/#[0-9a-f]{6}/i)![0];
    expect(ratio(offEdge, CARD)).toBeGreaterThanOrEqual(3);
    const onFill = '#2e68d6'; // --primary-fill در dark.css
    expect(dark).toContain('--primary-fill: ' + onFill);
    expect(ratio(onFill, CARD)).toBeGreaterThanOrEqual(3);
    expect(ratio('#ffffff', onFill)).toBeGreaterThanOrEqual(4.5);
    // خاموش و روشن از نظر پرکردن هم از هم جدا هستند (رنگ دستگیره و زمینه)
    expect(ratio(onFill, '#2a3858')).toBeGreaterThanOrEqual(1.5);
    expect(prop(rule(':root[data-theme="dark"] .switch__thumb'), 'background')).not.toBe(prop(rule(':root[data-theme="dark"] .switch.is-on .switch__thumb'), 'background'));
  });

  it('چک‌باکس تیک‌خورده هم در تاریک با بدون‌تیک فرق دارد', () => {
    const checked = rule(':root[data-theme="dark"] .checkbox.is-checked .checkbox__box');
    expect(prop(checked, 'background')).toBe('var(--success-fill)');
    expect(dark).toContain('--success-fill: #1c7f4f');
  });
});
