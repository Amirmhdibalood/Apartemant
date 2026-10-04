import { describe, expect, it } from 'vitest';
import type { Bill, BillWithUnits } from '../src/models/types';
import { DUE_SOON_DAYS, TONE_LEGEND, billTone, daysUntilDue, dueText, toneLabel } from '../src/logic/billStatus';
import { billPaymentReport, classifyBillPayment, timingLabel } from '../src/logic/billPaymentReport';

const TODAY = { year: 1405, month: 7, day: 6 };
let n = 0;
const bill = (over: Partial<Bill> = {}): Bill => ({
  id: `b${++n}`, year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null, totalAmount: 900000,
  createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...over,
});

describe('رنگ وضعیت قبض (سبز / آبی / قرمز)', () => {
  it('پرداخت‌شده = سبز حتی اگر مهلت گذشته باشد', () => {
    expect(billTone(bill({ billPaid: true, billPaidDate: '1405-07-01', dueDate: '1405-07-01' }), TODAY)).toBe('paid');
  });
  it('پرداخت‌نشده بدون مهلت یا با مهلت دور = آبی', () => {
    expect(billTone(bill(), TODAY)).toBe('unpaid');
    expect(billTone(bill({ dueDate: '1405-07-10' }), TODAY)).toBe('unpaid'); // ۴ روز مانده
  });
  it(`پرداخت‌نشده و حداکثر ${DUE_SOON_DAYS} روز مانده یا گذشته از مهلت = قرمز`, () => {
    expect(DUE_SOON_DAYS).toBe(3);
    expect(billTone(bill({ dueDate: '1405-07-09' }), TODAY)).toBe('due'); // ۳ روز مانده
    expect(billTone(bill({ dueDate: '1405-07-06' }), TODAY)).toBe('due'); // امروز
    expect(billTone(bill({ dueDate: '1405-06-25' }), TODAY)).toBe('due'); // گذشته
  });
  it('حذف‌شده = خاکستری', () => {
    expect(billTone(bill({ deletedAt: '2026-09-27T08:00:00.000Z', dueDate: '1405-07-07' }), TODAY)).toBe('deleted');
  });
  it('روزهای مانده و متن مهلت (عبور از مرز ماه)', () => {
    expect(daysUntilDue(bill({ dueDate: '1405-08-01' }), TODAY)).toBe(25);
    expect(daysUntilDue(bill(), TODAY)).toBeNull();
    expect(dueText(bill({ dueDate: '1405-07-06' }), TODAY)).toBe('مهلت پرداخت امروز');
    expect(dueText(bill({ dueDate: '1405-07-07' }), TODAY)).toBe('مهلت پرداخت فردا');
    expect(dueText(bill({ dueDate: '1405-07-09' }), TODAY)).toBe('۳ روز تا مهلت پرداخت');
    expect(dueText(bill({ dueDate: '1405-06-30' }), TODAY)).toBe('۷ روز از مهلت گذشته');
    expect(dueText(bill(), TODAY)).toBeNull();
    expect(toneLabel('paid')).toBe('پرداخت شد');
    expect(toneLabel('unpaid')).toBe('پرداخت نشده');
    expect(TONE_LEGEND.map((x) => x.tone)).toEqual(['paid', 'unpaid', 'due']);
  });
});

