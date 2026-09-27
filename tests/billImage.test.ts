import { describe, expect, it } from 'vitest';
import type { BillWithUnits, Unit } from '../src/models/types';
import { buildBillImageModel, faAmount } from '../src/logic/billImage';

const unit = (n: number, persons: number, share: number, extra: Partial<Unit> = {}): Unit => ({
  id: `u${n}`, billId: 'b1', unitNumber: n, personCount: persons, shareAmount: share, isSettled: false, payments: [], ...extra,
});

const base = (over: Partial<BillWithUnits['bill']> = {}, units?: Unit[]): BillWithUnits => ({
  bill: {
    id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null,
    totalAmount: 1_200_000, createdAt: '2026-09-27T08:00:00.000Z', isFullySettled: false, splitMethod: 'perPerson', ...over,
  },
  units: units ?? [unit(2, 3, 600_000), unit(1, 1, 200_000), unit(3, 2, 400_000)],
});

const NOW = new Date('2026-09-27T09:00:00.000Z'); // ۵ مهر ۱۴۰۵

describe('مدل تصویر قبض (اشتراک‌گذاری/گالری)', () => {
  it('ارقام فارسی با جداکننده هزارگان فارسی', () => {
    expect(faAmount(12500000)).toBe('۱۲٬۵۰۰٬۰۰۰');
    expect(faAmount(0)).toBe('۰');
  });

  it('اطلاعات اصلی: نوع هزینه، ماه/سال، مبلغ کل، نحوه تقسیم، تاریخ و نام فایل', () => {
    const m = buildBillImageModel(base(), NOW);
    expect(m.appName).toBe('آپارتمانت');
    expect(m.typeLabel).toBe('آب');
    expect(m.period).toBe('مهر ۱۴۰۵');
    expect(m.total).toBe('۱٬۲۰۰٬۰۰۰');
    expect(m.currency).toBe('تومان');
    expect(m.splitLabel).toBe('بر اساس نفرات');
    expect(m.dateLine).toBe('تاریخ: ۱۴۰۵/۰۷/۰۵');
    expect(m.fileName).toBe('apartemant-water-1405-07-14050705.png');
    expect(m.fileName).toMatch(/^[a-z0-9.-]+$/);
  });

  it('واحدها به ترتیب شماره؛ در تقسیم بر اساس نفرات ستون نفرات نمایش داده می‌شود', () => {
    const m = buildBillImageModel(base(), NOW);
    expect(m.showOccupants).toBe(true);
    expect(m.rows.map((r) => r.unit)).toEqual(['۱', '۲', '۳']);
    expect(m.rows[1]).toMatchObject({ occupants: '۳', share: '۶۰۰٬۰۰۰' });
    expect(m.totalPersons).toBe('۶');
    expect(m.perShareLine).toBe('سهم هر نفر: ۲۰۰٬۰۰۰ تومان');
  });

  it('در تقسیم بر اساس واحد ستون نفرات حذف و سهم هر واحد نمایش داده می‌شود', () => {
    const m = buildBillImageModel(base({ splitMethod: 'perUnit', totalAmount: 900_000 }, [unit(1, 4, 300_000), unit(2, 1, 300_000), unit(3, 2, 300_000)]), NOW);
    expect(m.showOccupants).toBe(false);
    expect(m.splitLabel).toBe('بر اساس واحد');
    expect(m.perShareLine).toBe('سهم هر واحد: ۳۰۰٬۰۰۰ تومان');
  });

  it('قبض قدیمی بدون splitMethod = بر اساس نفرات', () => {
    const m = buildBillImageModel(base({ splitMethod: undefined }), NOW);
    expect(m.splitMethod).toBe('perPerson');
  });

  it('ستون وضعیت فقط وقتی پرداختی ثبت شده باشد؛ تسویه / مانده / پرداخت‌نشده', () => {
    expect(buildBillImageModel(base(), NOW).showStatus).toBe(false);
    const units = [
      unit(1, 1, 200_000, { isSettled: true, payments: [{ id: 'p1', amount: 200_000, paidAt: null }] }),
      unit(2, 3, 600_000, { payments: [{ id: 'p2', amount: 100_000, paidAt: null }] }),
      unit(3, 2, 400_000),
    ];
    const m = buildBillImageModel(base({}, units), NOW);
    expect(m.showStatus).toBe(true);
    expect(m.rows.map((r) => r.status.kind)).toEqual(['settled', 'partial', 'unpaid']);
    expect(m.rows[1].status.text).toBe('مانده ۵۰۰٬۰۰۰');
    expect(m.rows[2].status.text).toBe('پرداخت‌نشده');
    expect(m.settledLine).toBeNull();
  });

  it('وقتی همه واحدها تسویه کرده‌اند پیام تسویه کامل نمایش داده می‌شود (داده‌های قدیمی isSettled هم)', () => {
    const units = [unit(1, 1, 500_000, { isSettled: true, payments: undefined }), unit(2, 1, 700_000, { isSettled: true, payments: undefined })];
    const m = buildBillImageModel(base({ isFullySettled: true }, units), NOW);
    expect(m.rows.every((r) => r.status.text === 'تسویه')).toBe(true);
    expect(m.settledLine).toBe('همه واحدها تسویه کرده‌اند');
  });

  it('شماره قبض و توضیحات اختیاری', () => {
    const m = buildBillImageModel(base({ billNumber: '12345', description: '  قبض دوره تابستان  ' }), NOW);
    expect(m.billNumber).toBe('۱۲۳۴۵');
    expect(m.description).toBe('قبض دوره تابستان');
    const m2 = buildBillImageModel(base({ description: '   ' }), NOW);
    expect(m2.description).toBeNull();
    expect(m2.billNumber).toBeNull();
  });
});
