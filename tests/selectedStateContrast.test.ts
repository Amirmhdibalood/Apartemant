import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ۱.۷.۲ — «حالت انتخاب‌شده/فعال» در همهٔ تم‌ها.
 * ریشهٔ باگ: قاعدهٔ خودکارِ پایه در light/dark.generated.css (`:root[data-theme][data-light] .bp-all { background }`، ویژگی ۰،۴،۰) از
 * قاعدهٔ حالت در global.css (`.bp-all.is-active { background }`، ویژگی ۰،۲،۰) قوی‌تر بود ⇒ زمینهٔ پر برنمی‌گشت ولی `color: #fff` می‌ماند.
 */
const read = (p: string) => readFileSync(p, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
const global = read('src/styles/global.css');
const lightGen = read('src/styles/light.generated.css');
const darkGen = read('src/styles/dark.generated.css');
const lightCss = read('src/styles/light.css');
const darkCss = read('src/styles/dark.css');

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

type Rule = { sel: string; props: Record<string, string> };
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@')) continue;
    const props: Record<string, string> = {};
    for (const d of m[2].split(';')) { const i = d.indexOf(':'); if (i > 0) props[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
    for (const one of sel.split(',')) out.push({ sel: one.trim(), props });
  }
  return out;
}
const STATE = /\.(is-[a-zA-Z-]+|active|selected|checked|on)\b|\[aria-(pressed|selected|checked|current)[^\]]*\]/;
const PREFIX = /^:root\[[^\]]+\](\[[^\]]+\])?(:not\([^)]*\))? /;
const COLOR_PROPS = ['background', 'background-color', 'color', 'border-color', 'border', 'box-shadow'];

describe('هیچ قاعدهٔ حالت (.is-active/.is-on/…) زیر قاعدهٔ خودکارِ تم پنهان نمی‌شود', () => {
  for (const [name, gen, manual] of [['روشن', lightGen, lightCss], ['تاریک', darkGen, darkCss]] as const) {
    it(`تم ${name}: هر ویژگیِ رنگیِ قاعدهٔ حالت یا در خودکار یا در دستی بازتعریف شده است`, () => {
      const cover = new Map<string, Rule[]>();
      for (const r of [...rules(gen), ...rules(manual)]) {
        if (!PREFIX.test(r.sel)) continue;
        const base = r.sel.replace(PREFIX, '');
        cover.set(base, [...(cover.get(base) ?? []), r]);
      }
      const problems: string[] = [];
      for (const g of rules(global)) {
        if (!STATE.test(g.sel)) continue;
        const base = g.sel.replace(new RegExp(STATE.source, 'g'), '').trim();
        const baseRules = cover.get(base) ?? [];
        const stateRules = cover.get(g.sel) ?? [];
        for (const p of COLOR_PROPS) {
          if (!(p in g.props)) continue;
          const overriddenByBase = baseRules.some((b) => p in b.props && !(manual.includes(b.sel)));
          const redefined = stateRules.some((s) => p in s.props);
          if (overriddenByBase && !redefined) problems.push(`${g.sel} { ${p} }`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

/** رنگ‌های متغیر هر تم: بلوک‌های `:root[...] { --x: #hex }` به‌ترتیب ادغام می‌شوند */
function vars(css: string, selector: string, base?: Record<string, string>) {
  const out: Record<string, string> = { ...(base ?? {}) };
  for (const r of rules(css)) if (r.sel === selector) for (const [k, v] of Object.entries(r.props)) if (k.startsWith('--') && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v;
  return out;
}
const globalRoot = vars(global, ':root');
const LIGHT = ['paper', 'mint', 'lavender', 'graycool'].map((id) => ({ name: `روشن/${id}`, v: vars(lightGen, `:root[data-theme="light"][data-light="${id}"]`, globalRoot), dark: false }));
const darkBase = vars(darkGen, ':root[data-theme="dark"]');
const DARK = ['navy', 'charcoal', 'amoled', 'warm'].map((id) => ({
  name: `تاریک/${id}`, v: id === 'navy' ? darkBase : vars(darkGen, `:root[data-theme="dark"][data-palette="${id}"]`, darkBase), dark: true,
}));
const SKY = { name: 'روشن/sky (پیش‌فرض)', v: globalRoot, dark: false };

describe('کنتراست حالت‌های انتخاب‌شده/فعال در هر ۹ تم', () => {
  for (const t of [SKY, ...LIGHT, ...DARK]) {
    describe(t.name, () => {
      const v = t.v;
      const fill = t.dark ? v['--primary-fill'] : v['--primary'];
      it('پیل «همه/پرداخت‌شده» انتخاب‌شده: متن سفید روی زمینهٔ پر ≥ ۴٫۵ و زمینهٔ پر از کارت جداست (≥ ۳)', () => {
        if (t === SKY) return expect(ratio('#ffffff', fill)).toBeGreaterThanOrEqual(4.3); // پیش‌فرض بدون تغییر (۴٫۳۱)
        expect(ratio('#ffffff', fill), `white/${fill}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(fill, v['--card']), `${fill}/card`).toBeGreaterThanOrEqual(3);
      });
      it('تب فعال نوار پایین: --primary روی کارت ≥ ۴٫۵', () => {
        expect(ratio(v['--primary'], v['--card'])).toBeGreaterThanOrEqual(t.dark ? 4.5 : 4.3);
      });
      it('دکمهٔ پرداخت تسویه‌شده و چیپ‌های وضعیت: متن روی زمینهٔ ملایم ≥ ۴٫۵ (پیش‌فرض sky که دست‌نخورده است ≥ ۳)', () => {
        const min = t === SKY ? 3 : 4.5;
        const okText = t.dark ? v['--success'] : t === SKY ? v['--success-press'] : '#14683c'; // light.css: ‎#14683c برای ۴ پالت
        const pendText = t.dark ? v['--primary-press'] : v['--primary'];
        expect(ratio(okText, v['--success-soft']), 'ok').toBeGreaterThanOrEqual(min);
        expect(ratio(pendText, v['--primary-soft']), 'pending').toBeGreaterThanOrEqual(t === SKY ? 3.5 : min);
      });
    });
  }

  it('قاعده‌های دستی وجود دارند (پیل فعال با زمینهٔ پر، در هر دو تم)', () => {
    expect(lightCss).toMatch(/\.bp-all\.is-active \{ background: var\(--primary\);[^}]*color: #fff/);
    expect(darkCss).toMatch(/\.bp-all\.is-active \{ background: var\(--primary-fill\);[^}]*color: #fff/);
    expect(lightCss).toContain('color: #14683c');
    expect(darkCss).toContain('.timing-chip.is-unpaidNoDue { background: var(--primary-soft); color: var(--primary-press); }');
  });
});
