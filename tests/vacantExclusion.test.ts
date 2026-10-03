import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Bill, BillWithUnits, Unit } from '../src/models/types';
import { calculateBySplit } from '../src/logic/split';
import { buildBill, emptyDraft } from '../src/logic/billFactory';
import { sanitizeBuilding } from '../src/logic/building';
import { validateDraft } from '../src/logic/validation';
import { buildBillImageModel } from '../src/logic/billImage';
import { debtorsReport, paymentHistory } from '../src/logic/debts';
import { settledCount, allSettled } from '../src/logic/settlement';
import { yearlyReport } from '../src/logic/report';
import { isVacant, occupantTotal, occupiedCount, occupiedUnits, VACANT_LABEL } from '../src/logic/vacant';

vi.mock('../src/context/IconPrefsContext', () => ({ useIconPrefs: () => ({ unitIcon: 'door', areaIcon: 'm2', setUnitIcon: () => undefined, setAreaIcon: () => undefined }) }));
vi.mock('../src/context/AreaModeContext', () => ({ useAreaMode: () => ({ areaMode: 'column', setAreaMode: () => undefined }) }));
const { UnitsEditor } = await import('../src/components/UnitsEditor');
const { PersonCountInput } = await import('../src/components/PersonCountInput');

const prng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

/** قبضی با طبقهٔ ۲ خالی که نفرات واقعی (۵ نفر) هم ذخیره دارد */
function make(method: 'perPerson' | 'perUnit' | 'perArea', total: number, persons: number[], vacant: boolean[], areas?: string[]): BillWithUnits {
  const building = sanitizeBuilding({ units: persons.map((p, i) => ({ alias: null, defaultPersons: p, vacant: vacant[i], area: areas ? Number(areas[i]) : undefined })) })!;
  const draft = { ...emptyDraft(1405, 7, building), expenseType: 'water' as const, amountDigits: String(total), splitMethod: method };
  const v = validateDraft(draft);
  if (!v.ok) throw new Error('invalid ' + JSON.stringify(v));
  const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, method, v.value.vacant, v.value.areas);
  return buildBill(draft, calc, null, new Date('2026-09-28T08:00:00Z'));
}

describe('واحد خالی: کمک‌تابع‌ها', () => {
  it('نه واحد حساب می‌شود نه نفراتش', () => {
    const us = [{ vacant: false, personCount: 3 }, { vacant: true, personCount: 5 }, { personCount: 2 }];
    expect(isVacant(us[1])).toBe(true);
    expect(isVacant({})).toBe(false);
    expect(occupiedCount(us)).toBe(2);
    expect(occupantTotal(us)).toBe(5);
    expect(occupiedUnits(us)).toHaveLength(2);
    expect(VACANT_LABEL).toBe('خالی');
  });
});