describe('گزارش «پرداخت قبض‌ها»', () => {
  const bw = (b: Bill): BillWithUnits => ({ bill: b, units: [] });

  it('وضعیت: زودتر از مهلت / سر موعد / با تأخیر (X روز) / در انتظار / گذشته از مهلت', () => {
    const c = (over: Partial<Bill>) => classifyBillPayment(bill(over), TODAY);
    expect(c({ dueDate: '1405-07-10', billPaid: true, billPaidDate: '1405-07-08' })).toMatchObject({ timing: 'early', days: 2, label: 'زودتر از مهلت (۲ روز)' });
    expect(c({ dueDate: '1405-07-10', billPaid: true, billPaidDate: '1405-07-10' })).toMatchObject({ timing: 'onTime', label: 'سر موعد' });
    expect(c({ dueDate: '1405-06-28', billPaid: true, billPaidDate: '1405-07-03' })).toMatchObject({ timing: 'late', days: 6, label: 'با تأخیر (۶ روز)' });
    expect(c({ dueDate: '1405-07-10' })).toMatchObject({ timing: 'pending', days: 4 });
    expect(c({ dueDate: '1405-07-01' })).toMatchObject({ timing: 'overdue', days: 5, label: 'پرداخت‌نشده — ۵ روز از مهلت گذشته' });
    expect(c({ billPaid: true, billPaidDate: '1405-07-03' })?.timing).toBe('paidNoDue');
    expect(c({ billPaid: true, billPaidDate: null, dueDate: '1405-07-03' })?.timing).toBe('paidUnknown');
    expect(c({})).toMatchObject({ timing: 'unpaidNoDue', days: null, label: 'پرداخت‌نشده (بدون مهلت)' }); // بدون مهلت و پرداخت‌نشده: هنوز دیده می‌شود
    expect(c({ dueDate: '1405-07-10', deletedAt: '2026-09-27T08:00:00.000Z' })).toBeNull(); // حذف‌شده
    expect(timingLabel('pending', 0)).toBe('پرداخت‌نشده — مهلت امروز');
  });

  it('فیلتر سال و نوع هزینه؛ خلاصه به‌موقع در برابر با تأخیر', () => {
    const all = [
      bw(bill({ month: 7, expenseType: 'gas', dueDate: '1405-07-10', billPaid: true, billPaidDate: '1405-07-05' })), // زودتر
      bw(bill({ month: 6, expenseType: 'gas', dueDate: '1405-06-15', billPaid: true, billPaidDate: '1405-06-15' })), // سر موعد
      bw(bill({ month: 5, expenseType: 'water', dueDate: '1405-05-10', billPaid: true, billPaidDate: '1405-05-14' })), // ۴ روز تأخیر
      bw(bill({ month: 4, expenseType: 'gas', dueDate: '1405-04-10', billPaid: true, billPaidDate: '1405-04-20' })), // ۱۰ روز تأخیر
      bw(bill({ month: 7, expenseType: 'water', dueDate: '1405-07-02' })), // گذشته از مهلت
      bw(bill({ month: 7, expenseType: 'electricity', dueDate: '1405-07-20' })), // در انتظار
      bw(bill({ month: 3, expenseType: 'gas' })), // بدون مهلت و پرداخت‌نشده — پرداخت‌نشده (بدون مهلت)
      bw(bill({ month: 2, expenseType: 'gas', dueDate: '1405-02-10', deletedAt: '2026-09-27T08:00:00.000Z' })), // حذف‌شده
      bw(bill({ year: 1404, month: 12, expenseType: 'gas', dueDate: '1404-12-10', billPaid: true, billPaidDate: '1404-12-25' })),
    ];
    const r = billPaymentReport(all, 1405, null, TODAY);
    expect(r.rows).toHaveLength(7);
    expect(r.rows.map((x) => x.bill.month)).toEqual([7, 7, 7, 6, 5, 4, 3]);
    expect(r.summary).toEqual({ total: 7, early: 1, exact: 1, onTime: 2, late: 2, paid: 4, paidNoDue: 0, paidUndated: 0, unpaid: 3, overdue: 1, unpaidNoDue: 1, avgLateDays: 7 });

    const gas = billPaymentReport(all, 1405, 'gas', TODAY);
    expect(gas.rows.map((x) => x.timing)).toEqual(['early', 'onTime', 'late', 'unpaidNoDue']);
    expect(gas.summary).toMatchObject({ onTime: 2, late: 1, paid: 3, unpaid: 1, overdue: 0, unpaidNoDue: 1, avgLateDays: 10 });

    const y1404 = billPaymentReport(all, 1404, null, TODAY);
    expect(y1404.rows.map((x) => x.label)).toEqual(['با تأخیر (۱۵ روز)']);
    expect(billPaymentReport(all, 1403, null, TODAY).summary).toMatchObject({ total: 0, avgLateDays: null });
  });
});
