/**
 * ۱.۷.۴ — «مانده» ← «قابل پرداخت» در دو گزارش جمع قبض‌های ماه (صفحه + خروجی PNG/JPEG/PDF/پرینت):
 * بدون پرداخت = کل سهم؛ پرداخت جزئی = عدد اصلی مانده + «از مجموع Y» + «پرداخت‌شده X»؛ تسویه‌شده = «۰» سبز.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BillWithUnits, Unit } from '../src/models/types';
import { monthlyTotals } from '../src/logic/monthlyTotals';
import { monthlyDoc, monthlyDetailDoc, type DocBlock, type DocRow } from '../src/logic/reportDoc';
import { faAmount } from '../src/logic/billImage';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const mk = (id: string, type: BillWithUnits['bill']['expenseType'], total: number, shares: number[], paid: number[]): BillWithUnits => ({
  bill: { id, year: 1405, month: 7, expenseType: type, billNumber: null, description: null, totalAmount: total, createdAt: `2026-09-2${id.length}T08:00:00.000Z`, isFullySettled: false, splitMethod: 'perUnit' },
  units: shares.map((s, i): Unit => ({ id: `${id}-${i + 1}`, billId: id, unitNumber: i + 1, personCount: 2, shareAmount: s, isSettled: paid[i] >= s, payments: paid[i] > 0 ? [{ id: `p${id}${i}`, amount: paid[i], paidAt: null }] : [] })),
});
// واحد ۱ کامل، واحد ۲ جزئی (۲۵۰ از ۶۵۰)، واحد ۳ بدون پرداخت
const all = [
  mk('e', 'electricity', 900_000, [300_000, 300_000, 300_000], [300_000, 250_000, 0]),
  mk('w', 'water', 450_000, [150_000, 150_000, 150_000], [150_000, 0, 0]),
  mk('g', 'gas', 600_000, [200_000, 200_000, 200_000], [200_000, 0, 0]),
];
const t = monthlyTotals(all, 1405, 7);
const rowsOf = (blocks: DocBlock[]) => blocks.filter((b): b is Extract<DocBlock, { k: 'rows' }> => b.k === 'rows');
const num = (s: string) => Number(s.replace(/[^۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));

describe('جمع قبض‌های ماه — «قابل پرداخت» (خروجی)', () => {
  const doc = monthlyDoc(t);
  const rows = rowsOf(doc.blocks)[0];
  const [paid, part, none] = rows.rows as DocRow[];

  it('مدل: واحد ۱ پرداخت‌شده، ۲ جزئی، ۳ پرداخت‌نشده؛ جمع‌ها', () => {
    expect(t.units.map((u) => u.status)).toEqual(['paid', 'partial', 'unpaid']);
    expect([t.grandTotal, t.paidTotal, t.remainingTotal]).toEqual([1_950_000, 900_000, 1_050_000]);
  });
  it('پرداخت‌نشده: فقط کل مبلغ، بدون خط «از مجموع»', () => {
    expect(num(none.value)).toBe(650_000);
    expect(none.valueSub).toBeUndefined();
    expect(none.tag).toMatchObject({ text: 'پرداخت‌نشده' });
    expect(none.valueOk).toBe(false);
  });
  it('جزئی: عدد اصلی = مانده، «از مجموع Y»، چیپ «پرداخت‌شده X»', () => {
    expect(num(part.value)).toBe(400_000);
    expect(part.valueSub).toBe(`از مجموع ${faAmount(650_000)}`);
    expect(part.tag?.text).toBe(`پرداخت‌شده ${faAmount(250_000)}`);
    expect(part.valueOk).toBe(false);
  });
  it('تسویه‌شده: «۰» سبز + «از مجموع Y» + چیپ سبز «پرداخت‌شده»', () => {
    expect(num(paid.value)).toBe(0);
    expect(paid.valueOk).toBe(true);
    expect(paid.valueSub).toBe(`از مجموع ${faAmount(650_000)}`);
    expect(paid.tag).toEqual({ text: 'پرداخت‌شده', tone: 'ok' });
  });
  it('جمع کل = جمع مانده‌ها با یک خط کوچک «از مجموع … • پرداخت‌شده …»', () => {
    expect(num(rows.footer!.value)).toBe(1_050_000);
    expect(rows.footer!.note).toBe(`از مجموع ${faAmount(1_950_000)} • پرداخت‌شده ${faAmount(900_000)}`);
    expect(rows.footer!.label).toBe('جمع کل قابل پرداخت');
  });
  it('کارت خلاصهٔ بالا دست‌نخورده (جمع قبض‌ها)؛ سطر دوم «پرداخت‌شده / قابل پرداخت» و دیگر «مانده» نیست', () => {
    const s = doc.blocks[0];
    if (s.k !== 'summary') throw new Error();
    expect(s.value).toBe(faAmount(1_950_000));
    expect(s.lines).toEqual([{ label: 'پرداخت‌شده', value: faAmount(900_000) }, { label: 'قابل پرداخت', value: faAmount(1_050_000) }]);
    expect(JSON.stringify(doc)).not.toContain('مانده');
  });
  it('بدون هیچ پرداختی خط «پرداخت‌شده» در جمع نمی‌آید', () => {
    const t0 = monthlyTotals([mk('e', 'electricity', 900_000, [300_000, 300_000, 300_000], [0, 0, 0])], 1405, 7);
    const r = rowsOf(monthlyDoc(t0).blocks)[0];
    expect(r.footer!.note).toBeUndefined();
    expect(r.rows.every((x) => !x.valueSub && x.tag?.text === 'پرداخت‌نشده')).toBe(true);
    expect(num(r.footer!.value)).toBe(900_000);
  });
});

describe('با جزئیات', () => {
  const d = monthlyDetailDoc(t);
  const blocks = rowsOf(d.blocks);
  it('ردیف هر قبض سهم کل همان قبض را نگه می‌دارد (۱۵۰/۳۰۰/۲۰۰ هزار)', () => {
    const items = blocks[1].rows.map((r) => num(r.value)); // واحد ۲
    expect(items.sort((a, b) => a - b)).toEqual([150_000, 200_000, 300_000]);
  });
  it('فوتر هر واحد: «قابل پرداخت» = مانده با یک خط «از مجموع Y • پرداخت‌شده X»', () => {
    expect(blocks.slice(0, 3).map((b) => num(b.footer!.value))).toEqual([0, 400_000, 650_000]);
    expect(blocks[0].footer).toMatchObject({ label: 'قابل پرداخت', ok: true });
    expect(blocks[1].footer).toMatchObject({ label: 'قابل پرداخت', note: `از مجموع ${faAmount(650_000)} • پرداخت‌شده ${faAmount(250_000)}` });
    expect(blocks[2].footer!.note).toBeUndefined();
  });
  it('جمع کل پایین = جمع مانده‌ها', () => {
    expect(num(blocks[3].footer!.value)).toBe(1_050_000);
    expect(blocks[3].footer!.note).toContain('پرداخت‌شده');
  });
});

describe('صفحه (کد)', () => {
  const v = read('src/screens/reports/MonthlyTotalView.tsx');
  it('برچسب «مانده» حذف شد و قابل پرداخت = مانده؛ چیپ پرداخت‌شده؛ «از مجموع»', () => {
    expect(v).not.toMatch(/مانده[:\s]/);
    expect(v).toContain('قابل پرداخت: <b');
    expect(v).toContain('u.remaining');
    expect(v).toContain('از مجموع {faAmount(u.total)}');
    expect(v).toContain('پرداخت‌شده {faAmount(u.paid)}');
    expect(v).toContain('rt-chip is-partial');
  });
  it('بوم گزارش مبلغ سبز و خط ریز زیر مبلغ را می‌کشد', () => {
    const r = read('src/services/reportImage.tsx');
    expect(r).toContain('r.valueSub');
    expect(r).toContain('r.valueOk');
    expect(r).toContain('b.footer.note');
  });
});
