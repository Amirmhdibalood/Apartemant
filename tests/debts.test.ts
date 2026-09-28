import { describe, expect, it } from 'vitest';
import type { BillWithUnits, ExpenseType, Unit } from '../src/models/types';
import { daysBetween, debtorsReport, paymentHistory, PAYMENT_GRACE_DAYS } from '../src/logic/debts';
import { buildBill, draftFromBill } from '../src/logic/billFactory';
import { calculateShares } from '../src/logic/calculation';

const NOW = new Date('2026-09-26T12:00:00Z');
const day = (d: number) => new Date(Date.UTC(2026, 8, d, 8)).toISOString(); // d شهریور/مهر ۲۰۲۶

function bill(id: string, year: number, month: number, type: ExpenseType, createdAt: string, units: Partial<Unit>[]): BillWithUnits {
  const us: Unit[] = units.map((u, i) => ({ id: `${id}-${i + 1}`, billId: id, unitNumber: i + 1, personCount: 1, shareAmount: 100000, isSettled: false, ...u }));
  const total = us.reduce((s, u) => s + u.shareAmount, 0);
  return { bill: { id, year, month, expenseType: type, billNumber: null, description: null, totalAmount: total, createdAt, isFullySettled: us.every((u) => u.isSettled) }, units: us };
}

const data: BillWithUnits[] = [
  // قبض قدیمی نسخه ۱.۱ (تسویه بدون تاریخ)
  bill('old', 1405, 4, 'water', day(1), [{ isSettled: true }, { isSettled: true }, { isSettled: false, shareAmount: 150000 }]),
  bill('w6', 1405, 6, 'electricity', day(10), [
    { isSettled: true, payments: [{ id: 'p', amount: 100000, paidAt: day(12) }] }, // ۲ روز: به‌موقع
    { isSettled: true, payments: [{ id: 'p', amount: 100000, paidAt: day(25) }] }, // ۱۵ روز: با تأخیر
    { isSettled: false, shareAmount: 200000 },
  ]),
  bill('g7', 1405, 7, 'cleaning', day(24), [{ isSettled: false, shareAmount: 50000 }, { isSettled: true, payments: [{ id: 'p', amount: 100000, paidAt: day(24) }] }, { isSettled: false, shareAmount: 70000 }]),
];

describe('گزارش بدهکاران', () => {
  const r = debtorsReport(data, NOW);

  it('فقط واحدهای دارای بدهی، مرتب از بیشترین بدهی', () => {
    expect(r.units.map((u) => [u.unitNumber, u.total])).toEqual([[3, 420000], [1, 50000]]);
    expect(r.grandTotal).toBe(470000);
    expect(r.openBills).toBe(3);
    expect(r.allUnitNumbers).toEqual([1, 2, 3]);
  });

  it('ریز بدهی هر واحد به تفکیک قبض، سال و ماه (قدیمی‌ترین اول)', () => {
    const u3 = r.units[0];
    expect(u3.items.map((i) => [i.billId, i.year, i.month, i.expenseType, i.amount])).toEqual([
      ['old', 1405, 4, 'water', 150000],
      ['w6', 1405, 6, 'electricity', 200000],
      ['g7', 1405, 7, 'cleaning', 70000],
    ]);
    expect(u3.items[1].daysOutstanding).toBe(16);
    expect(u3.items[2].daysOutstanding).toBe(2);
  });

  it('بدون قبض یا همه تسویه‌شده: فهرست خالی', () => {
    expect(debtorsReport([], NOW).units).toEqual([]);
    const settled = bill('s', 1405, 1, 'gas', day(1), [{ isSettled: true }]);
    expect(debtorsReport([settled], NOW)).toMatchObject({ units: [], grandTotal: 0, openBills: 0, allUnitNumbers: [1] });
  });
});

describe('بدهکاران با پرداخت جزئی (مانده بدهی)', () => {
  it('مانده بدهی پس از پرداخت‌های جزئی در گزارش استفاده می‌شود', () => {
    const b = bill('p1', 1405, 7, 'repairs', day(20), [
      { shareAmount: 500000, payments: [{ id: 'a', amount: 100000, paidAt: day(21) }, { id: 'b', amount: 150000, paidAt: day(23) }] },
      { shareAmount: 500000, isSettled: true, payments: [{ id: 'c', amount: 200000, paidAt: day(21) }, { id: 'd', amount: 300000, paidAt: day(24) }] },
    ]);
    const r = debtorsReport([b], NOW);
    expect(r.units).toHaveLength(1);
    expect(r.units[0]).toMatchObject({ unitNumber: 1, total: 250000 });
    expect(r.units[0].items[0]).toMatchObject({ amount: 250000, share: 500000, paid: 250000 });
    const h1 = paymentHistory([b], 1, NOW);
    expect(h1.entries[0]).toMatchObject({ status: 'unpaid', paid: 250000, remaining: 250000 });
    expect(h1.entries[0].payments).toHaveLength(2);
    expect(h1).toMatchObject({ totalBilled: 500000, totalPaid: 250000, totalOwed: 250000 });
    // تسویه با دو پرداخت: تاریخ تسویه = آخرین پرداخت (۴ روز پس از ثبت)
    const h2 = paymentHistory([b], 2, NOW);
    expect(h2.entries[0]).toMatchObject({ status: 'onTime', settledAt: day(24), days: 4, remaining: 0 });
  });
});

