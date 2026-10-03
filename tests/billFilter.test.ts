import { describe, expect, it } from 'vitest';
import type { BillWithUnits, ExpenseType } from '../src/models/types';
import {
  MONTH_FILTER_OPTIONS, STATUS_FILTER_OPTIONS, TYPE_FILTER_OPTIONS, emptyMessage, filterBills, hasActiveFilters, matchesFilter,
  normalizeMonth, normalizeStatus, normalizeType, summarizeBills,
} from '../src/logic/billFilter';

let n = 0;
const bw = (year: number, month: number, type: ExpenseType, amount = 100000, createdAt = '2026-09-01T08:00:00Z', billPaid = false, deletedAt: string | null = null): BillWithUnits => ({
  bill: { id: `b${++n}`, year, month, expenseType: type, billNumber: null, description: null, totalAmount: amount, createdAt, isFullySettled: false, billPaid, billPaidDate: null, dueDate: null, deletedAt },
  units: [],
});

const data = [
  bw(1405, 7, 'gas', 900000, '2026-09-20T08:00:00Z', true),
  bw(1405, 7, 'water', 300000),
  bw(1405, 5, 'gas', 500000),
  bw(1405, 1, 'gas', 700000),
  bw(1405, 7, 'gas', 100000, '2026-09-25T08:00:00Z'),
  bw(1404, 11, 'gas', 800000),
  bw(1405, 3, 'electricity', 400000),
  bw(1405, 7, 'gas', 650000, '2026-09-22T08:00:00Z', false, '2026-09-27T08:00:00Z'), // حذف‌شده
  bw(1405, 2, 'water', 120000, '2026-05-01T08:00:00Z', false, '2026-09-27T08:00:00Z'), // حذف‌شده
];

