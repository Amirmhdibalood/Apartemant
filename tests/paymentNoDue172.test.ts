import { describe, expect, it } from 'vitest';
import type { Bill, BillWithUnits } from '../src/models/types';
import { billPaymentReport, filterPaymentRows, isPaidTiming, type PaymentTiming } from '../src/logic/billPaymentReport';
import { billPaymentsDoc } from '../src/logic/reportDoc';
import { summarizeBills } from '../src/logic/billFilter';
import { billTone } from '../src/logic/billStatus';
import { dueAlertFor } from '../src/logic/dueAlerts';

/** ۱.۷.۲: قبض بدون مهلت باید در کارت‌های گزارش «پرداخت قبض‌ها» شمرده شود. امروز = ۱۴۰۵/۰۷/۱۱ */
const TODAY = { year: 1405, month: 7, day: 11 };
let n = 0;
const mk = (dueDate: string | null, paidDate: string | null, paid = !!paidDate): BillWithUnits => ({
  bill: {
    id: 'x' + ++n, year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000000,
    createdAt: '2026-06-01T00:00:00.000Z', isFullySettled: false, billPaid: paid, billPaidDate: paidDate, dueDate, deletedAt: null,
  } as Bill,
  units: [],
});
const one = (b: BillWithUnits) => billPaymentReport([b], 1405, null, TODAY);
const timingOf = (b: BillWithUnits): PaymentTiming => one(b).rows[0].timing;

