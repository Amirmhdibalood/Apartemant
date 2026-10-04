import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Bill, BillWithUnits } from '../src/models/types';
import {
  billPaymentReport, filterPaymentRows, matchesPaymentStatus, PAYMENT_STATUS_LABEL, toggleStatusFilter, type PaymentStatusFilter,
} from '../src/logic/billPaymentReport';

const TODAY = { year: 1405, month: 7, day: 11 };
let n = 0;
const mk = (expenseType: Bill['expenseType'], month: number, dueDate: string | null, paidDate: string | null): BillWithUnits => ({
  bill: {
    id: 'b' + ++n, year: 1405, month, expenseType, billNumber: null, description: null, totalAmount: 1000000,
    createdAt: '2026-06-01T00:00:00.000Z', isFullySettled: false, billPaid: !!paidDate, billPaidDate: paidDate, dueDate, deletedAt: null,
  },
  units: [],
});
const DATA: BillWithUnits[] = [
  mk('water', 1, '1405-01-20', '1405-01-15'), // early
  mk('electricity', 2, '1405-02-20', '1405-02-20'), // exact
  mk('gas', 3, '1405-03-25', '1405-04-02'), // late
  mk('misc', 3, null, '1405-03-10'), // paid, no due date
  mk('building', 4, '1405-04-25', '1405-04-24'), // early
  mk('cleaning', 5, '1405-05-20', '1405-05-29'), // late
  mk('repairs', 6, '1405-06-15', '1405-06-15'), // exact
  mk('water', 6, '1405-06-28', '1405-07-05'), // late
  mk('electricity', 7, '1405-07-05', null), // overdue
  mk('gas', 7, '1405-07-20', null), // pending
];
const rows = billPaymentReport(DATA, 1405, null, TODAY).rows;
const ids = (r: typeof rows) => r.map((x) => x.bill.id).sort();

describe('فیلتر وضعیت گزارش پرداخت قبض‌ها', () => {
  it('هر وضعیت دقیقاً با عددهای کارت خلاصه برابر است', () => {
    const { summary: s } = billPaymentReport(DATA, 1405, null, TODAY);
    expect(filterPaymentRows(rows, 'onTime')).toHaveLength(s.onTime);
    expect(filterPaymentRows(rows, 'late')).toHaveLength(s.late);
    expect(filterPaymentRows(rows, 'unpaid')).toHaveLength(s.unpaid);
    expect([s.onTime, s.late, s.unpaid, s.total]).toEqual([5, 3, 2, 10]);
  });
  it('به‌موقع = زودتر + سر موعد + پرداخت‌شدهٔ بدون مهلت؛ پرداخت‌نشده = در انتظار + گذشته از مهلت', () => {
    expect(filterPaymentRows(rows, 'onTime').map((r) => r.timing).sort()).toEqual(['early', 'early', 'onTime', 'onTime', 'paidNoDue']);
    expect(filterPaymentRows(rows, 'unpaid').map((r) => r.timing).sort()).toEqual(['overdue', 'pending']);
    expect(filterPaymentRows(rows, 'late').every((r) => r.timing === 'late')).toBe(true);
  });
  it('«همه» همه را برمی‌گرداند، از جمله پرداخت‌شده بدون مهلت', () => {
    expect(filterPaymentRows(rows, 'all')).toBe(rows);
    expect(rows.some((r) => r.timing === 'paidNoDue')).toBe(true);
    expect(filterPaymentRows(rows, 'onTime').some((r) => r.timing === 'paidNoDue')).toBe(true);
    for (const st of ['late', 'unpaid'] as PaymentStatusFilter[]) {
      expect(filterPaymentRows(rows, st).some((r) => r.timing === 'paidNoDue')).toBe(false);
    }
  });
  it('وضعیت‌ها هم‌پوشانی ندارند و با هم همه سطرهای دارای وضعیت را می‌پوشانند', () => {
    const all = [...filterPaymentRows(rows, 'onTime'), ...filterPaymentRows(rows, 'late'), ...filterPaymentRows(rows, 'unpaid')];
    expect(new Set(all.map((r) => r.bill.id)).size).toBe(all.length);
    expect(ids(all)).toEqual(ids(rows));
  });
  it('ترکیب با فیلتر نوع هزینه (AND)', () => {
    const water = billPaymentReport(DATA, 1405, 'water', TODAY).rows;
    expect(filterPaymentRows(water, 'late')).toHaveLength(1);
    expect(filterPaymentRows(water, 'onTime')).toHaveLength(1);
    expect(filterPaymentRows(water, 'unpaid')).toHaveLength(0);
  });
  it('لمس کارت فعال فیلتر را برمی‌دارد؛ لمس کارت دیگر جابه‌جا می‌کند', () => {
    expect(toggleStatusFilter('all', 'late')).toBe('late');
    expect(toggleStatusFilter('late', 'late')).toBe('all');
    expect(toggleStatusFilter('late', 'onTime')).toBe('onTime');
    expect(toggleStatusFilter('unpaid', 'all')).toBe('all');
  });
  it('برچسب‌ها و matchesPaymentStatus', () => {
    expect(PAYMENT_STATUS_LABEL).toEqual({ all: 'همه', paid: 'پرداخت‌شده', onTime: 'به‌موقع', late: 'با تأخیر', unpaid: 'پرداخت‌نشده' });
    expect(matchesPaymentStatus({ timing: 'pending' }, 'unpaid')).toBe(true);
    expect(matchesPaymentStatus({ timing: 'late' }, 'onTime')).toBe(false);
    expect(matchesPaymentStatus({ timing: 'paidUnknown' }, 'all')).toBe(true);
    expect(matchesPaymentStatus({ timing: 'unpaidNoDue' }, 'unpaid')).toBe(true);
    expect(matchesPaymentStatus({ timing: 'paidNoDue' }, 'paid')).toBe(true);
  });
  it('رابط: pill «همه (N)»، کارت‌ها دکمه‌اند، نوار «فیلتر … نمایش همه» و دو انتخابگر سال/نوع', () => {
    const src = readFileSync('src/screens/reports/BillPaymentsView.tsx', 'utf8');
    expect(src).toContain('className={\'bp-all\'');
    expect(src).toMatch(/<button type="button" className=\{'bp-summary__item is-ontime'/);
    expect(src).toContain('نمایش همه');
    expect(src).toContain('id="bp-year"');
    expect(src).toContain('id="bp-type"');
    expect(src).toContain('toggleStatusFilter');
  });
});
