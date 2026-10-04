/**
 * ۱.۷.۰ — ریاضی «جمع قبض‌های ماه» (و نسخهٔ با جزئیات): هر سه روش تقسیم، واحد خالی، نوع خاموش، حذف‌شده،
 * پرداخت جزئی، و آزمون‌های تصادفی با PRNG ثابت: جمع واحدها = جمع مبلغ قبض‌ها.
 */
import { describe, expect, it } from 'vitest';
import type { BillWithUnits, ExpenseType, SplitMethod, Unit } from '../src/models/types';
import { EXPENSE_TYPE_ORDER } from '../src/models/constants';
import { calculateBySplit } from '../src/logic/split';
import { monthlyTotals, monthsWithBills } from '../src/logic/monthlyTotals';
import { monthlyDoc, monthlyDetailDoc } from '../src/logic/reportDoc';
import { visibleBills, DEFAULT_ENTRY_PREFS } from '../src/logic/entryPrefs';
import { VACANT_LABEL } from '../src/logic/vacant';
import { faAmount } from '../src/logic/billImage';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: R, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)];
const METHODS: SplitMethod[] = ['perPerson', 'perUnit', 'perArea'];

interface UnitSpec { persons: number; vacant?: boolean; area?: number; paid?: 'none' | 'full' | 'half'; alias?: string }
let seq = 0;
function mkBill(year: number, month: number, type: ExpenseType, total: number, method: SplitMethod, specs: UnitSpec[], extra: Partial<BillWithUnits['bill']> = {}): BillWithUnits {
  const id = `b${++seq}`;
  const calc = calculateBySplit(total, specs.map((s) => s.persons), method, specs.map((s) => !!s.vacant), specs.map((s) => s.area));
  const units: Unit[] = specs.map((s, i) => {
    const share = calc.shares[i].shareAmount;
    const payments = s.paid === 'full' && share > 0 ? [{ id: `p${id}${i}`, amount: share, paidAt: null }] : s.paid === 'half' && share > 1 ? [{ id: `p${id}${i}`, amount: Math.floor(share / 2), paidAt: null }] : [];
    return { id: `${id}-${i + 1}`, billId: id, unitNumber: i + 1, personCount: s.persons, ...(s.vacant ? { vacant: true } : {}), ...(s.area ? { area: s.area } : {}), ...(s.alias ? { alias: s.alias } : {}), shareAmount: share, isSettled: payments.length > 0 && payments[0].amount === share, payments };
  });
  return { bill: { id, year, month, expenseType: type, billNumber: null, description: null, totalAmount: total, createdAt: new Date(2026, 0, 1, 0, 0, seq).toISOString(), isFullySettled: false, splitMethod: method, ...extra }, units };
}

