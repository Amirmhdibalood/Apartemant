/**
 * ۱.۷.۵ — رگرسیون: در تصویر خروجی «جمع قبض‌های ماه»، چیپ «پرداخت‌شده X» واحدِ پرداخت‌جزئی روی خط ریز «از مجموع Y»
 * زیر مبلغ می‌افتاد (چیپ در left+عرض‌مبلغ+۱۰ کشیده می‌شد، ولی خط ریز پهن‌تر از مبلغ بود). این آزمون:
 *  ۱) منطق چیدمان خالص (`rowTrailingLayout`) را با هزاران عرض تصادفی می‌سنجد؛
 *  ۲) خود `drawRow` را با یک ctx جعلی اجرا و جعبهٔ همهٔ متن‌ها و گوی چیپ را اندازه می‌گیرد: هیچ دو جعبه‌ای همپوشانی ندارد،
 *     همه داخل ردیف‌اند و ارتفاع ردیف با خط ریز رشد می‌کند.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { boxesOverlap, MIN_ROW_H_WITH_SUB, rowTrailingLayout, type Box } from '../src/logic/rowLayout';
import { drawRow, type Env } from '../src/services/reportImage';
import { billImageColors } from '../src/logic/billImageColors';
import { monthlyTotals } from '../src/logic/monthlyTotals';
import { monthlyDoc, type DocRow, type DocBlock } from '../src/logic/reportDoc';
import type { BillWithUnits, Unit } from '../src/models/types';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('چیدمان خالص بخش چپ ردیف', () => {
  it('حالت باگ: خط ریز پهن‌تر از مبلغ — با فرمول قدیمی چیپ روی خط ریز می‌افتاد، با چیدمان جدید نه', () => {
    const left = 38, valueW = 70, subW = 105, tagW = 110;
    const oldTag: Box = { x0: left + valueW + 10, x1: left + valueW + 10 + tagW, y0: -11, y1: 11 };
    const l = rowTrailingLayout({ left, valueW, subW, tagW, hasSub: true });
    expect(boxesOverlap(oldTag, l.sub!)).toBe(true); // نشان می‌دهد آزمون حساس است
    expect(boxesOverlap(l.tag!, l.sub!)).toBe(false);
    expect(boxesOverlap(l.tag!, l.value)).toBe(false);
    expect(l.tag!.x0).toBeGreaterThanOrEqual(l.sub!.x1 + 10);
  });
  it('۵۰۰۰ ترکیب تصادفی: هیچ دو جعبه‌ای (مبلغ، خط ریز، چیپ) همپوشانی ندارند و داخل نیم‌ارتفاع کمینهٔ ردیف می‌مانند', () => {
    const r = rng(175);
    for (let i = 0; i < 5000; i++) {
      const hasSub = r() < 0.7;
      const l = rowTrailingLayout({ left: 38, valueW: 20 + r() * 200, subW: 30 + r() * 250, tagW: r() < 0.8 ? 40 + r() * 140 : 0, hasSub });
      const bs = [l.value, l.sub, l.tag].filter((b): b is Box => !!b);
      for (let a = 0; a < bs.length; a++) {
        for (let b = a + 1; b < bs.length; b++) expect(boxesOverlap(bs[a], bs[b])).toBe(false);
        if (hasSub) { expect(bs[a].y0).toBeGreaterThanOrEqual(-MIN_ROW_H_WITH_SUB / 2); expect(bs[a].y1).toBeLessThanOrEqual(MIN_ROW_H_WITH_SUB / 2); }
      }
      if (l.tag) expect(l.trailW).toBe(l.tag.x1 - 38);
    }
  });
});

// ---- ctx جعلی: اندازه‌گیری متن و گوی‌های رسم‌شده ----
interface Op { text: string; x: number; y: number; align: string; size: number }
function fakeEnv(draw = true) {
  const texts: Op[] = [];
  const pills: Box[] = [];
  let cur: Box | null = null;
  const ext = (x: number, y: number) => { if (!cur) cur = { x0: x, x1: x, y0: y, y1: y }; cur.x0 = Math.min(cur.x0, x); cur.x1 = Math.max(cur.x1, x); cur.y0 = Math.min(cur.y0, y); cur.y1 = Math.max(cur.y1, y); };
  const ctx = {
    font: '', fillStyle: '', textAlign: 'right', textBaseline: 'middle', direction: 'rtl',
    measureText(s: string) { const px = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 12); return { width: Array.from(s).length * px * 0.58 }; },
    fillText(s: string, x: number, y: number) { texts.push({ text: s, x, y, align: this.textAlign, size: Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 12) }); },
    beginPath() { cur = null; }, moveTo: ext, lineTo: ext, arcTo(x1: number, y1: number, x2: number, y2: number) { ext(x1, y1); ext(x2, y2); }, closePath() { /* */ },
    arc(x: number, y: number, r: number) { ext(x - r, y - r); ext(x + r, y + r); },
    fill() { if (cur) pills.push({ ...(cur as Box) }); }, fillRect() { /* خط جداکننده */ }, drawImage() { /* */ },
  };
  const env = { ctx: ctx as unknown as CanvasRenderingContext2D, draw, pal: billImageColors('sky'), lp: 'sky', icons: new Map(), app: null, breaks: [] } as unknown as Env;
  return { env, texts, pills };
}
const textBox = (o: Op, w: (s: string) => number): Box => {
  const tw = w(o.text), h = o.size * 1.1;
  const x0 = o.align === 'left' ? o.x : o.align === 'center' ? o.x - tw / 2 : o.x - tw;
  return { x0, x1: x0 + tw, y0: o.y - h / 2, y1: o.y + h / 2 };
};

