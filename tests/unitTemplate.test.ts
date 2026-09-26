import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillWithUnits } from '../src/models/types';
import { DEFAULT_PERSON_COUNT, emptyDraft } from '../src/logic/billFactory';
import { sanitizeUnitTemplate, templateFromBills } from '../src/logic/unitTemplate';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { unitTemplateRepository } = await import('../src/storage/unitTemplateRepository');
const { billRepository } = await import('../src/storage/billRepository');

function bw(id: string, createdAt: string, counts: number[]): BillWithUnits {
  const units = counts.map((c, i) => ({ id: `${id}-${i}`, billId: id, unitNumber: i + 1, personCount: c, shareAmount: 100, isSettled: false }));
  return { bill: { id, year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 100 * counts.length, createdAt, isFullySettled: false }, units };
}

describe('تعداد نفرات پیش‌فرض و قبض جدید', () => {
  it('تعداد نفرات واحد جدید به‌طور پیش‌فرض ۱ است', () => {
    expect(DEFAULT_PERSON_COUNT).toBe('1');
    const d = emptyDraft(1405, 7);
    expect(d.personCounts).toEqual(['1']);
    expect(d.prefilledUnits).toBeUndefined();
  });

  it('قبض جدید با واحدهای الگو پر می‌شود', () => {
    const d = emptyDraft(1405, 8, [2, 3, 1, 4, 2, 2]);
    expect(d.personCounts).toEqual(['2', '3', '1', '4', '2', '2']);
    expect(d.prefilledUnits).toBe(6);
    expect(d.editingBillId).toBeNull();
    expect(d.amountDigits).toBe('');
  });
});

describe('الگوی واحدها', () => {
  beforeEach(() => { mem.clear(); billRepository._resetCache(); });

  it('اعتبارسنجی الگو', () => {
    expect(sanitizeUnitTemplate([1, 2, 3])).toEqual([1, 2, 3]);
    expect(sanitizeUnitTemplate([])).toBeNull();
    expect(sanitizeUnitTemplate([1, 0])).toBeNull();
    expect(sanitizeUnitTemplate([1.5])).toBeNull();
    expect(sanitizeUnitTemplate('1,2')).toBeNull();
    expect(sanitizeUnitTemplate(null)).toBeNull();
  });

  it('الگو از جدیدترین قبض (به ترتیب شماره واحد)', () => {
    const newer = bw('b2', '2026-09-20T08:00:00Z', [3, 1, 2]);
    newer.units.reverse();
    expect(templateFromBills([bw('b1', '2026-09-01T08:00:00Z', [1, 1]), newer])).toEqual([3, 1, 2]);
    expect(templateFromBills([])).toBeNull();
  });

  it('بدون قبض و الگو: null (قبض جدید با یک واحد ۱ نفره)', async () => {
    expect(await unitTemplateRepository.get()).toBeNull();
  });

  it('ذخیره الگو پس از ثبت قبض و خواندن دوباره (حافظه ماندگار)', async () => {
    await unitTemplateRepository.save([2, 3, 1, 4, 2, 2]);
    expect(await unitTemplateRepository.get()).toEqual([2, 3, 1, 4, 2, 2]);
    // آخرین مجموعه ذخیره‌شده، پیش‌فرض جدید می‌شود
    await unitTemplateRepository.save([1, 1, 5]);
    expect(await unitTemplateRepository.get()).toEqual([1, 1, 5]);
    // الگوی نامعتبر ذخیره نمی‌شود
    await unitTemplateRepository.save([]);
    expect(await unitTemplateRepository.get()).toEqual([1, 1, 5]);
  });

  it('کاربران نسخه قبلی (بدون الگوی ذخیره‌شده): الگو از آخرین قبض ساخته می‌شود', async () => {
    const a = bw('b1', '2026-09-01T08:00:00Z', [1, 2]);
    const b = bw('b2', '2026-09-10T08:00:00Z', [2, 2, 3, 1]);
    await billRepository.replaceAll([a.bill, b.bill], [...a.units, ...b.units]);
    expect(await unitTemplateRepository.get()).toEqual([2, 2, 3, 1]);
    await unitTemplateRepository.clear();
    expect(await unitTemplateRepository.get()).toEqual([2, 2, 3, 1]);
  });
});
