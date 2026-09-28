import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bill, BillDraft, Unit } from '../src/models/types';
import {
  BillDeleteBlockedError, BillPaidMessages, canDeleteBill, isBillDeleted, isBillPaid, migrateBill, needsBillPaidMigration,
  normalizePaidDate, restoreBill, setBillDueDate, setBillPaid, setBillPaidDate, softDeleteBill,
} from '../src/logic/billPaid';
import { buildBill, draftFromBill } from '../src/logic/billFactory';
import { calculateBySplit } from '../src/logic/split';
import { buildBillImageModel } from '../src/logic/billImage';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { billRepository, SCHEMA_VERSION } = await import('../src/storage/billRepository');

/** قبض به قالب نسخه‌های قبل از ۱.۵.۰ (بدون billPaid / dueDate / deletedAt) */
const legacyBill = (id: string, over: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null,
  totalAmount: 900000, createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, ...over,
});
const units = (billId: string): Unit[] => [
  { id: `${billId}-1`, billId, unitNumber: 1, personCount: 1, shareAmount: 450000, isSettled: false },
  { id: `${billId}-2`, billId, unitNumber: 2, personCount: 1, shareAmount: 450000, isSettled: false },
];
const NOW = new Date('2026-09-28T10:30:00.000Z'); // ۶ مهر ۱۴۰۵ (تهران)
const TODAY = { year: 1405, month: 7, day: 6 };

