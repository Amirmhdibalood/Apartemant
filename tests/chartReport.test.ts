import { describe, expect, it } from 'vitest';
import type { BillWithUnits, ExpenseType } from '../src/models/types';
import { chartSeries, normalizeRange, typeShares } from '../src/logic/chartReport';
import { barLayout, pieLayout, pieSlicePath, faPercent, CHART_MIN_W, SLOT_MIN } from '../src/logic/chartLayout';
import { chartDoc } from '../src/logic/reportDoc';

let seq = 0;
const bill = (year: number, month: number, type: ExpenseType, amount: number, deleted = false): BillWithUnits => {
  const id = `c${++seq}`;
  return { bill: { id, year, month, expenseType: type, billNumber: null, description: null, totalAmount: amount, createdAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(), isFullySettled: false, ...(deleted ? { deletedAt: '2026-01-01T00:00:00.000Z' } : {}) }, units: [] };
};
const data = [
  bill(1405, 1, 'water', 100_000), bill(1405, 1, 'gas', 50_000),
  bill(1405, 2, 'water', 150_000),
  bill(1405, 4, 'water', 300_000), // ماه ۳ بدون قبض
  bill(1405, 5, 'water', 300_000),
  bill(1405, 5, 'electricity', 40_000, true), // حذف‌شده
  bill(1404, 1, 'water', 9_999_999),
];

describe('گزارش نموداری: سری ماهانه', () => {
  it('مبلغ هر ماه فقط سال و بازهٔ انتخابی؛ حذف‌شده و سال دیگر نه', () => {
    const s = chartSeries(data, 1405, null, 1, 6);
    expect(s.months.map((m) => m.total)).toEqual([150_000, 150_000, 0, 300_000, 300_000, 0]);
    expect(s.total).toBe(900_000);
    expect(s.monthsWithData).toBe(4);
    expect(s.average).toBe(225_000);
  });
  it('تغییر نسبت به ماه قبل فقط بین دو ماهِ دارای قبض؛ درصد درست', () => {
    const s = chartSeries(data, 1405, 'water', 1, 5);
    expect(s.months.map((m) => m.delta)).toEqual([null, 50_000, null, null, 0]);
    expect(s.months[1].percent).toBeCloseTo(50);
    expect(s.months[4].percent).toBe(0);
  });
  it('بیشترین/کمترین: بین ماه‌های دارای داده؛ بدون آن اگر کمتر از دو ماه یا مقدارها برابر', () => {
    const s = chartSeries(data, 1405, 'water', 1, 5);
    expect(s.max!.total).toBe(300_000);
    expect(s.min!.month).toBe(1);
    expect(s.months.filter((m) => m.isMax).map((m) => m.month)).toEqual([4, 5]);
    const one = chartSeries(data, 1405, 'water', 1, 1);
    expect(one.max).toBeNull(); expect(one.min).toBeNull();
    const eq = chartSeries([bill(1405, 1, 'gas', 5), bill(1405, 2, 'gas', 5)], 1405, null, 1, 2);
    expect(eq.max).toBeNull(); expect(eq.months.some((m) => m.isMax || m.isMin)).toBe(false);
  });
  it('نوع خاموش (types) کنار می‌رود؛ بازهٔ برعکس جابه‌جا و بیرون از ۱..۱۲ بریده می‌شود', () => {
    expect(chartSeries(data, 1405, null, 1, 1, ['water']).total).toBe(100_000);
    expect(normalizeRange(8, 3)).toEqual([3, 8]);
    expect(normalizeRange(-4, 99)).toEqual([1, 12]);
    expect(chartSeries(data, 1405, null, 6, 2).from).toBe(2);
  });
});

describe('گزارش نموداری: سهم انواع (دایره‌ای)', () => {
  it('جمع درصدها ۱۰۰ و جمع مبلغ‌ها = جمع قبض‌های بازه؛ بزرگ‌ترین اول', () => {
    const s = typeShares(data, 1405, 1, 12);
    expect(s.total).toBe(150_000 + 150_000 + 300_000 + 300_000);
    expect(s.shares.reduce((a, x) => a + x.total, 0)).toBe(s.total);
    expect(s.shares.reduce((a, x) => a + x.percent, 0)).toBeCloseTo(100, 6);
    expect(s.shares.map((x) => x.type)).toEqual(['water', 'gas']);
    expect(typeShares(data, 1405, 1, 12, ['gas']).shares.map((x) => x.type)).toEqual(['gas']);
    expect(typeShares([], 1405, 1, 12)).toEqual({ shares: [], total: 0 });
  });
});

describe('چیدمان نمودار (مشترک بین SVG و تصویر)', () => {
  it('میله‌ای/خطی: عرض با تعداد ماه رشد می‌کند و همهٔ اقلام داخل کادرند', () => {
    const s12 = chartSeries(data, 1405, null, 1, 12);
    const l = barLayout(s12, 'bar');
    expect(l.width).toBeGreaterThanOrEqual(CHART_MIN_W);
    expect(l.width).toBeGreaterThanOrEqual(12 * SLOT_MIN);
    expect(l.items).toHaveLength(12);
    for (const it of l.items) {
      expect(it.barX).toBeGreaterThanOrEqual(0); expect(it.barX + it.barW).toBeLessThanOrEqual(l.width + 0.001);
      expect(it.barY).toBeGreaterThanOrEqual(0); expect(it.barY + it.barH).toBeCloseTo(l.baseY, 6);
      expect(it.cx).toBeGreaterThan(0); expect(it.cx).toBeLessThan(l.width);
    }
    const xs = l.items.map((i) => i.cx);
    expect(new Set(xs).size).toBe(12);
    // ماه فروردین (۱) سمت راست است (RTL)
    expect(xs[0]).toBeGreaterThan(xs[11]);
    expect(barLayout(chartSeries(data, 1405, null, 1, 2), 'line').kind).toBe('line');
  });
  it('دایره‌ای: زاویه‌ها پشت‌سرهم و جمعاً یک دور؛ مسیر برش معتبر', () => {
    const p = pieLayout(typeShares(data, 1405, 1, 12).shares);
    expect(p.slices).toHaveLength(2);
    const span = p.slices.reduce((a, s) => a + (s.a1 - s.a0), 0);
    expect(span).toBeCloseTo(Math.PI * 2, 6);
    expect(p.slices[0].a1).toBeCloseTo(p.slices[1].a0, 6);
    for (const s of p.slices) expect(pieSlicePath(p, s)).toMatch(/^M/);
    expect(pieLayout([{ type: 'water', total: 5, percent: 100, count: 1 }]).slices).toHaveLength(1);
  });
  it('درصد فارسی و سند تصویری نمودار', () => {
    expect(faPercent(12.34)).toBe('۱۲٫۳٪');
    const s = chartSeries(data, 1405, null, 1, 5);
    for (const kind of ['bar', 'line', 'pie'] as const) {
      const d = chartDoc(kind, 1405, null, s, typeShares(data, 1405, 1, 5));
      expect(d.blocks[0].k).toBe('chart');
      expect(d.fileBase).toContain(kind);
      expect(JSON.stringify([d.title, d.subtitle, d.blocks.filter((b) => b.k !== 'chart')])).not.toMatch(/[0-9]/);
    }
  });
});