describe('طبقهٔ ۲ خالی در هر سه روش', () => {
  const persons = [3, 5, 2, 4]; // نفرات ذخیره‌شدهٔ طبقهٔ ۲ = ۵ ولی خالی است
  const vacant = [false, true, false, false];
  it('بر اساس نفرات: مجموع نفرات بدون طبقهٔ ۲؛ سهمش ۰؛ جمع = مبلغ', () => {
    const b = make('perPerson', 900001, persons, vacant);
    expect(b.units[1].shareAmount).toBe(0);
    expect(b.units[1].isSettled).toBe(true);
    expect(b.units.reduce((s, u) => s + u.shareAmount, 0)).toBe(900001);
    const r = calculateBySplit(900001, persons, 'perPerson', vacant);
    expect(r.totalPersons).toBe(9); // ۳+۲+۴، نه ۱۴
  });
  it('بر اساس واحد: تعداد واحدها ۳ است نه ۴؛ سهم‌ها فقط بین ۳ واحد', () => {
    const r = calculateBySplit(100000, persons, 'perUnit', vacant);
    expect(r.totalPersons).toBe(3);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([33334, 0, 33333, 33333]);
  });
  it('بر اساس متراژ: متراژ طبقهٔ ۲ نه در مجموع می‌آید نه سهم می‌گیرد', () => {
    const b = make('perArea', 1000000, persons, vacant, ['50', '1000', '50', '100']);
    expect(b.units.map((u) => u.shareAmount)).toEqual([250000, 0, 250000, 500000]);
  });
  it('تصویر قبض: واحدها/نفرات/میانگین بدون طبقهٔ ۲؛ سلول نفرات و متراژ «خالی»', () => {
    const pp = buildBillImageModel(make('perPerson', 900000, persons, vacant));
    expect(pp.unitCount).toBe('۳');
    expect(pp.totalPersons).toBe('۹');
    expect(pp.perShareLine).toBe('سهم هر نفر: ۱۰۰٬۰۰۰ تومان');
    expect(pp.rows.map((r) => r.occupants)).toEqual(['۳', 'خالی', '۲', '۴']);
    expect(pp.rows[1].share).toBe('۰');
    const pu = buildBillImageModel(make('perUnit', 900000, persons, vacant));
    expect(pu.unitCount).toBe('۳');
    expect(pu.perShareLine).toBe('سهم هر واحد: ۳۰۰٬۰۰۰ تومان');
    const pa = buildBillImageModel(make('perArea', 1000000, persons, vacant, ['50', '1000', '50', '100']));
    expect(pa.unitCount).toBe('۳');
    expect(pa.rows[1].area).toBe('خالی');
    expect(pa.totalArea).toBe(buildBillImageModel(make('perArea', 1000000, persons, vacant, ['50', '1', '50', '100'])).totalArea);
  });
  it('گزارش‌ها: بدهکاران، سابقه، شمارش تسویه و گزارش سالانه طبقهٔ ۲ را نمی‌شمارند', () => {
    const b = make('perPerson', 900000, persons, vacant);
    const d = debtorsReport([b]);
    expect(d.units.map((u) => u.unitNumber)).toEqual([4, 1, 3]); // ۴۰۰ هزار، ۳۰۰ هزار، ۲۰۰ هزار؛ طبقهٔ ۲ نیست
    expect(d.allUnitNumbers).toEqual([1, 3, 4]);
    expect(d.grandTotal).toBe(900000);
    expect(paymentHistory([b], 2).entries).toHaveLength(0);
    expect(settledCount(b.units)).toBe(0); // خالی خودکار تسویه است ولی شمرده نمی‌شود
    expect(allSettled(b.units)).toBe(false);
    expect(yearlyReport([b], 1405).grandTotal).toBe(900000);
  });
  it('داده خراب: واحد vacant با سهم مثبت هم در بدهکاران/سابقه نمی‌آید', () => {
    const b = make('perPerson', 900000, persons, vacant);
    const bad: BillWithUnits = { bill: b.bill, units: b.units.map((u, i) => (i === 1 ? { ...u, shareAmount: 1000, isSettled: false } : u)) };
    expect(debtorsReport([bad]).allUnitNumbers).not.toContain(2);
    expect(debtorsReport([bad]).units.some((u) => u.unitNumber === 2)).toBe(false);
    expect(paymentHistory([bad], 2).entries).toHaveLength(0);
  });
  it('واحدی که فقط در بعضی قبض‌ها خالی بوده در بقیه سابقه دارد', () => {
    const a = make('perPerson', 900000, persons, vacant);
    const c = make('perPerson', 400000, persons, [false, false, false, false]);
    expect(paymentHistory([a, c], 2).entries).toHaveLength(1);
    expect(debtorsReport([a, c]).allUnitNumbers).toEqual([1, 2, 3, 4]);
  });
});