describe('«پرداخت شد» قبض: منطق خالص', () => {
  it('مهاجرت داده قدیمی: پرداخت‌نشده، بدون تاریخ پرداخت، بدون مهلت، حذف‌نشده (idempotent)', () => {
    const old = legacyBill('b1');
    expect(needsBillPaidMigration(old)).toBe(true);
    const m = migrateBill(old);
    expect(m).toMatchObject({ billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null });
    expect(needsBillPaidMigration(m)).toBe(false);
    expect(migrateBill(m)).toEqual(m);
    // سایر فیلدها دست‌نخورده
    expect({ ...old, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null }).toEqual(m);
  });

  it('مهاجرت مقادیر ناسازگار: تاریخ بدون تیک حذف، تاریخ نامعتبر = null، ISO به شمسی، قبض پرداخت‌شده حذف‌شده نیست', () => {
    expect(migrateBill(legacyBill('b', { billPaid: false, billPaidDate: '1405-07-01' }))).toMatchObject({ billPaid: false, billPaidDate: null });
    expect(migrateBill(legacyBill('b', { billPaid: true, billPaidDate: 'x' }))).toMatchObject({ billPaid: true, billPaidDate: null });
    expect(migrateBill(legacyBill('b', { billPaid: true, billPaidDate: '1405-07-15' }))).toMatchObject({ billPaidDate: '1405-07-15' });
    expect(migrateBill(legacyBill('b', { billPaid: true, billPaidDate: '2026-03-05T10:00:00.000Z' }))).toMatchObject({ billPaidDate: '1404-12-14' });
    expect(migrateBill(legacyBill('b', { dueDate: '1405-13-01' })).dueDate).toBeNull();
    expect(migrateBill(legacyBill('b', { dueDate: '1405-07-10' })).dueDate).toBe('1405-07-10');
    expect(migrateBill(legacyBill('b', { deletedAt: 'دیروز' })).deletedAt).toBeNull();
    expect(migrateBill(legacyBill('b', { billPaid: true, deletedAt: NOW.toISOString() })).deletedAt).toBeNull();
    expect(normalizePaidDate('1403-12-30')).toBe('1403-12-30'); // ۱۴۰۳ کبیسه است
    expect(normalizePaidDate('1404-12-30')).toBeNull();
  });

  it('زدن تیک: تاریخ پرداخت پیش‌فرض امروز (شمسی)؛ قابل ویرایش؛ برداشتن تیک تاریخ را پاک می‌کند', () => {
    const paid = setBillPaid(migrateBill(legacyBill('b1')), true, TODAY);
    expect(paid).toMatchObject({ billPaid: true, billPaidDate: '1405-07-06' });
    expect(isBillPaid(paid)).toBe(true);
    expect(setBillPaid(migrateBill(legacyBill('b1')), true, NOW).billPaidDate).toBe('1405-07-06'); // از Date (وقت تهران)
    // تیک دوباره تاریخ قبلی را عوض نمی‌کند
    expect(setBillPaid(paid, true, { year: 1405, month: 8, day: 1 }).billPaidDate).toBe('1405-07-06');
    const edited = setBillPaidDate(paid, '1405-07-02');
    expect(edited.billPaidDate).toBe('1405-07-02');
    expect(setBillPaidDate(paid, '1405-02-32').billPaidDate).toBe('1405-07-06'); // نامعتبر نادیده
    expect(setBillPaidDate(migrateBill(legacyBill('b2')), '1405-07-02').billPaidDate).toBeNull(); // بدون تیک
    const unpaid = setBillPaid(edited, false, TODAY);
    expect(unpaid).toMatchObject({ billPaid: false, billPaidDate: null });
    expect(isBillPaid(unpaid)).toBe(false);
  });

  it('محافظ حذف: قبض پرداخت‌شده قابل حذف نیست و با برداشتن تیک دوباره قابل حذف است', () => {
    const b = migrateBill(legacyBill('b1'));
    expect(canDeleteBill(b)).toBe(true);
    const paid = setBillPaid(b, true, TODAY);
    expect(canDeleteBill(paid)).toBe(false);
    expect(() => softDeleteBill(paid, NOW)).toThrow(BillDeleteBlockedError);
    expect(canDeleteBill(setBillPaid(paid, false, TODAY))).toBe(true);
    expect(BillPaidMessages.deleteBlocked).toBe('قبض پرداخت‌شده قابل حذف نیست؛ ابتدا تیک «پرداخت شد» را بردارید.');
  });

  it('حذف نرم و بازگردانی؛ مهلت پرداخت', () => {
    const b = migrateBill(legacyBill('b1'));
    const del = softDeleteBill(b, NOW);
    expect(del.deletedAt).toBe(NOW.toISOString());
    expect(isBillDeleted(del)).toBe(true);
    expect(softDeleteBill(del, new Date('2027-01-01')).deletedAt).toBe(NOW.toISOString());
    expect(isBillDeleted(restoreBill(del))).toBe(false);
    expect(setBillDueDate(b, '1405-07-20').dueDate).toBe('1405-07-20');
    expect(setBillDueDate(b, null).dueDate).toBeNull();
    expect(setBillDueDate(b, 'فردا').dueDate).toBeNull();
  });

  it('«پرداخت شد» مستقل از تسویه ساکنان است؛ در ویرایش حفظ و مهلت از فرم گرفته می‌شود', () => {
    const existing = { bill: setBillPaid(migrateBill(legacyBill('b1')), true, TODAY), units: units('b1') };
    const draft: BillDraft = {
      editingBillId: 'b1', year: 1405, month: 7, expenseType: 'gas', billNumber: '', description: '',
      amountDigits: '1000000', personCounts: ['1', '1'], splitMethod: 'perUnit', dueDate: '1405-07-12',
    };
    const saved = buildBill(draft, calculateBySplit(1000000, [1, 1], 'perUnit'), existing, NOW);
    expect(saved.bill).toMatchObject({ billPaid: true, billPaidDate: '1405-07-06', dueDate: '1405-07-12', deletedAt: null, isFullySettled: false });
    expect(draftFromBill(saved).dueDate).toBe('1405-07-12');
    const fresh = buildBill({ ...draft, editingBillId: null, dueDate: null }, calculateBySplit(1000000, [1, 1], 'perUnit'), null, NOW);
    expect(fresh.bill).toMatchObject({ billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null });
  });

  it('وضعیت پرداخت، تاریخ پرداخت، مهلت پرداخت و حذف در تصویر اشتراکی قبض نمایش داده نمی‌شوند', () => {
    const b = migrateBill(legacyBill('b1'));
    const base = buildBillImageModel({ bill: b, units: units('b1') }, NOW);
    const variants = [
      setBillPaidDate(setBillPaid(b, true, TODAY), '1405-07-03'),
      setBillDueDate(b, '1405-07-08'),
      softDeleteBill(setBillDueDate(b, '1405-07-08'), NOW),
    ];
    for (const v of variants) {
      const m = buildBillImageModel({ bill: v, units: units('b1') }, NOW);
      expect(m).toEqual(base);
      const txt = JSON.stringify(m);
      expect(txt).not.toContain('پرداخت شد');
      expect(txt).not.toContain('مهلت');
      expect(txt).not.toMatch(/billPaid|dueDate|deleted|1405-07-0[38]|1405\/07\/0[38]/);
    }
  });
});

