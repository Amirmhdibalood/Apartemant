import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BillDraft, BillWithUnits } from '../src/models/types';
import { calculateBySplit, defaultSplitFor, sanitizeSplitDefaults, splitMethodOf, splitWeights } from '../src/logic/split';
import { validateDraft } from '../src/logic/validation';
import { buildBill, draftFromBill, emptyDraft } from '../src/logic/billFactory';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
const { splitDefaultsRepository } = await import('../src/storage/splitDefaultsRepository');

const draft = (over: Partial<BillDraft> = {}): BillDraft => ({
  ...emptyDraft(1405, 7), expenseType: 'gas', amountDigits: '1200000', personCounts: ['2', '3', '1', '4'], ...over,
});

describe('نحوه تقسیم: محاسبه', () => {
  it('بر اساس نفرات (رفتار قبلی)', () => {
    const r = calculateBySplit(1000000, [2, 3, 5], 'perPerson');
    expect(r.shares.map((s) => s.shareAmount)).toEqual([200000, 300000, 500000]);
    expect(r.totalPersons).toBe(10);
  });

  it('بر اساس واحد: هر واحد سهم برابر؛ نفرات واقعی در خروجی حفظ می‌شود', () => {
    const r = calculateBySplit(1200000, [2, 3, 1, 4], 'perUnit');
    expect(r.shares.map((s) => s.shareAmount)).toEqual([300000, 300000, 300000, 300000]);
    expect(r.shares.map((s) => s.personCount)).toEqual([2, 3, 1, 4]);
    expect(r).toMatchObject({ totalPersons: 4, perPersonExact: 300000, splitMethod: 'perUnit', isExact: true });
    expect(splitWeights([2, 3], 'perUnit')).toEqual([1, 1]);
  });

  it('بر اساس واحد با باقیمانده: جمع سهم‌ها دقیقاً برابر مبلغ کل', () => {
    const r = calculateBySplit(1000000, [5, 1, 2], 'perUnit');
    expect(r.shares.map((s) => s.shareAmount)).toEqual([333334, 333333, 333333]);
    expect(r.shares.reduce((a, s) => a + s.shareAmount, 0)).toBe(1000000);
  });
});

describe('نحوه تقسیم: فرم و ذخیره', () => {
  it('پیش‌فرض فرم جدید «بر اساس نفرات» است', () => {
    expect(emptyDraft(1405, 7).splitMethod).toBe('perPerson');
  });

  it('بر اساس واحد: نفرات خالی/نامعتبر خطا نمی‌دهد و نفرات معتبر حفظ می‌شود', () => {
    const d = draft({ splitMethod: 'perUnit', personCounts: ['2', '', '4'] });
    const v = validateDraft(d);
    expect(v.ok && v.value.personCounts).toEqual([2, 1, 4]);
    expect(validateDraft({ ...d, splitMethod: 'perPerson' }).ok).toBe(false);
  });

  it('قبض با نحوه تقسیم ذخیره می‌شود و نفرات واقعی واحدها دست‌نخورده می‌ماند', () => {
    const d = draft({ splitMethod: 'perUnit' });
    const calc = calculateBySplit(1200000, [2, 3, 1, 4], 'perUnit');
    const saved = buildBill(d, calc, null);
    expect(saved.bill.splitMethod).toBe('perUnit');
    expect(saved.units.map((u) => [u.personCount, u.shareAmount])).toEqual([[2, 300000], [3, 300000], [1, 300000], [4, 300000]]);
    const back = draftFromBill(saved);
    expect(back).toMatchObject({ splitMethod: 'perUnit', splitChosen: true, personCounts: ['2', '3', '1', '4'] });
  });

  it('قبض‌های قدیمی (بدون splitMethod) = بر اساس نفرات', () => {
    const old: BillWithUnits = {
      bill: { id: 'b', year: 1405, month: 1, expenseType: 'water', billNumber: null, description: null, totalAmount: 100, createdAt: '2026-01-01T00:00:00Z', isFullySettled: false },
      units: [{ id: 'u', billId: 'b', unitNumber: 1, personCount: 3, shareAmount: 100, isSettled: false }],
    };
    expect(splitMethodOf(old.bill)).toBe('perPerson');
    expect(draftFromBill(old).splitMethod).toBe('perPerson');
  });
});

describe('آخرین نحوه تقسیم هر نوع هزینه', () => {
  it('پیش‌فرض کلی بر اساس نفرات؛ پس از یک‌بار استفاده، همان روش پیش‌فرض همان نوع می‌شود', async () => {
    mem.clear();
    expect(defaultSplitFor('gas', await splitDefaultsRepository.get())).toBe('perPerson');
    await splitDefaultsRepository.remember('gas', 'perUnit');
    const d = await splitDefaultsRepository.get();
    expect(defaultSplitFor('gas', d)).toBe('perUnit');
    expect(defaultSplitFor('water', d)).toBe('perPerson');
    expect(defaultSplitFor(null, d)).toBe('perPerson');
    await splitDefaultsRepository.remember('gas', 'perPerson');
    expect(defaultSplitFor('gas', await splitDefaultsRepository.get())).toBe('perPerson');
  });

  it('داده نامعتبر حذف می‌شود', () => {
    expect(sanitizeSplitDefaults({ gas: 'perUnit', phone: 'perUnit', water: 'bad' })).toEqual({ gas: 'perUnit' });
    expect(sanitizeSplitDefaults(null)).toEqual({});
    expect(sanitizeSplitDefaults(['perUnit'])).toEqual({});
  });
});

describe('Manifest بدون مجوز اینترنت', () => {
  it('خط INTERNET قالب Capacitor حذف و tools:node="remove" اضافه می‌شود (idempotent)', async () => {
    const url = pathToFileURL(path.resolve(__dirname, '../scripts/manifest-permissions.mjs')).href;
    const { stripNetworkPermissions } = await import(/* @vite-ignore */ url);
    const src = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name"></application>
    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>`;
    const out = stripNetworkPermissions(src);
    expect(out).toContain('xmlns:tools="http://schemas.android.com/tools"');
    expect(out.match(/android\.permission\.INTERNET/g)).toHaveLength(1);
    expect(out).toContain('<uses-permission android:name="android.permission.INTERNET" tools:node="remove" />');
    expect(stripNetworkPermissions(out)).toBe(out);
  });
});