describe('۱.۷.۲ — طبقه‌بندی و شمارش کارت‌ها (قبض با/بدون مهلت)', () => {
  it('پرداخت‌شده بدون مهلت → «به‌موقع» (نمی‌تواند دیر باشد) و «پرداخت‌شده»', () => {
    const r = one(mk(null, '1405-07-05'));
    expect(r.rows[0].timing).toBe('paidNoDue');
    expect(r.summary).toMatchObject({ total: 1, paid: 1, onTime: 1, paidNoDue: 1, early: 0, exact: 0, late: 0, unpaid: 0, overdue: 0, unpaidNoDue: 0 });
    expect(filterPaymentRows(r.rows, 'onTime')).toHaveLength(1);
    expect(filterPaymentRows(r.rows, 'paid')).toHaveLength(1);
    expect(filterPaymentRows(r.rows, 'late')).toHaveLength(0);
    expect(filterPaymentRows(r.rows, 'unpaid')).toHaveLength(0);
  });
  it('پرداخت‌شده بدون مهلت و بدون تاریخ پرداخت هم به‌موقع شمرده می‌شود', () => {
    const r = one(mk(null, null, true));
    expect(r.rows[0].timing).toBe('paidNoDue');
    expect(r.summary).toMatchObject({ paid: 1, onTime: 1, late: 0, unpaid: 0 });
  });
  it('پرداخت‌نشدهٔ بدون مهلت → فقط «پرداخت‌نشده» (شمارش کارت شامل آن است) و زیرنوشتهٔ «بدون مهلت»', () => {
    const r = one(mk(null, null));
    expect(r.rows[0].timing).toBe('unpaidNoDue');
    expect(r.summary).toMatchObject({ total: 1, paid: 0, onTime: 0, late: 0, unpaid: 1, unpaidNoDue: 1, overdue: 0 });
    expect(filterPaymentRows(r.rows, 'unpaid')).toHaveLength(1);
    expect(filterPaymentRows(r.rows, 'paid')).toHaveLength(0);
  });
  it('پرداخت‌شدهٔ با تأخیر (مهلت ۱۴۰۵/۰۷/۰۱، پرداخت ۱۴۰۵/۰۷/۰۵) → «با تأخیر ۴ روز»', () => {
    const r = one(mk('1405-07-01', '1405-07-05'));
    expect(r.rows[0]).toMatchObject({ timing: 'late', days: 4 });
    expect(r.summary).toMatchObject({ paid: 1, late: 1, onTime: 0, unpaid: 0, avgLateDays: 4 });
  });
  it('پرداخت‌نشدهٔ گذشته از مهلت → overdue و در «پرداخت‌نشده»', () => {
    const r = one(mk('1405-07-05', null));
    expect(r.rows[0]).toMatchObject({ timing: 'overdue', days: 6 });
    expect(r.summary).toMatchObject({ unpaid: 1, overdue: 1, unpaidNoDue: 0, late: 0, onTime: 0 });
  });
  it('پرداخت‌نشدهٔ مهلت‌نرسیده (و مهلت امروز) → pending و در «پرداخت‌نشده»', () => {
    const r = one(mk('1405-07-20', null));
    expect(r.rows[0]).toMatchObject({ timing: 'pending', days: 9 });
    expect(r.summary).toMatchObject({ unpaid: 1, overdue: 0, late: 0, onTime: 0 });
    expect(timingOf(mk('1405-07-11', null))).toBe('pending');
  });
  it('پرداخت‌شدهٔ دارای مهلت ولی بدون تاریخ پرداخت نامعتبر → paidUnknown (فقط در «پرداخت‌شده»)', () => {
    const r = one(mk('1405-07-01', null, true));
    expect(r.rows[0].timing).toBe('paidUnknown');
    expect(r.summary).toMatchObject({ paid: 1, paidUndated: 1, onTime: 0, late: 0, unpaid: 0 });
  });

  it('ترکیب هر ۵ حالت: کارت‌ها، پیل‌ها و فهرست یک عدد را نشان می‌دهند', () => {
    const data = [mk(null, '1405-07-05'), mk(null, null), mk('1405-07-01', '1405-07-05'), mk('1405-07-05', null), mk('1405-07-20', null), mk('1405-07-10', '1405-07-08')];
    const { rows, summary: s } = billPaymentReport(data, 1405, null, TODAY);
    expect(s).toMatchObject({ total: 6, paid: 3, onTime: 2, early: 1, exact: 0, paidNoDue: 1, late: 1, unpaid: 3, overdue: 1, unpaidNoDue: 1 });
    // پیل «همه» = total؛ «پرداخت‌شده» = paid؛ کارت‌ها = فیلترها
    expect(rows).toHaveLength(s.total);
    expect(filterPaymentRows(rows, 'paid')).toHaveLength(s.paid);
    expect(filterPaymentRows(rows, 'onTime')).toHaveLength(s.onTime);
    expect(filterPaymentRows(rows, 'late')).toHaveLength(s.late);
    expect(filterPaymentRows(rows, 'unpaid')).toHaveLength(s.unpaid);
    expect(s.onTime + s.late + s.paidUndated).toBe(s.paid);
    expect(s.onTime + s.late + s.paidUndated + s.unpaid).toBe(s.total);
    // هر ردیف در دقیقاً یکی از «پرداخت‌شده/پرداخت‌نشده»
    expect(rows.every((r) => isPaidTiming(r.timing) === r.bill.billPaid)).toBe(true);
  });

  it('خروجی PDF/JPEG (billPaymentsDoc) همان شمارش کارت‌ها را دارد', () => {
    const data = [mk(null, '1405-07-05'), mk(null, null), mk('1405-07-01', '1405-07-05')];
    const { rows, summary: s } = billPaymentReport(data, 1405, null, TODAY);
    const doc = billPaymentsDoc(rows, s, 1405, null);
    const sum = doc.blocks.find((b) => b.k === 'summary') as unknown as { meta: string[]; lines: { label: string; value: string }[] };
    const get = (l: string) => sum.lines.find((x) => x.label === l)?.value;
    const fa = (v: number) => String(v).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
    expect(get('به‌موقع')).toBe(fa(1)); // پرداخت‌شدهٔ بدون مهلت
    expect(get('با تأخیر')).toBe(fa(1));
    expect(get('پرداخت‌نشده')).toBe(fa(1));
    expect(sum.meta.join(' ')).toContain('پرداخت‌شده ' + fa(2));
  });

  it('هم‌خوانی با سایر صفحه‌ها: سوابق/لحن قبض/هشدار مهلت برای بدون‌مهلت', () => {
    const data = [mk(null, '1405-07-05'), mk(null, null), mk('1405-07-20', null), mk('1405-07-05', null), mk('1405-07-01', '1405-07-05')];
    const { summary: s } = billPaymentReport(data, 1405, null, TODAY);
    const rec = summarizeBills(data);
    expect(rec.paid).toBe(s.paid);
    expect(rec.unpaid).toBe(s.unpaid);
    expect(data.map((d) => billTone(d.bill, TODAY))).toEqual(['paid', 'unpaid', 'unpaid', 'due', 'paid']);
    // بدون مهلت: هشدار (نوتیفیکیشن) ندارد؛ فقط قبض دارای مهلت نزدیک/گذشته
    expect(dueAlertFor(data[0].bill, TODAY)).toBeNull();
    expect(dueAlertFor(data[1].bill, TODAY)).toBeNull();
    expect(dueAlertFor(data[3].bill, TODAY)?.kind).toBe('overdue');
  });
});