describe('مخزن داده: مهاجرت، محافظ حذف، حذف نرم', () => {
  beforeEach(() => { mem.clear(); billRepository._resetCache(); });

  it('داده ذخیره‌شده نسخه‌های قبلی هنگام بارگذاری مهاجرت و دوباره ذخیره می‌شود', async () => {
    mem.set('bills', JSON.stringify([legacyBill('b1'), legacyBill('b2', { month: 8 })]));
    mem.set('units', JSON.stringify([...units('b1'), ...units('b2')]));
    mem.set('schemaVersion', '1');
    const all = await billRepository.getAll();
    expect(all.map((x) => [x.bill.billPaid, x.bill.billPaidDate, x.bill.dueDate, x.bill.deletedAt])).toEqual([[false, null, null, null], [false, null, null, null]]);
    const stored = JSON.parse(mem.get('bills')!) as Bill[];
    expect(stored.every((b) => b.billPaid === false && b.billPaidDate === null && b.dueDate === null && b.deletedAt === null)).toBe(true);
    expect(JSON.parse(mem.get('schemaVersion')!)).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
    expect(JSON.parse(mem.get('units')!)).toHaveLength(4); // واحدها دست‌نخورده
  });

  it('قبض پرداخت‌شده حذف نمی‌شود (BillDeleteBlockedError)؛ پس از برداشتن تیک به «حذف‌شده» منتقل می‌شود', async () => {
    const b = setBillPaid(migrateBill(legacyBill('b1')), true, TODAY);
    await billRepository.upsert(b, units('b1'));
    await expect(billRepository.remove('b1', NOW)).rejects.toBeInstanceOf(BillDeleteBlockedError);
    expect((await billRepository.getById('b1'))?.bill.deletedAt).toBeNull();
    await billRepository.upsert(setBillPaid(b, false, TODAY), units('b1'));
    await billRepository.remove('b1', NOW);
    const del = await billRepository.getById('b1');
    expect(del?.bill.deletedAt).toBe(NOW.toISOString());
    expect(del?.units).toHaveLength(2); // داده‌ها باقی می‌ماند
  });

  it('قبض حذف‌شده از getAll / findByYearMonth حذف و فقط در getAllWithDeleted است؛ بازگردانی و حذف دائمی', async () => {
    await billRepository.upsert(migrateBill(legacyBill('b1')), units('b1'));
    await billRepository.upsert(migrateBill(legacyBill('b2', { expenseType: 'water' })), units('b2'));
    await billRepository.remove('b2', NOW);
    expect((await billRepository.getAll()).map((x) => x.bill.id)).toEqual(['b1']);
    expect((await billRepository.findByYearMonth(1405, 7)).map((x) => x.bill.id)).toEqual(['b1']);
    expect((await billRepository.getAllWithDeleted()).map((x) => x.bill.id).sort()).toEqual(['b1', 'b2']);

    // حذف دائمی فقط برای قبض حذف‌شده
    await expect(billRepository.purge('b1')).rejects.toBeInstanceOf(BillDeleteBlockedError);
    await billRepository.restore('b2');
    expect((await billRepository.getAll()).map((x) => x.bill.id).sort()).toEqual(['b1', 'b2']);
    await billRepository.remove('b2', NOW);
    await billRepository.purge('b2');
    expect(await billRepository.getById('b2')).toBeNull();
    expect((JSON.parse(mem.get('units')!) as Unit[]).map((u) => u.billId)).toEqual(['b1', 'b1']);
  });

  it('onChange پس از هر تغییر ذخیره‌شده خبر می‌دهد و قابل لغو است', async () => {
    const calls: number[] = [];
    const off = billRepository.onChange(() => { calls.push(1); });
    await billRepository.upsert(migrateBill(legacyBill('b1')), units('b1'));
    await billRepository.remove('b1', NOW);
    await billRepository.restore('b1');
    expect(calls).toHaveLength(3);
    off();
    await billRepository.remove('b1', NOW);
    expect(calls).toHaveLength(3);
  });

  it('upsert قبض بدون فیلدها را با مقدار پیش‌فرض ذخیره می‌کند', async () => {
    await billRepository.upsert(legacyBill('b9'), units('b9'));
    billRepository._resetCache();
    expect((await billRepository.getById('b9'))?.bill).toMatchObject({ billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null });
  });
});