describe('فیلترهای سوابق (سال + ماه + نوع هزینه، ترکیب AND)', () => {
  it('پیش‌فرض «همه»: همه قبض‌های سال انتخاب‌شده (سال همچنان فیلتر می‌کند)', () => {
    const r = filterBills(data, { year: 1405, month: null, type: null, status: 'all' });
    expect(r).toHaveLength(6);
    expect(r.every((x) => x.bill.year === 1405)).toBe(true);
  });

  it('همه قبض‌های گاز در همه ماه‌های سال (بدون تفکیک ماه)؛ مرتب: ماه جدیدتر، سپس ثبت جدیدتر', () => {
    const r = filterBills(data, { year: 1405, month: null, type: 'gas', status: 'all' });
    expect(r.map((x) => [x.bill.month, x.bill.totalAmount])).toEqual([[7, 100000], [7, 900000], [5, 500000], [1, 700000]]);
  });

  it('فقط ماه (همه انواع)', () => {
    const r = filterBills(data, { year: 1405, month: 7, type: null, status: 'all' });
    expect(r.map((x) => x.bill.expenseType).sort()).toEqual(['gas', 'gas', 'water']);
  });

  it('ماه و نوع با هم (AND)', () => {
    expect(filterBills(data, { year: 1405, month: 7, type: 'gas', status: 'all' })).toHaveLength(2);
    expect(filterBills(data, { year: 1405, month: 5, type: 'water', status: 'all' })).toHaveLength(0);
    expect(filterBills(data, { year: 1404, month: null, type: 'gas', status: 'all' })).toHaveLength(1);
    expect(matchesFilter(data[1], { year: 1405, month: 7, type: 'gas', status: 'all' })).toBe(false);
  });

  it('نتیجه خالی برای سال بدون قبض', () => {
    expect(filterBills(data, { year: 1406, month: null, type: null, status: 'all' })).toEqual([]);
  });

  it('خلاصه: تعداد، جمع مبالغ و تعداد قبض‌های پرداخت‌شده', () => {
    expect(summarizeBills(filterBills(data, { year: 1405, month: null, type: 'gas', status: 'all' }))).toEqual({ count: 4, total: 2200000, paid: 1, unpaid: 3 });
    expect(summarizeBills([])).toEqual({ count: 0, total: 0, paid: 0, unpaid: 0 });
  });

  it('نرمال‌سازی مقادیر مسیر/کشو: مقدار نامعتبر = همه', () => {
    expect(normalizeMonth(7)).toBe(7);
    for (const v of [0, 13, undefined, null, 2.5, '7']) expect(normalizeMonth(v)).toBeNull();
    expect(normalizeType('gas')).toBe('gas');
    for (const v of ['all', '', undefined, 'phone', 3]) expect(normalizeType(v)).toBeNull();
  });

  it('گزینه‌های کشوها: «همه» + ۱۲ ماه و «همه» + ۸ نوع هزینه', () => {
    expect(MONTH_FILTER_OPTIONS).toHaveLength(13);
    expect(MONTH_FILTER_OPTIONS[0]).toEqual({ value: null, label: 'همه' });
    expect(MONTH_FILTER_OPTIONS[7]).toEqual({ value: 7, label: 'مهر' });
    expect(TYPE_FILTER_OPTIONS).toHaveLength(9);
    expect(TYPE_FILTER_OPTIONS[0]).toEqual({ value: null, label: 'همه' });
    expect(TYPE_FILTER_OPTIONS.map((o) => o.label)).toContain('زیبایی ساختمان');
  });

  it('فیلتر فعال و پیام حالت خالی متناسب', () => {
    expect(hasActiveFilters({ year: 1405, month: null, type: null, status: 'all' })).toBe(false);
    expect(hasActiveFilters({ year: 1405, month: 7, type: null, status: 'all' })).toBe(true);
    expect(hasActiveFilters({ year: 1405, month: null, type: 'gas', status: 'all' })).toBe(true);
    expect(hasActiveFilters({ year: 1405, month: null, type: null, status: 'deleted' })).toBe(true);
    expect(emptyMessage({ year: 1405, month: 7, type: 'water', status: 'paid' })).toBe('در مهر 1405 هیچ قبض «آب» پرداخت‌شده پیدا نشد.');
    expect(emptyMessage({ year: 1405, month: null, type: null, status: 'deleted' })).toBe('در سال 1405 هیچ قبض حذف‌شده پیدا نشد.');
    expect(emptyMessage({ year: 1405, month: null, type: null, status: 'all' })).toBe('برای سال 1405 هنوز قبضی ثبت نشده است.');
    expect(emptyMessage({ year: 1405, month: 7, type: null, status: 'all' })).toBe('برای مهر 1405 هنوز قبضی ثبت نشده است.');
    expect(emptyMessage({ year: 1405, month: null, type: 'gas', status: 'all' })).toBe('در سال 1405 هیچ قبض «گاز» پیدا نشد.');
    expect(emptyMessage({ year: 1405, month: 2, type: 'water', status: 'all' })).toBe('در اردیبهشت 1405 هیچ قبض «آب» پیدا نشد.');
  });

  it('فیلتر وضعیت: «همه» (پیش‌فرض) = پرداخت‌شده + پرداخت‌نشده، بدون حذف‌شده‌ها', () => {
    const r = filterBills(data, { year: 1405, month: null, type: null, status: 'all' });
    expect(r).toHaveLength(6);
    expect(r.some((x) => x.bill.deletedAt)).toBe(false);
  });

  it('فیلتر وضعیت پرداخت‌شده / پرداخت‌نشده (حذف‌شده‌ها در هیچ‌کدام نیستند)', () => {
    const paid = filterBills(data, { year: 1405, month: null, type: null, status: 'paid' });
    expect(paid.map((x) => x.bill.totalAmount)).toEqual([900000]);
    const unpaid = filterBills(data, { year: 1405, month: null, type: null, status: 'unpaid' });
    expect(unpaid).toHaveLength(5);
    expect(unpaid.every((x) => !x.bill.billPaid && !x.bill.deletedAt)).toBe(true);
  });

  it('حذف‌شده‌ها فقط با انتخاب صریح «حذف‌شده» دیده می‌شوند و با ماه/نوع ترکیب می‌شوند', () => {
    expect(filterBills(data, { year: 1405, month: null, type: null, status: 'deleted' }).map((x) => x.bill.totalAmount)).toEqual([650000, 120000]);
    expect(filterBills(data, { year: 1405, month: 7, type: 'gas', status: 'deleted' }).map((x) => x.bill.totalAmount)).toEqual([650000]);
    expect(filterBills(data, { year: 1405, month: null, type: 'electricity', status: 'deleted' })).toEqual([]);
    expect(filterBills(data, { year: 1405, month: 7, type: 'gas', status: 'unpaid' }).map((x) => x.bill.totalAmount)).toEqual([100000]);
  });

  it('گزینه‌های وضعیت و نرمال‌سازی', () => {
    expect(STATUS_FILTER_OPTIONS.map((o) => o.label)).toEqual(['همه', 'پرداخت‌شده', 'پرداخت‌نشده', 'حذف‌شده']);
    expect(normalizeStatus('deleted')).toBe('deleted');
    expect(normalizeStatus(undefined)).toBe('all');
    expect(normalizeStatus('x')).toBe('all');
  });
});
