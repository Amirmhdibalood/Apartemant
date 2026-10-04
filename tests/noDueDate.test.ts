/**
 * ۱.۶.۱۴ — قبض «بدون مهلت پرداخت» در همهٔ گزارش‌ها و فیلترها باید فقط بر اساس وضعیت پرداخت
 * «پرداخت‌شده» یا «پرداخت‌نشده» باشد؛ هرگز در هیچ‌کدام یا هر دو نباشد.
 * فقط چیزهای مبتنی بر مهلت (گذشته از مهلت، هشدار، زنگ، بنر) برایش اعمال نمی‌شود.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Bill, BillWithUnits, Unit } from '../src/models/types';
import {
  billPaymentReport, filterPaymentRows, isPaidTiming, matchesPaymentStatus,
} from '../src/logic/billPaymentReport';
import { filterBills, matchesStatus, summarizeBills } from '../src/logic/billFilter';
import { billTone, daysUntilDue, dueText } from '../src/logic/billStatus';
import { dueAlertFor, selectDueAlerts } from '../src/logic/dueAlerts';
import { debtorsReport, paymentHistory } from '../src/logic/debts';
import { yearlyReport } from '../src/logic/report';
import { settledCount } from '../src/logic/settlement';

const TODAY = { year: 1405, month: 7, day: 11 };
let n = 0;
const bill = (over: Partial<Bill> = {}): Bill => ({
  id: `b${++n}`, year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null, totalAmount: 900000,
  createdAt: '2026-09-01T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...over,
});
const unit = (billId: string, unitNumber: number, share: number, paid: number): Unit => ({
  id: `u${++n}`, billId, unitNumber, personCount: 2, shareAmount: share, isSettled: paid >= share,
  payments: paid > 0 ? [{ id: `p${++n}`, amount: paid, paidAt: '2026-09-05T08:00:00.000Z' }] : [],
});
const bw = (over: Partial<Bill> = {}, shares: [number, number, number][] = []): BillWithUnits => {
  const b = bill(over);
  return { bill: b, units: shares.map(([no, share, paid]) => unit(b.id, no, share, paid)) };
};

const NO_DUE_UNPAID = bw({ month: 3 });
const NO_DUE_PAID = bw({ month: 4, billPaid: true, billPaidDate: '1405-04-02' });
const NO_DUE_PAID_NODATE = bw({ month: 5, billPaid: true, billPaidDate: null });

describe('گزارش پرداخت قبض‌ها: قبض بدون مهلت', () => {
  it('پرداخت‌نشده بدون مهلت در گزارش دیده می‌شود و «پرداخت‌نشده (بدون مهلت)» است، نه «گذشته از مهلت»', () => {
    const r = billPaymentReport([NO_DUE_UNPAID], 1405, null, TODAY);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ timing: 'unpaidNoDue', days: null, dueDate: null });
    expect(r.summary).toMatchObject({ total: 1, paid: 0, unpaid: 1, unpaidNoDue: 1, overdue: 0, onTime: 0, late: 0 });
    expect(filterPaymentRows(r.rows, 'unpaid')).toHaveLength(1);
    expect(filterPaymentRows(r.rows, 'paid')).toHaveLength(0);
  });

  it('پرداخت‌شدهٔ بدون مهلت (با/بدون تاریخ پرداخت) «پرداخت‌شده» است و هرگز با تأخیر/گذشته از مهلت نیست', () => {
    const r = billPaymentReport([NO_DUE_PAID, NO_DUE_PAID_NODATE], 1405, null, TODAY);
    expect(r.rows.map((x) => x.timing).sort()).toEqual(['paidNoDue', 'paidNoDue']);
    expect(r.summary).toMatchObject({ total: 2, paid: 2, paidNoDue: 2, paidUndated: 0, onTime: 2, unpaid: 0, late: 0, overdue: 0, unpaidNoDue: 0 });
    expect(filterPaymentRows(r.rows, 'paid')).toHaveLength(2);
    expect(filterPaymentRows(r.rows, 'unpaid')).toHaveLength(0);
    // (۱.۷.۲) بدون مهلت دیر نمی‌شود ⇒ در «به‌موقع» حساب می‌شود
    expect(filterPaymentRows(r.rows, 'onTime')).toHaveLength(2);
    expect(filterPaymentRows(r.rows, 'late')).toHaveLength(0);
  });

  it('قبض حذف‌شده در هیچ دسته‌ای نیست (حتی بدون مهلت)', () => {
    const r = billPaymentReport([bw({ deletedAt: '2026-09-27T08:00:00.000Z' })], 1405, null, TODAY);
    expect(r.rows).toHaveLength(0);
    expect(r.summary).toMatchObject({ total: 0, paid: 0, unpaid: 0 });
  });

  it('paid + unpaid = total و هر ردیف دقیقاً در یکی از «پرداخت‌شده/پرداخت‌نشده» (ترکیب تصادفی با و بدون مهلت)', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const data: BillWithUnits[] = [];
    for (let i = 0; i < 300; i++) {
      const hasDue = rnd() < 0.4;
      const paid = rnd() < 0.5;
      data.push(bw({
        month: 1 + Math.floor(rnd() * 12),
        expenseType: (['water', 'electricity', 'gas', 'building'] as const)[Math.floor(rnd() * 4)]!,
        dueDate: hasDue ? `1405-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}` : null,
        billPaid: paid,
        billPaidDate: paid && rnd() < 0.7 ? `1405-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-15` : null,
        deletedAt: rnd() < 0.1 ? '2026-09-27T08:00:00.000Z' : null,
      }));
    }
    for (const type of [null, 'water', 'gas'] as const) {
      const { rows, summary } = billPaymentReport(data, 1405, type, TODAY);
      expect(summary.paid + summary.unpaid).toBe(summary.total);
      expect(summary.total).toBe(rows.length);
      expect(filterPaymentRows(rows, 'paid')).toHaveLength(summary.paid);
      expect(filterPaymentRows(rows, 'unpaid')).toHaveLength(summary.unpaid);
      for (const row of rows) {
        const inPaid = matchesPaymentStatus(row, 'paid');
        const inUnpaid = matchesPaymentStatus(row, 'unpaid');
        expect(inPaid !== inUnpaid).toBe(true); // دقیقاً یکی
        expect(inPaid).toBe(isPaidTiming(row.timing));
        expect(inPaid).toBe(row.bill.billPaid);
        if (!row.dueDate) expect(['paidNoDue', 'unpaidNoDue']).toContain(row.timing);
        expect(matchesPaymentStatus(row, 'all')).toBe(true);
      }
    }
    // تعداد بدون مهلت‌ها هم در کارت‌ها محاسبه شده است
    const { rows, summary } = billPaymentReport(data, 1405, null, TODAY);
    expect(summary.unpaidNoDue).toBe(rows.filter((x) => !x.dueDate && !x.bill.billPaid).length);
    expect(summary.paidNoDue).toBe(rows.filter((x) => !x.dueDate && x.bill.billPaid).length);
  });

  it('رابط: چیپ «پرداخت‌شده» و شمارش «بدون مهلت» روی کارت پرداخت‌نشده', () => {
    const src = readFileSync('src/screens/reports/BillPaymentsView.tsx', 'utf8');
    expect(src).toContain("tap('paid')");
    expect(src).toContain('بدون مهلت');
    expect(src).not.toContain('قبضی با مهلت پرداخت یا پرداخت‌شده پیدا نشد');
  });
});

describe('سوابق: فیلتر وضعیت و شمارنده‌ها با قبض بدون مهلت', () => {
  const data = [
    bw({ month: 1 }), // بدون مهلت، پرداخت‌نشده
    bw({ month: 2, billPaid: true }), // بدون مهلت، پرداخت‌شده
    bw({ month: 3, dueDate: '1405-03-10' }), // مهلت‌دار، پرداخت‌نشده
    bw({ month: 4, dueDate: '1405-04-10', billPaid: true, billPaidDate: '1405-04-09' }),
    bw({ month: 5, deletedAt: '2026-09-27T08:00:00.000Z' }),
  ];
  it('هر قبض حذف‌نشده دقیقاً در یکی از «پرداخت‌شده/پرداخت‌نشده» است', () => {
    for (const { bill: b } of data.filter((x) => !x.bill.deletedAt)) {
      expect(matchesStatus(b, 'paid') !== matchesStatus(b, 'unpaid')).toBe(true);
      expect(matchesStatus(b, 'paid')).toBe(b.billPaid);
      expect(matchesStatus(b, 'all')).toBe(true);
    }
    const f = (status: 'all' | 'paid' | 'unpaid' | 'deleted') => filterBills(data, { year: 1405, month: null, type: null, status });
    expect(f('all')).toHaveLength(4);
    expect(f('paid').map((x) => x.bill.month).sort()).toEqual([2, 4]);
    expect(f('unpaid').map((x) => x.bill.month).sort()).toEqual([1, 3]);
    expect(f('paid').length + f('unpaid').length).toBe(f('all').length);
    expect(f('deleted')).toHaveLength(1);
  });
  it('summarizeBills: paid + unpaid = count', () => {
    const all = filterBills(data, { year: 1405, month: null, type: null, status: 'all' });
    expect(summarizeBills(all)).toMatchObject({ count: 4, paid: 2, unpaid: 2 });
    const noDue = all.filter((x) => !x.bill.dueDate);
    expect(summarizeBills(noDue)).toMatchObject({ count: 2, paid: 1, unpaid: 1 });
    expect(summarizeBills([])).toEqual({ count: 0, total: 0, paid: 0, unpaid: 0 });
  });
  it('رابط سوابق: شمارنده «پرداخت‌نشده» کنار «پرداخت‌شده» نمایش داده می‌شود', () => {
    expect(readFileSync('src/screens/RecordsScreen.tsx', 'utf8')).toContain('summary.unpaid');
  });
});

describe('فقط چیزهای مبتنی بر مهلت برای قبض بدون مهلت اعمال نمی‌شود', () => {
  it('رنگ: پرداخت‌نشده = آبی (unpaid)، پرداخت‌شده = سبز؛ هرگز «due»', () => {
    expect(billTone(NO_DUE_UNPAID.bill, TODAY)).toBe('unpaid');
    expect(billTone(NO_DUE_PAID.bill, TODAY)).toBe('paid');
    expect(daysUntilDue(NO_DUE_UNPAID.bill, TODAY)).toBeNull();
    expect(dueText(NO_DUE_UNPAID.bill, TODAY)).toBeNull();
  });
  it('هشدار/زنگ/بنر: برای قبض بدون مهلت هیچ هشداری ساخته نمی‌شود', () => {
    expect(dueAlertFor(NO_DUE_UNPAID.bill, TODAY)).toBeNull();
    expect(dueAlertFor(NO_DUE_PAID.bill, TODAY)).toBeNull();
    expect(selectDueAlerts([NO_DUE_UNPAID.bill, NO_DUE_PAID.bill, NO_DUE_PAID_NODATE.bill], TODAY)).toEqual([]);
  });
});

describe('سایر گزارش‌ها: قبض بدون مهلت حساب می‌شود', () => {
  const b1 = bw({ month: 6, totalAmount: 600000 }, [[1, 300000, 0], [2, 300000, 300000]]); // بدون مهلت، یک واحد بدهکار
  const b2 = bw({ month: 6, totalAmount: 400000, billPaid: true }, [[1, 200000, 200000], [2, 200000, 200000]]); // بدون مهلت، پرداخت‌شده
  const all = [b1, b2];
  it('بدهکاران: بدهی قبض بدون مهلت پرداخت‌نشده در فهرست است', () => {
    const r = debtorsReport(all, new Date('2026-10-01T00:00:00Z'));
    expect(r.units.map((u) => [u.unitNumber, u.total])).toEqual([[1, 300000]]);
    expect(r.grandTotal).toBe(300000);
    expect(r.openBills).toBe(1);
  });
  it('سابقه پرداخت واحد: هر ورودی یا پرداخت‌شده یا پرداخت‌نشده است', () => {
    const h = paymentHistory(all, 1, new Date('2026-10-01T00:00:00Z'));
    expect(h.entries).toHaveLength(2);
    expect(h.paidCount + h.unpaidCount).toBe(h.entries.length);
    expect(h.unpaidCount).toBe(1);
  });
  it('هزینه‌های سال: مبلغ هر دو قبض در جمع و «پرداخت‌شده/باقی‌مانده» حساب می‌شود', () => {
    const y = yearlyReport(all, 1405);
    expect(y.billCount).toBe(2);
    expect(y.grandTotal).toBe(1000000);
    expect(y.settledTotal + y.unsettledTotal).toBe(y.grandTotal);
    expect(y.unsettledTotal).toBe(300000);
  });
  it('«N از M تسویه شده»: بر اساس واحدها و بدون وابستگی به مهلت', () => {
    expect(settledCount(b1.units)).toBe(1);
    expect(b1.units).toHaveLength(2);
    expect(settledCount(b2.units)).toBe(2);
  });
});
