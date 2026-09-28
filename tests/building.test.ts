import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillDraft, BillWithUnits } from '../src/models/types';
import { DEFAULT_PERSON_COUNT, addDraftUnit, buildBill, draftFromBill, emptyDraft, removeDraftUnit } from '../src/logic/billFactory';
import {
  buildingFromBills, buildingFromDraftUnits, debtsBeyondUnitCount, defaultBuilding, draftMatchesBuilding,
  draftUnitsFromBuilding, latestAliases, resizeBuilding, sanitizeAlias, sanitizeBuilding, unitLabel, unitShortLabel,
} from '../src/logic/building';
import { sanitizeUnitTemplate } from '../src/logic/unitTemplate';
import { calculateBySplit } from '../src/logic/split';
import { liveShares } from '../src/components/UnitsEditor';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { buildingRepository } = await import('../src/storage/buildingRepository');
const { billRepository } = await import('../src/storage/billRepository');

function bw(id: string, createdAt: string, counts: number[], aliases: (string | null)[] = [], extra: Partial<BillWithUnits['bill']> = {}): BillWithUnits {
  const units = counts.map((c, i) => ({
    id: `${id}-${i}`, billId: id, unitNumber: i + 1, personCount: c, shareAmount: 100, isSettled: false,
    ...(aliases[i] !== undefined ? { alias: aliases[i] } : {}),
  }));
  return { bill: { id, year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 100 * counts.length, createdAt, isFullySettled: false, ...extra }, units };
}

describe('برچسب و اسم مستعار واحد', () => {
  it('«واحد ۱» و «واحد ۱ - آقای رضایی» با ارقام فارسی', () => {
    expect(unitLabel(1)).toBe('واحد ۱');
    expect(unitLabel(12, null)).toBe('واحد ۱۲');
    expect(unitLabel(1, 'آقای رضایی')).toBe('واحد ۱ - آقای رضایی');
    expect(unitLabel(3, '   ')).toBe('واحد ۳');
    expect(unitShortLabel(2, 'خانم احمدی')).toBe('۲ - خانم احمدی');
  });

  it('تمیز کردن اسم مستعار: فاصله‌ها، طول حداکثر ۴۰، خالی = null', () => {
    expect(sanitizeAlias('  آقای   رضایی ')).toBe('آقای رضایی');
    expect(sanitizeAlias('')).toBeNull();
    expect(sanitizeAlias(null)).toBeNull();
    expect(sanitizeAlias(5)).toBeNull();
    expect(Array.from(sanitizeAlias('ا'.repeat(80))!)).toHaveLength(40);
  });
});