function rowBoxes(row: DocRow, y = 100) {
  const { env, texts, pills } = fakeEnv();
  const end = drawRow(env, row, y, false);
  const w = (s: string) => Array.from(s).length * 0.58 * (texts.find((t) => t.text === s)?.size ?? 12);
  const tb = texts.map((t) => ({ t, b: textBox(t, w) }));
  return { y0: y, y1: end, tb, pills };
}

describe('drawRow با ctx جعلی (همان کد تصویر خروجی)', () => {
  const VAL = ['۰ تومان', '۴۰۰٬۰۰۰ تومان', '۲٬۱۰۰٬۷۶۵٬۴۴۲ تومان', '۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹ تومان'];
  const SUB = ['از مجموع ۶۵۰٬۰۰۰', 'از مجموع ۱٬۰۵۰٬۷۰۰', 'از مجموع ۳٬۳۳۵٬۸۳۳٬۳۳۲', 'از مجموع ۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹'];
  const TAG = ['پرداخت‌شده', 'پرداخت‌نشده', 'پرداخت‌شده ۱۲۶٬۸۷۵', 'پرداخت‌شده ۱٬۲۳۴٬۵۶۷٬۸۹۰', 'پرداخت‌شده ۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹'];
  const LAB = ['واحد ۱', 'واحد ۲ - آقای رضایی', 'واحد ۲ - مجتمع تجاری و اداری آقای محمدحسین‌زاده‌نژاد', 'واحد ۳ - خانم دکتر سیده فاطمه موسوی‌پور'];
  const SUBT = ['۳ نفر • قابل پرداخت', '۱۲ نفر • قابل پرداخت'];

  it('همهٔ ترکیب‌های مبلغ × خط ریز × چیپ × برچسب: هیچ همپوشانی و همه داخل ردیف', () => {
    let n = 0;
    for (const value of VAL) for (const valueSub of [...SUB, undefined]) for (const tag of [...TAG, undefined]) for (const label of LAB) for (const sub of SUBT) {
      const row: DocRow = { label, sub, value, valueSub, tag: tag ? { text: tag, tone: 'info' } : undefined };
      const { y0, y1, tb, pills } = rowBoxes(row);
      n++;
      if (valueSub) expect(y1 - y0).toBeGreaterThanOrEqual(MIN_ROW_H_WITH_SUB);
      const boxes: { n: string; b: Box }[] = tb.filter(({ t }) => !(tag && t.text === tag)).map(({ t, b }) => ({ n: t.text, b }));
      if (tag) {
        expect(pills.length).toBe(1);
        boxes.push({ n: 'pill', b: pills[0] });
        const tagText = tb.find(({ t }) => t.text === tag)!.b;
        expect(tagText.x0).toBeGreaterThanOrEqual(pills[0].x0 - 0.5); // متن چیپ درون گوی خودش
        expect(tagText.x1).toBeLessThanOrEqual(pills[0].x1 + 0.5);
      }
      for (let i = 0; i < boxes.length; i++) {
        expect([boxes[i].n, boxes[i].b.y0 >= y0 - 0.01 && boxes[i].b.y1 <= y1 + 0.01]).toEqual([boxes[i].n, true]);
        for (let j = i + 1; j < boxes.length; j++) {
          expect([boxes[i].n, boxes[j].n, boxesOverlap(boxes[i].b, boxes[j].b)]).toEqual([boxes[i].n, boxes[j].n, false]);
        }
      }
    }
    expect(n).toBeGreaterThan(900);
  });

  it('سناریوی گزارش واقعی: سه واحد (کامل، جزئی با مبلغ بزرگ، بدون پرداخت) — هیچ همپوشانی', () => {
    const mk = (id: string, shares: number[], paid: number[]): BillWithUnits => ({
      bill: { id, year: 1405, month: 7, expenseType: 'electricity', billNumber: null, description: null, totalAmount: shares.reduce((a, b) => a + b, 0), createdAt: `2026-09-2${id.length}T08:00:00.000Z`, isFullySettled: false, splitMethod: 'perUnit' },
      units: shares.map((s, i): Unit => ({ id: `${id}${i}`, billId: id, unitNumber: i + 1, personCount: 3, alias: i === 1 ? 'مجتمع تجاری و اداری آقای محمدحسین‌زاده‌نژاد' : null, shareAmount: s, isSettled: paid[i] >= s, payments: paid[i] > 0 ? [{ id: `p${id}${i}`, amount: paid[i], paidAt: null }] : [] })),
    });
    const t = monthlyTotals([mk('e', [3_333_333_333, 3_333_333_333, 3_333_333_333], [3_333_333_333, 1_234_567_890, 0])], 1405, 7);
    const rows = monthlyDoc(t).blocks.find((b): b is Extract<DocBlock, { k: 'rows' }> => b.k === 'rows' && b.rows.length > 0)!.rows;
    expect(rows[1].tag?.text).toContain('پرداخت‌شده');
    expect(rows[1].valueSub).toContain('از مجموع');
    for (const r of rows) {
      const { y0, y1, tb, pills } = rowBoxes(r);
      const tag = r.tag?.text;
      const boxes = tb.filter(({ t }) => t.text !== tag).map(({ b }) => b).concat(pills);
      boxes.forEach((b, i) => { expect(b.y0).toBeGreaterThanOrEqual(y0 - 0.01); expect(b.y1).toBeLessThanOrEqual(y1 + 0.01); for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(b, boxes[j])).toBe(false); });
    }
  });

  it('کد: چیپ دیگر در left + عرض‌مبلغ + ۱۰ کشیده نمی‌شود و از چیدمان مشترک می‌آید', () => {
    const src = readFileSync(new URL('../src/services/reportImage.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/left \+ vw \+ 10/);
    expect(src).toContain('rowTrailingLayout');
    expect(src).toContain('lay.tag!.x0');
    expect(src).toContain('tagBelow'); // جای کم ← چیپ زیر برچسب و رشد ارتفاع ردیف
  });
});