describe('سابقه پرداخت هر واحد', () => {
  it('تاریخ ثبت قبض در برابر تاریخ پرداخت، روز تا پرداخت و روزهای تأخیر', () => {
    const h = paymentHistory(data, 2, NOW);
    expect(h.entries.map((e) => [e.billId, e.status, e.days, e.daysLate])).toEqual([
      ['g7', 'onTime', 0, 0],
      ['w6', 'late', 15, 15 - PAYMENT_GRACE_DAYS],
      ['old', 'unknownDate', null, 0],
    ]);
    expect(h).toMatchObject({ paidCount: 3, unpaidCount: 0, onTimeCount: 1, lateCount: 1, avgDaysToPay: 7.5, totalOwed: 0, rating: 'average' });
  });

  it('خوش‌حساب / بدحساب', () => {
    // واحد ۱: یک پرداخت به‌موقع؛ بدهی باز هنوز از مهلت نگذشته
    expect(paymentHistory(data, 1, NOW)).toMatchObject({ rating: 'good', unpaidCount: 1, onTimeCount: 1 });
    // واحد ۳: دو بدهی گذشته از مهلت، هیچ پرداخت به‌موقعی
    const h3 = paymentHistory(data, 3, NOW);
    expect(h3.rating).toBe('bad');
    expect(h3.totalOwed).toBe(420000);
    expect(h3.entries[0]).toMatchObject({ billId: 'g7', status: 'unpaid', days: 2, daysLate: 0 });
    const good = [bill('a', 1405, 1, 'gas', day(1), [{ isSettled: true, payments: [{ id: 'p', amount: 100000, paidAt: day(3) }] }]), bill('b', 1405, 2, 'gas', day(5), [{ isSettled: true, payments: [{ id: 'p', amount: 100000, paidAt: day(6) }] }])];
    expect(paymentHistory(good, 1, NOW).rating).toBe('good');
    // فقط داده‌های قدیمی بدون تاریخ
    expect(paymentHistory([data[0]], 1, NOW).rating).toBe('unknown');
  });

  it('daysBetween', () => {
    expect(daysBetween(day(10), day(12))).toBe(2);
    expect(daysBetween(day(12), day(10))).toBe(0);
    expect(daysBetween('bad', NOW)).toBe(0);
  });
});

describe('پرداخت‌ها هنگام ویرایش قبض حفظ می‌شوند', () => {
  it('buildBill پرداخت‌ها و تاریخ آن‌ها را نگه می‌دارد', () => {
    const existing = data[1];
    const draft = draftFromBill(existing);
    const calc = calculateShares(300000, [1, 2, 3].map((n) => ({ unitNumber: n, personCount: 1 })));
    const rebuilt = buildBill(draft, calc, existing);
    expect(rebuilt.units.map((u) => u.payments?.[0]?.paidAt)).toEqual([day(12), day(25), undefined]);
    expect(rebuilt.units.map((u) => u.isSettled)).toEqual([true, true, false]);
  });
});

describe('اسم مستعار واحدها در گزارش‌ها و واحد خالی (نسخه ۱.۶.۰)', () => {
  const withAliases: BillWithUnits[] = [
    bill('a1', 1405, 5, 'water', day(2), [{ alias: 'قدیمی' }, { alias: null }]),
    bill('a2', 1405, 6, 'gas', day(12), [{ alias: 'آقای رضایی' }, { personCount: 0, shareAmount: 0, isSettled: true }]),
  ];

  it('بدهکاران: اسم هر واحد از جدیدترین قبض و اسم هر ردیف از عکس لحظه‌ای همان قبض', () => {
    const r = debtorsReport(withAliases, NOW);
    const u1 = r.units.find((u) => u.unitNumber === 1)!;
    expect(u1.alias).toBe('آقای رضایی');
    expect(u1.items.map((i) => i.alias)).toEqual(['قدیمی', 'آقای رضایی']);
    expect(r.aliases).toEqual({ 1: 'آقای رضایی', 2: null });
    // واحد خالی (سهم ۰) بدهی ندارد
    expect(r.units.find((u) => u.unitNumber === 2)!.items.map((i) => i.billId)).toEqual(['a1']);
  });

  it('سابقه پرداخت: اسم از جدیدترین قبض؛ قبضی که واحد در آن سهم نداشته حساب نمی‌شود', () => {
    const h = paymentHistory(withAliases, 2, NOW);
    expect(h.alias).toBeNull();
    expect(h.entries.map((e) => e.billId)).toEqual(['a1']);
    expect(paymentHistory(withAliases, 1, NOW).alias).toBe('آقای رضایی');
  });
});