describe('تنظیمات ساختمان (منطق)', () => {
  it('اعتبارسنجی', () => {
    expect(sanitizeBuilding({ units: [{ alias: ' آقای رضایی ', defaultPersons: 5 }, { alias: null, defaultPersons: 0 }] }))
      .toEqual({ units: [{ alias: 'آقای رضایی', defaultPersons: 5 }, { alias: null, defaultPersons: 0 }] });
    expect(sanitizeBuilding({ units: [] })).toBeNull();
    expect(sanitizeBuilding({ units: [{ alias: null, defaultPersons: -1 }] })).toBeNull();
    expect(sanitizeBuilding({ units: [{ alias: 3, defaultPersons: 1 }] })).toBeNull();
    expect(sanitizeBuilding(null)).toBeNull();
    expect(sanitizeBuilding({ units: Array.from({ length: 501 }, () => ({ alias: null, defaultPersons: 1 })) })).toBeNull();
  });

  it('تغییر تعداد واحدها: افزایش با واحد بدون اسم ۱ نفره، کاهش از آخر، حداقل ۱', () => {
    const b = { units: [{ alias: 'الف', defaultPersons: 3 }, { alias: null, defaultPersons: 2 }] };
    expect(resizeBuilding(b, 4).units).toEqual([...b.units, { alias: null, defaultPersons: 1 }, { alias: null, defaultPersons: 1 }]);
    expect(resizeBuilding(b, 1).units).toEqual([b.units[0]]);
    expect(resizeBuilding(b, 0).units).toHaveLength(1);
  });

  it('مهاجرت: از جدیدترین قبض حذف‌نشده (نفرات و اسم‌ها به ترتیب شماره واحد)', () => {
    const newer = bw('b2', '2026-09-20T08:00:00Z', [3, 1, 2], ['رضایی', null, null]);
    newer.units.reverse();
    const deleted = bw('b3', '2026-09-25T08:00:00Z', [9, 9], [], { deletedAt: '2026-09-26T08:00:00Z' });
    expect(buildingFromBills([bw('b1', '2026-09-01T08:00:00Z', [1, 1]), newer, deleted])).toEqual({
      units: [{ alias: 'رضایی', defaultPersons: 3 }, { alias: null, defaultPersons: 1 }, { alias: null, defaultPersons: 2 }],
    });
  });

  it('مهاجرت بدون قبض: الگوی نسخه قبلی، وگرنه ۱ واحد با ۱ نفر', () => {
    expect(buildingFromBills([], [2, 4])).toEqual({ units: [{ alias: null, defaultPersons: 2 }, { alias: null, defaultPersons: 4 }] });
    expect(buildingFromBills([], null)).toEqual(defaultBuilding());
    expect(defaultBuilding()).toEqual({ units: [{ alias: null, defaultPersons: 1 }] });
  });

  it('هشدار کاهش واحدها: واحدهای حذف‌شونده که هنوز بدهی دارند', () => {
    const a = bw('b1', '2026-09-01T08:00:00Z', [1, 1, 1, 1], [null, null, 'تهرانی', null]);
    a.units[3] = { ...a.units[3], payments: [{ id: 'p', amount: 40, paidAt: null }] };
    const b = bw('b2', '2026-09-10T08:00:00Z', [1, 1, 1], [null, null, 'تهرانی']);
    b.units[2] = { ...b.units[2], payments: [{ id: 'q', amount: 100, paidAt: null }], isSettled: true };
    const del = bw('b3', '2026-09-12T08:00:00Z', [1, 1, 1, 1, 1], [], { deletedAt: '2026-09-13T08:00:00Z' });
    expect(debtsBeyondUnitCount([a, b, del], 2)).toEqual([
      { unitNumber: 3, alias: 'تهرانی', amount: 100 },
      { unitNumber: 4, alias: null, amount: 60 },
    ]);
    expect(debtsBeyondUnitCount([a, b], 4)).toEqual([]);
  });

  it('اسم واحدها در گزارش‌ها از جدیدترین قبض (عکس لحظه‌ای)', () => {
    const a = bw('b1', '2026-09-01T08:00:00Z', [1, 1], ['قدیمی', 'ب']);
    const b = bw('b2', '2026-09-10T08:00:00Z', [1], ['جدید']);
    const m = latestAliases([b, a]);
    expect(m.get(1)).toBe('جدید');
    expect(m.get(2)).toBe('ب');
  });

  it('مقایسه فرم با پیش‌فرض و «ذخیره به‌عنوان پیش‌فرض»', () => {
    const b = { units: [{ alias: 'رضایی', defaultPersons: 5 }, { alias: null, defaultPersons: 0 }] };
    const rows = draftUnitsFromBuilding(b);
    expect(rows).toEqual({ personCounts: ['5', '0'], unitAliases: ['رضایی', null] });
    expect(draftMatchesBuilding(rows.personCounts, rows.unitAliases, b)).toBe(true);
    expect(draftMatchesBuilding(['5', '0', '1'], ['رضایی', null, null], b)).toBe(false);
    expect(buildingFromDraftUnits(['5', '0', ''], ['رضایی', null, null])).toEqual({
      units: [{ alias: 'رضایی', defaultPersons: 5 }, { alias: null, defaultPersons: 0 }, { alias: null, defaultPersons: 1 }],
    });
    expect(buildingFromDraftUnits([])).toBeNull();
  });
});

