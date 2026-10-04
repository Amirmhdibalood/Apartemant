import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Complex, type El, type CssRule, matches, parseCss, parseSelector, prepare, winner } from './helpers/cssCascade';

/**
 * ۱.۷.۶ — تیک و حالت «فعال/انتخاب‌شده» در هر ۹ تم.
 * ریشهٔ باگ: در ۴ تم روشن غیرپیش‌فرض (paper/mint/lavender/graycool) قاعدهٔ خودکار
 *   `:root[data-theme="light"][data-light="paper"] .year-row__box { background:#fffdf8; color:#fff }`   (ویژگی ۰،۴،۰)
 * از قاعدهٔ حالت `.year-row.is-active .year-row__box { background: var(--primary) }`   (ویژگی ۰،۳،۰)
 * قوی‌تر بود ⇒ زمینهٔ پرِ کادرِ فعال برنمی‌گشت و تیکِ سفید روی زمینهٔ تقریباً سفید نامرئی می‌شد. (در تم تاریک هم زمینهٔ پر
 * پنهان می‌شد.) آزمونِ ۱.۷.۲ فقط حالت‌های «هم‌سطح» (`.bp-all.is-active`) را می‌دید و انتخاب‌گر نسلی را نه.
 * این آزمون آبشارِ واقعی CSS (ویژگی + ترتیب برگه‌ها) را برای هر ۹ تم شبیه‌سازی می‌کند.
 */
const read = (p: string) => readFileSync(p, 'utf-8');
const SHEETS = ['global', 'dark.generated', 'dark', 'light.generated', 'light'] as const; // ترتیب import در main.tsx
let order = 0;
const all: CssRule[] = [];
for (const s of SHEETS) { const r = parseCss(read(`src/styles/${s}.css`), s, order); order += r.length + 1; all.push(...r); }
const rules = prepare(all);
const globalRules = all.filter((r) => r.sheet === 'global');

const THEMES: { id: string; attrs: Record<string, string>; dark: boolean }[] = [
  { id: 'sky', attrs: { 'data-theme': 'light', 'data-light': 'sky', 'data-palette': 'navy' }, dark: false },
  ...['paper', 'mint', 'lavender', 'graycool'].map((l) => ({ id: l, attrs: { 'data-theme': 'light', 'data-light': l, 'data-palette': 'navy' }, dark: false })),
  ...['navy', 'charcoal', 'amoled', 'warm'].map((p) => ({ id: `dark-${p}`, attrs: { 'data-theme': 'dark', 'data-light': 'sky', 'data-palette': p }, dark: true })),
];

// ---------- ابزار DOM مصنوعی ----------
const mk = (tag: string, classes: string[], attrs: Record<string, string>, parent: El | null, prev: El | null = null): El => ({ tag, classes, attrs, parent, prev });
const rootEl = (attrs: Record<string, string>): El => ({ tag: 'html', classes: [], attrs, parent: null, prev: null, root: true });