describe('رابط: «خالی» به‌جای عدد', () => {
  it('PersonCountInput خالی: متن «خالی» (نه ۵) و غیرفعال؛ غیرخالی عدد', () => {
    const v = renderToStaticMarkup(createElement(PersonCountInput, { value: '5', onChange: () => undefined, unitNumber: 2, disabled: true, showWeight: false, vacant: true }));
    expect(v).toContain('value="خالی"');
    expect(v).not.toContain('value="5"');
    expect(v).toContain('disabled');
    const n = renderToStaticMarkup(createElement(PersonCountInput, { value: '5', onChange: () => undefined, unitNumber: 2 }));
    expect(n).toContain('value="5"');
  });
  it('فرم: شمار واحدها بدون خالی‌ها و «+ ۱ خالی»؛ ردیف خالی «خالی (بدون سهم)»', () => {
    const html = renderToStaticMarkup(createElement(UnitsEditor, {
      personCounts: ['3', '5', '2', '4'], unitAliases: [null, null, null, null], unitVacant: [false, true, false, false],
      unitAreas: ['1', '1', '1', '1'], onAdd: () => undefined, onRemoveLast: () => undefined, onChangeCount: () => undefined,
      onChangeVacant: () => undefined, amountDigits: '900000', splitMethod: 'perPerson',
    } as never));
    expect(html).toContain('section-title__count num">(3)</span>');
    expect(html).toMatch(/section-title__vacant"> \+ <span class="num">1<\/span> خالی/);
    expect(html).toContain('value="خالی"');
    expect(html).toContain('خالی (بدون سهم)');
    expect(html).not.toContain('value="5"');
  });
  it('منبع جدول نتیجه/جزئیات/سوابق: «—» برای واحد خالی ندارند و از واژهٔ مشترک استفاده می‌کنند', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/screens/ResultScreen.tsx', 'src/screens/BillDetailsScreen.tsx']) {
      const s = readFileSync(f, 'utf8');
      expect(s).not.toMatch(/(vacants\[i\]|u\.vacant) \? '—'/);
      expect(s).toContain('VACANT_LABEL');
    }
    expect(readFileSync('src/screens/RecordsScreen.tsx', 'utf8')).toContain('occupiedCount(units)');
  });
});

describe('تصادفی (۴۰۰ قبض با خالی‌های تصادفی): شمارش‌ها و جمع‌ها', () => {
  it('ناوردایی‌ها در هر سه روش', () => {
    const r = prng(2026);
    for (let n = 0; n < 400; n++) {
      const count = 1 + Math.floor(r() * 8);
      const persons = Array.from({ length: count }, () => 1 + Math.floor(r() * 9));
      let vacant = Array.from({ length: count }, () => r() < 0.35);
      if (vacant.every(Boolean)) vacant[Math.floor(r() * count)] = false;
      const areas = Array.from({ length: count }, () => (10 + Math.floor(r() * 2000) / 10).toFixed(1));
      const method = (['perPerson', 'perUnit', 'perArea'] as const)[n % 3];
      const total = 1 + Math.floor(r() * 5_000_000_00);
      const b = make(method, total, persons, vacant, areas);
      const occ = vacant.filter((v) => !v).length;
      expect(b.units.reduce((s, u) => s + u.shareAmount, 0)).toBe(total);
      b.units.forEach((u, i) => {
        if (vacant[i]) { expect(u.shareAmount).toBe(0); expect(u.vacant).toBe(true); expect(u.isSettled).toBe(true); }
        else expect(u.shareAmount).toBeGreaterThanOrEqual(0);
      });
      const m = buildBillImageModel(b);
      expect(m.unitCount).toBe(String(occ).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]));
      m.rows.forEach((row, i) => {
        if (vacant[i]) { expect(row.occupants).toBe('خالی'); expect(row.share).toBe('۰'); }
      });
      expect(settledCount(b.units)).toBe(0);
      expect(debtorsReport([b]).units.every((u) => !vacant[u.unitNumber - 1])).toBe(true);
      expect(debtorsReport([b]).grandTotal).toBe(total);
      expect(occupantTotal(b.units)).toBe(persons.reduce((s, p, i) => s + (vacant[i] ? 0 : p), 0));
      const bill: Bill = b.bill; void bill; void ({} as Unit);
    }
  });
});