describe('فرم قبض جدید از تنظیمات ساختمان', () => {
  const building = { units: [{ alias: 'آقای رضایی', defaultPersons: 5 }, { alias: null, defaultPersons: 3 }, { alias: null, defaultPersons: 0 }] };

  it('بدون تنظیمات: یک واحد ۱ نفره', () => {
    expect(DEFAULT_PERSON_COUNT).toBe('1');
    const d = emptyDraft(1405, 7);
    expect(d.personCounts).toEqual(['1']);
    expect(d.unitAliases).toEqual([null]);
  });

  it('واحدها، اسم‌ها و نفرات پیش‌فرض از ساختمان پر می‌شوند', () => {
    const d = emptyDraft(1405, 8, building);
    expect(d.personCounts).toEqual(['5', '3', '0']);
    expect(d.unitAliases).toEqual(['آقای رضایی', null, null]);
    expect(d.editingBillId).toBeNull();
    expect(d.amountDigits).toBe('');
  });

  it('افزودن/حذف واحد در فرم فقط برای همین قبض؛ اسم همراه ردیف خودش جابه‌جا می‌شود', () => {
    let d = emptyDraft(1405, 8, building);
    d = addDraftUnit(d);
    expect(d.personCounts).toEqual(['5', '3', '0', '1']);
    expect(d.unitAliases).toEqual(['آقای رضایی', null, null, null]);
    d = removeDraftUnit(d, 0);
    expect(d.personCounts).toEqual(['3', '0', '1']);
    expect(d.unitAliases).toEqual([null, null, null]);
    // فرم قدیمی بدون unitAliases
    const legacy: BillDraft = { ...emptyDraft(1405, 8), personCounts: ['2', '2'], unitAliases: undefined };
    expect(addDraftUnit(legacy).unitAliases).toEqual([null, null, null]);
  });

  it('عکس لحظه‌ای: قبض اسم‌ها و نفرات زمان ثبت را نگه می‌دارد؛ واحد خالی سهم ۰ و تسویه‌شده', () => {
    const d: BillDraft = { ...emptyDraft(1405, 8, building), expenseType: 'water', amountDigits: '640000' };
    const calc = calculateBySplit(640000, [5, 3, 0], 'perPerson');
    const saved = buildBill(d, calc, null, new Date('2026-09-28T08:00:00Z'));
    expect(saved.units.map((u) => [u.unitNumber, u.alias, u.personCount, u.shareAmount, u.isSettled])).toEqual([
      [1, 'آقای رضایی', 5, 400000, false],
      [2, null, 3, 240000, false],
      [3, null, 0, 0, true],
    ]);
    // ویرایش: فرم از روی عکس لحظه‌ای قبض پر می‌شود (نه از تنظیمات فعلی)
    const back = draftFromBill(saved);
    expect(back.unitAliases).toEqual(['آقای رضایی', null, null]);
    expect(back.personCounts).toEqual(['5', '3', '0']);
  });

  it('سهم زنده ردیف‌های فرم', () => {
    expect(liveShares('100000', ['5', '3', '0', '2'], 'perPerson')).toEqual([50000, 30000, 0, 20000]);
    expect(liveShares('90000', ['5', '0', '1'], 'perUnit')).toEqual([30000, 30000, 30000]);
    expect(liveShares('', ['1'], 'perPerson')).toBeNull();
    expect(liveShares('1000', ['0', '0'], 'perPerson')).toBeNull();
    expect(liveShares('1000', ['', '1'], 'perPerson')).toBeNull();
  });
});

describe('ذخیره تنظیمات ساختمان و مهاجرت اولین اجرا', () => {
  beforeEach(() => { mem.clear(); billRepository._resetCache(); });

  it('نصب تازه: ۱ واحد ۱ نفره ذخیره می‌شود', async () => {
    expect(await buildingRepository.get()).toEqual(defaultBuilding());
    expect(JSON.parse(mem.get('building')!).units).toEqual(defaultBuilding().units);
  });

  it('کاربر نسخه قبلی: از جدیدترین قبض حذف‌نشده ساخته و الگوی قدیمی پاک می‌شود', async () => {
    const a = bw('b1', '2026-09-01T08:00:00Z', [1, 2]);
    const b = bw('b2', '2026-09-10T08:00:00Z', [2, 2, 3, 1]);
    const del = bw('b3', '2026-09-20T08:00:00Z', [7], [], { deletedAt: '2026-09-21T08:00:00Z' });
    await billRepository.replaceAll([a.bill, b.bill, del.bill], [...a.units, ...b.units, ...del.units]);
    mem.set('unitTemplate', JSON.stringify({ personCounts: [9, 9], updatedAt: 'x' }));
    const got = await buildingRepository.get();
    expect(got.units.map((u) => u.defaultPersons)).toEqual([2, 2, 3, 1]);
    expect(mem.has('unitTemplate')).toBe(false);
    // تغییر قبض‌ها بعد از مهاجرت، تنظیمات را عوض نمی‌کند
    const c = bw('b4', '2026-09-25T08:00:00Z', [1]);
    await billRepository.upsert(c.bill, c.units);
    expect((await buildingRepository.get()).units).toHaveLength(4);
  });

  it('بدون قبض ولی با الگوی نسخه قبلی', async () => {
    mem.set('unitTemplate', JSON.stringify({ personCounts: [3, 1], updatedAt: 'x' }));
    expect((await buildingRepository.get()).units).toEqual([{ alias: null, defaultPersons: 3 }, { alias: null, defaultPersons: 1 }]);
  });

  it('ذخیره و خواندن دوباره (حافظه ماندگار)', async () => {
    await buildingRepository.save({ units: [{ alias: ' آقای رضایی ', defaultPersons: 5 }, { alias: '', defaultPersons: 0 }] });
    expect(await buildingRepository.get()).toEqual({ units: [{ alias: 'آقای رضایی', defaultPersons: 5 }, { alias: null, defaultPersons: 0 }] });
    await expect(buildingRepository.save({ units: [] })).rejects.toThrow();
  });

  it('الگوی قدیمی همچنان اعتبارسنجی می‌شود (برای پشتیبان‌های قدیمی)', () => {
    expect(sanitizeUnitTemplate([1, 2, 3])).toEqual([1, 2, 3]);
    expect(sanitizeUnitTemplate([1, 0])).toBeNull();
  });
});