// ---------- رنگ ----------
function varOf(el: El, name: string): string | undefined {
  for (let e: El | null = el; e; e = e.parent) { const w = winner(rules, e, name); if (w) return w.value; }
  return undefined;
}
function resolve(el: El, value: string, depth = 0): string {
  if (depth > 8) throw new Error('var loop ' + value);
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!m) return value.trim();
  const v = varOf(el, m[1]);
  if (v !== undefined) return resolve(el, v, depth + 1);
  if (m[2]) return resolve(el, m[2], depth + 1);
  throw new Error('var? ' + m[1]);
}
function hexOf(c: string): string {
  c = c.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  const m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c);
  if (m) return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  if (c === 'white') return '#ffffff';
  throw new Error('color? ' + c);
}
function computed(el: El, prop: 'color' | 'background' | 'border-color'): string | null {
  for (let e: El | null = el; e; e = prop === 'color' ? e.parent : null) {
    let w = winner(rules, e, prop);
    if (prop === 'background') { const w2 = winner(rules, e, 'background-color'); if (!w || (w2 && (w2.spec > w.spec || (w2.spec === w.spec && w2.rule.order > w.rule.order)))) w = w2; }
    if (prop === 'border-color') {
      const sh = winner(rules, e, 'border'); const bc = winner(rules, e, 'border-color');
      const pick = !bc || (sh && (sh.spec > bc.spec || (sh.spec === bc.spec && sh.rule.order > bc.rule.order))) ? sh : bc;
      if (pick) { const parts = pick.value.split(/\s+(?![^(]*\))/); const col = pick === sh ? parts.find((p) => /^(#|var\(|rgb)/.test(p)) : pick.value; if (col) return hexOf(resolve(e, col)); }
      return null;
    }
    if (w) { const v = w.value; if (v === 'transparent' || v === 'none') return null; return hexOf(resolve(e, v)); }
  }
  return null;
}
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ============ ۱) اسکن عمومی: قاعدهٔ حالت در global.css باید در هر تم «برنده» بماند ============
const STATE_CLASS = /^(is-[\w-]+|active|selected|checked|on)$/;
const hasState = (c: Complex) => c.some((x) => x.comp.classes.some((k) => STATE_CLASS.test(k)) || x.comp.attrs.some((a) => /^aria-(pressed|selected|checked|current)$/.test(a.name)));
const COLOR_PROPS = ['background', 'background-color', 'color', 'border-color', 'border'];

/** DOM مصنوعی که فقط انتخاب‌گر داده‌شده را برآورده می‌کند؛ عنصر هدف را برمی‌گرداند */
function build(sel: Complex, root: El): { target: El; live: Set<string> } {
  const live = new Set<string>();
  let parent: El = root; let prev: El | null = null; let cur: El = root;
  sel.forEach((x, i) => {
    x.comp.pseudos.forEach((p) => live.add(p));
    if (x.comp.root) { Object.assign(root.attrs, Object.fromEntries(x.comp.attrs.filter((a) => a.op === '=').map((a) => [a.name, a.val ?? '']))); cur = root; return; }
    const attrs = Object.fromEntries(x.comp.attrs.map((a) => [a.name, a.val ?? '']));
    if (i > 0 && (x.comb === ' ' || x.comb === '>')) { parent = cur; prev = null; }
    else if (i > 0) prev = cur;
    const el = mk(x.comp.tag ?? 'div', [...x.comp.classes], attrs, parent, prev);
    cur = el;
  });
  return { target: cur, live };
}

describe('اسکن عمومی: هیچ قاعدهٔ حالت (.is-*/aria-pressed/…) در global.css زیر قاعدهٔ خودکار/دستی تم گم نمی‌شود', () => {
  const stateRules = globalRules.flatMap((r) => { try { return [{ r, c: parseSelector(r.sel) }]; } catch { return []; } }).filter(({ c }) => hasState(c));
  it('قاعده‌های حالت پیدا شدند', () => { expect(stateRules.length).toBeGreaterThan(40); });
  for (const t of THEMES) {
    it(`تم ${t.id}`, () => {
      const problems: string[] = [];
      for (const { r, c } of stateRules) {
        for (const d of r.decls) {
          if (!COLOR_PROPS.includes(d.prop)) continue;
          const root = rootEl({ ...t.attrs });
          let built: ReturnType<typeof build>;
          try { built = build(c, root); } catch { continue; }
          const w = winner(rules, built.target, d.prop, built.live);
          if (!w) continue;
          if (w.rule.sheet === 'global' && w.rule.sel === r.sel) continue; // خودش برنده است
          const wState = hasState(parseSelector(w.rule.sel));
          if (wState) continue; // قاعدهٔ حالتِ دیگری (دستی/خودکار) برنده است
          if (w.value === d.value) continue; // همان مقدار
          problems.push(`${r.sel} { ${d.prop}: ${d.value} }  ⟵ پنهان شد توسط  ${w.rule.sheet}: ${w.rule.sel} { ${d.prop}: ${w.value} }`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

// ============ ۲) نشانگرهای تیک: کنتراست تیک روی زمینهٔ خودش و جدایی از حالت غیرفعال ============
interface Fixture { name: string; build: (root: El) => { box: El; surface?: El; off?: El }; minFg: number }
const fx: Fixture[] = [
  {
    name: 'سال‌ها / OptionPicker (year-row__box)', minFg: 3,
    build: (root) => {
      const row = mk('label', ['year-row', 'is-active'], {}, root); const box = mk('span', ['year-row__box'], {}, row);
      const rowOff = mk('label', ['year-row'], {}, root); const off = mk('span', ['year-row__box'], {}, rowOff);
      return { box, surface: row, off };
    },
  },
  {
    name: 'چک‌باکس (checkbox__box)', minFg: 3,
    build: (root) => {
      const l = mk('label', ['checkbox', 'is-checked'], {}, root); const box = mk('span', ['checkbox__box'], {}, l);
      const lo = mk('label', ['checkbox'], {}, root); const off = mk('span', ['checkbox__box'], {}, lo);
      return { box, surface: l, off };
    },
  },
  {
    name: 'انتخاب تم/پالت (tp-check)', minFg: 3,
    build: (root) => {
      const b = mk('button', ['tp-pal', 'is-active'], { 'aria-checked': 'true' }, root); const box = mk('span', ['tp-check'], {}, b);
      const bo = mk('button', ['tp-pal'], { 'aria-checked': 'false' }, root); const off = mk('span', ['tp-check'], {}, bo);
      return { box, surface: b, off };
    },
  },
  {
    name: 'پیل فعال «همه/پرداخت‌شده» (bp-all)', minFg: 4.5,
    build: (root) => ({ box: mk('button', ['bp-all', 'is-active'], { 'aria-pressed': 'true' }, root), off: mk('button', ['bp-all'], { 'aria-pressed': 'false' }, root) }),
  },
  ...(['is-ontime', 'is-late', 'is-unpaid'] as const).map((k): Fixture => ({
    name: `تیک کارت خلاصه (bp-tick ${k})`, minFg: 3,
    build: (root) => { const card = mk('button', ['bp-summary__item', k, 'is-selected'], { 'aria-pressed': 'true' }, root); return { box: mk('i', ['bp-tick'], {}, card), surface: card }; },
  })),
  ...(['is-good', 'is-average', 'is-bad'] as const).map((k): Fixture => ({
    name: `برچسب امتیاز پرداخت‌کننده (payer-card ${k})`, minFg: 3,
    build: (root) => { const card = mk('div', ['payer-card', k], {}, root); return { box: mk('span', ['payer-card__rating'], {}, card) }; },
  })),
  {
    name: 'چیپ «پرداخت‌شده» گزارش (rt-chip is-paid)', minFg: 4.5,
    build: (root) => ({ box: mk('span', ['rt-chip', 'is-paid'], {}, root) }),
  },
  {
    name: 'دکمهٔ «تسویه» (pay-btn is-settled)', minFg: 4.5,
    build: (root) => ({ box: mk('button', ['pay-btn', 'is-settled'], {}, root) }),
  },
  {
    name: 'نشان «پرداخت‌شده» سوابق (bill-paid-badge tone-paid)', minFg: 3,
    build: (root) => { const card = mk('div', ['record-card', 'tone-paid'], {}, root); return { box: mk('span', ['bill-paid-badge', 'tone-paid'], {}, card) }; },
  },
];

describe('تیک / نشانگر فعال: رنگ تیک با زمینهٔ خودش کنتراست دارد و با حالت غیرفعال فرق می‌کند (۹ تم)', () => {
  for (const f of fx) {
    describe(f.name, () => {
      for (const t of THEMES) {
        it(t.id, () => {
          const root = rootEl({ ...t.attrs });
          const { box, off } = f.build(root);
          const bg = computed(box, 'background');
          const fg = computed(box, 'color');
          expect(bg, 'زمینهٔ نشانگر فعال باید پر باشد').not.toBeNull();
          expect(fg, 'رنگ تیک').not.toBeNull();
          // پیل فعال در آسمانیِ پیش‌فرض همیشه ۴٫۳۱ بوده (سفید روی #2f74f0)؛ بقیه طبق حد هر نشانگر
          const min = t.id === 'sky' && f.minFg === 4.5 && f.name.includes('bp-all') ? 4.3 : f.minFg;
          expect(ratio(fg!, bg!), `تیک ${fg} روی زمینه ${bg}`).toBeGreaterThanOrEqual(min);
          if (off) {
            const offBg = computed(off, 'background');
            const offBorder = computed(off, 'border-color') ?? offBg;
            // حالت فعال از غیرفعال دیده شود: زمینهٔ فعال با زمینهٔ غیرفعال ≥ ۱٫۵
            if (offBg) expect(ratio(bg!, offBg), `فعال ${bg} در برابر غیرفعال ${offBg}`).toBeGreaterThanOrEqual(1.5);
            void offBorder;
          }
        });
      }
    });
  }
});

describe('خودِ آزمون: انتخاب‌گر نسلی باگ ۱.۷.۵ را می‌گیرد', () => {
  it('در تم paper، بدون قاعدهٔ دستی، .year-row.is-active .year-row__box پنهان می‌شد', () => {
    // شبیه‌سازی خروجی ۱.۷.۵: بدون قاعده‌های دستیِ پایانِ ۱.۷.۶ و بدون قاعدهٔ حالتِ بازنویسی‌شدهٔ مولّد
    const noManual = prepare(all.filter((r) => !(r.sheet === 'light' || r.sheet === 'dark') && !(r.sheet.endsWith('generated') && r.sel.includes('.year-row.is-active'))));
    const root = rootEl({ 'data-theme': 'light', 'data-light': 'paper', 'data-palette': 'navy' });
    const row = mk('label', ['year-row', 'is-active'], {}, root); const box = mk('span', ['year-row__box'], {}, row);
    const w = winner(noManual, box, 'background')!;
    expect(w.rule.sel).toContain('[data-light="paper"] .year-row__box'); // برندهٔ غلط: قاعدهٔ خودکارِ پایه
    expect(matches(parseSelector('.year-row.is-active .year-row__box'), box)).toBe(true);
  });
});
