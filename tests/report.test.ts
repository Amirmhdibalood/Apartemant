import { describe, expect, it } from 'vitest';
import type { BillWithUnits, ExpenseType } from '../src/models/types';
import { EXPENSE_TYPES, EXPENSE_TYPE_ORDER, EXPENSE_TILE_ROWS } from '../src/models/constants';
import { percentOf, pickReportYear, yearlyReport } from '../src/logic/report';

let seq = 0;
function bill(year: number, month: number, type: ExpenseType, amount: number, settled: number[] = []): BillWithUnits {
  const id = `b${++seq}`;
  const half = Math.floor(amount / 2);
  const units = [
    { id: `${id}-1`, billId: id, unitNumber: 1, personCount: 1, shareAmount: amount - half, isSettled: settled.includes(1) },
    { id: `${id}-2`, billId: id, unitNumber: 2, personCount: 1, shareAmount: half, isSettled: settled.includes(2) },
  ];
  return {
    bill: { id, year, month, expenseType: type, billNumber: null, description: null, totalAmount: amount, createdAt: new Date(2026, 0, seq).toISOString(), isFullySettled: settled.length === 2 },
    units,
  };
}

const data: BillWithUnits[] = [
  bill(1405, 1, 'water', 400000, [1, 2]),
  bill(1405, 1, 'electricity', 600000),
  bill(1405, 2, 'water', 600000, [1]),
  bill(1405, 7, 'cleaning', 1000000),
  bill(1405, 12, 'beautification', 2400000),
  bill(1404, 12, 'gas', 9999999), // سال دیگر: نباید شمرده شود
];

describe('گزارش هزینه‌های سال', () => {
  const r = yearlyReport(data, 1405);

  it('جمع کل و تعداد قبض فقط برای سال انتخاب‌شده', () => {
    expect(r.grandTotal).toBe(5000000);
    expect(r.billCount).toBe(5);
  });

  it('همه ۸ نوع هزینه (شامل نظافت، تعمیرات، زیبایی ساختمان) در گزارش هستند', () => {
    expect(r.byType).toHaveLength(8);
    expect(new Set(r.byType.map((t) => t.type))).toEqual(new Set(EXPENSE_TYPE_ORDER));
  });

  it('جمع هر نوع، تعداد و درصد؛ مرتب از بیشترین؛ انواع بدون هزینه در انتها', () => {
    expect(r.byType.slice(0, 4).map((t) => [t.type, t.total, t.count, t.percent])).toEqual([
      ['beautification', 2400000, 1, 48],
      ['water', 1000000, 2, 20], // مبلغ برابر: به ترتیب ثابت انواع
      ['cleaning', 1000000, 1, 20],
      ['electricity', 600000, 1, 12],
    ]);
    const zeros = r.byType.slice(4);
    expect(zeros.every((t) => t.total === 0 && t.percent === 0)).toBe(true);
    expect(zeros.map((t) => t.type)).toEqual(['gas', 'building', 'repairs', 'misc']);
    expect(r.byType.reduce((s, t) => s + t.total, 0)).toBe(r.grandTotal);
  });

  it('ریز ماه‌به‌ماه (۱۲ ماه)', () => {
    expect(r.byMonth).toHaveLength(12);
    expect(r.byMonth[0]).toEqual({ month: 1, total: 1000000, count: 2, byType: { water: 400000, electricity: 600000 } });
    expect(r.byMonth[1].total).toBe(600000);
    expect(r.byMonth[2]).toEqual({ month: 3, total: 0, count: 0, byType: {} });
    expect(r.byMonth[11].byType).toEqual({ beautification: 2400000 });
    expect(r.byMonth.reduce((s, m) => s + m.total, 0)).toBe(r.grandTotal);
    expect(r.maxMonthTotal).toBe(2400000);
  });

  it('تسویه‌شده / مانده از روی سهم واحدها', () => {
    expect(r.settledTotal).toBe(400000 + 300000);
    expect(r.unsettledTotal).toBe(5000000 - 700000);
  });

  it('سال بدون قبض: همه صفر', () => {
    const e = yearlyReport(data, 1410);
    expect(e.grandTotal).toBe(0);
    expect(e.billCount).toBe(0);
    expect(e.byType.every((t) => t.percent === 0)).toBe(true);
    expect(e.maxMonthTotal).toBe(0);
  });

  it('درصد با یک رقم اعشار', () => {
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(5, 0)).toBe(0);
  });

  it('سال پیش‌فرض گزارش', () => {
    expect(pickReportYear([1405, 1406], [1405], 1405)).toBe(1405);
    expect(pickReportYear([1405, 1406], [], 1405)).toBe(1405);
    // سال جاری قبض ندارد ولی سال قبل دارد
    expect(pickReportYear([1404, 1405, 1406], [1404], 1405)).toBe(1404);
    // سال جاری در فهرست نیست
    expect(pickReportYear([1406, 1407], [], 1405)).toBe(1406);
  });
});

describe('انواع هزینه جدید', () => {
  it('نظافت، تعمیرات، زیبایی ساختمان اضافه شده‌اند و انواع قبلی حفظ شده‌اند', () => {
    expect(EXPENSE_TYPES.cleaning.label).toBe('نظافت');
    expect(EXPENSE_TYPES.repairs.label).toBe('تعمیرات');
    expect(EXPENSE_TYPES.beautification.label).toBe('زیبایی ساختمان');
    for (const t of ['water', 'electricity', 'gas', 'building', 'misc'] as ExpenseType[]) expect(EXPENSE_TYPES[t]).toBeTruthy();
    expect(EXPENSE_TYPE_ORDER).toHaveLength(8);
    expect(EXPENSE_TILE_ROWS.flat().sort()).toEqual([...EXPENSE_TYPE_ORDER].sort());
  });
});