describe('جمع قبض‌های ماه: سناریوهای مشخص', () => {
  it('سه روش تقسیم هم‌زمان: سهم‌های هر واحد جمع می‌شود و برابر جمع قبض‌هاست', () => {
    const specs: UnitSpec[] = [{ persons: 1, area: 50 }, { persons: 3, area: 100 }, { persons: 2, area: 80 }, { persons: 4, area: 120 }];
    const all = [
      mkBill(1405, 5, 'water', 1_000_001, 'perPerson', specs),
      mkBill(1405, 5, 'electricity', 777_777, 'perUnit', specs),
      mkBill(1405, 5, 'building', 3_333_333, 'perArea', specs),
      mkBill(1405, 6, 'gas', 999, 'perUnit', specs), // ماه دیگر: شمرده نمی‌شود
    ];
    const t = monthlyTotals(all, 1405, 5);
    expect(t.bills).toHaveLength(3);
    expect(t.billsTotal).toBe(1_000_001 + 777_777 + 3_333_333);
    expect(t.grandTotal).toBe(t.billsTotal);
    expect(t.units).toHaveLength(4);
    for (const u of t.units) {
      expect(u.items).toHaveLength(3);
      expect(u.total).toBe(u.items.reduce((s, i) => s + i.amount, 0));
    }
    // تقسیم بر اساس واحد: ۷۷۷٬۷۷۷ بین ۴ واحد → ۱۹۴٬۴۴۴ یا ۱۹۴٬۴۴۵
    const elec = t.units.map((u) => u.items.find((i) => i.expenseType === 'electricity')!.amount);
    expect(elec.reduce((s, x) => s + x, 0)).toBe(777_777);
    expect(Math.max(...elec) - Math.min(...elec)).toBeLessThanOrEqual(1);
    expect(t.byType.map((x) => x.type)).toEqual(EXPENSE_TYPE_ORDER.filter((x) => ['water', 'electricity', 'building'].includes(x)));
  });

  it('واحد خالی: «خالی» می‌شود، سهم صفر، در شمار واحدها و جمع نمی‌آید', () => {
    const specs: UnitSpec[] = [{ persons: 2 }, { persons: 0, vacant: true }, { persons: 3 }];
    const t = monthlyTotals([mkBill(1405, 1, 'water', 500_000, 'perPerson', specs), mkBill(1405, 1, 'gas', 90_000, 'perUnit', specs)], 1405, 1);
    expect(t.vacantCount).toBe(1);
    expect(t.occupiedCount).toBe(2);
    const v = t.units.find((u) => u.unitNumber === 2)!;
    expect(v).toMatchObject({ vacant: true, status: 'vacant', total: 0, items: [] });
    expect(t.grandTotal).toBe(590_000);
    const rows = monthlyDoc(t).blocks.find((b) => b.k === 'rows' && b.rows.length)!;
    if (rows.k !== 'rows') throw new Error();
    expect(rows.rows.find((r) => r.label.includes('۲'))!.value).toBe(VACANT_LABEL);
  });

  it('واحد خالی فقط در بعضی قبض‌ها: فقط سهم قبض‌های پرِ آن حساب می‌شود و «خالی» نیست', () => {
    const a = mkBill(1405, 2, 'water', 300_000, 'perUnit', [{ persons: 1 }, { persons: 1, vacant: true }]);
    const b = mkBill(1405, 2, 'gas', 200_000, 'perUnit', [{ persons: 1 }, { persons: 2 }]);
    const t = monthlyTotals([a, b], 1405, 2);
    const u2 = t.units.find((u) => u.unitNumber === 2)!;
    expect(u2.vacant).toBe(false);
    expect(u2.items.map((i) => i.expenseType)).toEqual(['water' === 'water' ? 'gas' : 'gas']);
    expect(u2.total).toBe(100_000);
    expect(t.grandTotal).toBe(t.billsTotal);
  });

  it('وضعیت پرداخت: پرداخت‌شده / جزئی / پرداخت‌نشده و جمع‌های پرداخت‌شده و مانده', () => {
    const specs: UnitSpec[] = [{ persons: 1, paid: 'full' }, { persons: 1, paid: 'half' }, { persons: 1, paid: 'none' }];
    const t = monthlyTotals([mkBill(1405, 3, 'water', 900_000, 'perUnit', specs)], 1405, 3);
    expect(t.units.map((u) => u.status)).toEqual(['paid', 'partial', 'unpaid']);
    expect(t.paidTotal + t.remainingTotal).toBe(t.grandTotal);
    expect(t.paidTotal).toBe(300_000 + 150_000);
  });

  it('قبض حذف‌شده و نوع خاموش در جمع نمی‌آیند؛ ماه خالی از قبض ← بدون واحد', () => {
    const specs: UnitSpec[] = [{ persons: 1 }, { persons: 2 }];
    const all = [
      mkBill(1405, 4, 'water', 100_000, 'perPerson', specs),
      mkBill(1405, 4, 'gas', 50_000, 'perPerson', specs),
      mkBill(1405, 4, 'electricity', 70_000, 'perPerson', specs, { deletedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(monthlyTotals(all, 1405, 4).billsTotal).toBe(150_000);
    const off = visibleBills(all, { ...DEFAULT_ENTRY_PREFS, types: DEFAULT_ENTRY_PREFS.types.filter((x) => x !== 'gas') });
    expect(monthlyTotals(off, 1405, 4).grandTotal).toBe(100_000);
    expect(monthlyTotals(all, 1405, 4, ['water']).grandTotal).toBe(100_000);
    const e = monthlyTotals(all, 1405, 9);
    expect(e).toMatchObject({ units: [], grandTotal: 0, billsTotal: 0, occupiedCount: 0 });
    expect(monthsWithBills(all, 1405)).toEqual([4]);
  });

  it('اسم مستعار و نفرات از جدیدترین قبض', () => {
    const a = mkBill(1405, 7, 'water', 100, 'perUnit', [{ persons: 1, alias: 'قدیمی' }]);
    const b = mkBill(1405, 7, 'gas', 100, 'perUnit', [{ persons: 4, alias: 'جدید' }]);
    const u = monthlyTotals([a, b], 1405, 7).units[0];
    expect(u.alias).toBe('جدید');
    expect(u.personCount).toBe(4);
  });

  it('سند با جزئیات: ردیف هر قبض هر واحد، جمع واحد و جمع کل با ارقام فارسی', () => {
    const specs: UnitSpec[] = [{ persons: 1 }, { persons: 2 }];
    const t = monthlyTotals([mkBill(1405, 8, 'water', 600_000, 'perUnit', specs), mkBill(1405, 8, 'gas', 300_000, 'perUnit', specs)], 1405, 8);
    const d = monthlyDetailDoc(t);
    const rowBlocks = d.blocks.filter((b) => b.k === 'rows');
    expect(rowBlocks.length).toBe(3); // دو واحد + جمع کل
    expect(JSON.stringify(d)).toContain(faAmount(450_000));
    expect(JSON.stringify(d)).toContain(faAmount(900_000));
    expect(JSON.stringify(d.blocks)).not.toMatch(/[0-9]/);
    expect(JSON.stringify(d.title + d.subtitle)).not.toMatch(/[0-9]/);
  });
});

describe('جمع قبض‌های ماه: تصادفی (PRNG ثابت)', () => {
  it('۳۰۰ ماه تصادفی: جمع واحدها = جمع قبض‌ها؛ خالی‌ها کنار؛ خاموش/حذف‌شده کنار؛ سندها هم‌خوان', () => {
    const r = rng(20261004);
    for (let k = 0; k < 300; k++) {
      const nUnits = int(r, 1, 12);
      const nBills = int(r, 0, 6);
      const all: BillWithUnits[] = [];
      let expectedAll = 0, expectedVisible = 0;
      const hiddenTypes = new Set<ExpenseType>();
      for (const t of EXPENSE_TYPE_ORDER) if (r() < 0.25) hiddenTypes.add(t);
      if (hiddenTypes.size === EXPENSE_TYPE_ORDER.length) hiddenTypes.delete('water');
      const vacantAlways = Array.from({ length: nUnits }, () => r() < 0.2);
      for (let b = 0; b < nBills; b++) {
        const specs: UnitSpec[] = Array.from({ length: nUnits }, (_, i) => ({
          persons: int(r, 0, 6), area: int(r, 20, 300), paid: pick(r, ['none', 'full', 'half'] as const),
          vacant: vacantAlways[i] || r() < 0.1,
        }));
        const method = pick(r, METHODS);
        if (specs.every((s) => s.vacant)) specs[0].vacant = false;
        if (method === 'perPerson' && !specs.some((s) => !s.vacant && s.persons > 0)) { const i = specs.findIndex((s) => !s.vacant); specs[i].persons = 1; }
        const type = pick(r, EXPENSE_TYPE_ORDER);
        const total = int(r, 1, r() < 0.2 ? 20 : 900_000_000);
        const deleted = r() < 0.15;
        all.push(mkBill(1405, 6, type, total, method, specs, deleted ? { deletedAt: '2026-02-02T00:00:00.000Z' } : {}));
        if (!deleted) { expectedAll += total; if (!hiddenTypes.has(type)) expectedVisible += total; }
      }
      all.push(mkBill(1405, 7, 'water', 12_345, 'perUnit', [{ persons: 1 }])); // ماه دیگر
      const t = monthlyTotals(all, 1405, 6);
      expect(t.billsTotal).toBe(expectedAll);
      expect(t.grandTotal).toBe(t.billsTotal);
      expect(t.paidTotal + t.remainingTotal).toBe(t.grandTotal);
      expect(t.units.reduce((s, u) => s + u.total, 0)).toBe(t.grandTotal);
      expect(t.byType.reduce((s, x) => s + x.total, 0)).toBe(t.billsTotal);
      expect(t.occupiedCount + t.vacantCount).toBe(t.units.length);
      for (const u of t.units) {
        if (u.vacant) expect(u).toMatchObject({ total: 0, items: [], status: 'vacant' });
        else expect(u.total).toBe(u.items.reduce((s, i) => s + i.amount, 0));
        expect(u.paid + u.remaining).toBe(u.total);
      }
      // نوع‌های خاموش
      const shown = visibleBills(all, { ...DEFAULT_ENTRY_PREFS, types: EXPENSE_TYPE_ORDER.filter((x) => !hiddenTypes.has(x)) });
      const tv = monthlyTotals(shown, 1405, 6);
      expect(tv.billsTotal).toBe(expectedVisible);
      expect(tv.grandTotal).toBe(expectedVisible);
      for (const x of tv.byType) expect(hiddenTypes.has(x.type)).toBe(false);
      // سندها: جمع کلِ هر دو گزارش همان عدد است
      const text = JSON.stringify(monthlyDoc(tv)) + JSON.stringify(monthlyDetailDoc(tv));
      if (nBills > 0) expect(text).toContain(faAmount(tv.grandTotal));
    }
  });
});
