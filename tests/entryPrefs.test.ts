import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillWithUnits, ExpenseType } from '../src/models/types';
import { EXPENSE_TYPE_ORDER } from '../src/models/constants';
import {
  ALL_SPLIT_METHODS, DEFAULT_ENTRY_PREFS, activeTypeFilter, isMethodEnabled, isTypeEnabled, resolveMethod, sanitizeEntryPrefs,
  setMethodEnabled, setTypeEnabled, tileRows, typeFilterOptions, visibleBillList, visibleBills, type EntryPrefs,
} from '../src/logic/entryPrefs';
import { yearlyReport } from '../src/logic/report';
import { debtorsReport } from '../src/logic/debts';
import { billPaymentReport } from '../src/logic/billPaymentReport';
import { filterBills } from '../src/logic/billFilter';
import { selectDueAlerts } from '../src/logic/dueAlerts';
import { defaultSplitFor } from '../src/logic/split';
import { createBackup, serializeBackup } from '../src/logic/backup';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
let current: EntryPrefs = DEFAULT_ENTRY_PREFS;
vi.mock('../src/context/EntryPrefsContext', () => ({ useEntryPrefs: () => ({ prefs: current, setTypeOn: () => undefined, setMethodOn: () => undefined }) }));
vi.mock('../src/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggle: () => undefined }) }));
const { entryPrefsRepository } = await import('../src/storage/entryPrefsRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { ExpenseTypePicker } = await import('../src/components/ExpenseTypePicker');

let seq = 0;
function bill(type: ExpenseType, amount: number, extra: Partial<BillWithUnits['bill']> = {}): BillWithUnits {
  const id = `b${++seq}`;
  return {
    bill: { id, year: 1405, month: 3, expenseType: type, billNumber: null, description: null, totalAmount: amount, createdAt: new Date(2026, 0, seq).toISOString(), isFullySettled: false, dueDate: '1405-03-20', ...extra },
    units: [{ id: `${id}-1`, billId: id, unitNumber: 1, personCount: 1, shareAmount: amount, isSettled: false }],
  };
}
const without = (...off: ExpenseType[]): EntryPrefs => ({ ...DEFAULT_ENTRY_PREFS, types: EXPENSE_TYPE_ORDER.filter((t) => !off.includes(t)) });

describe('تنظیم انواع/روش‌ها: منطق', () => {
  it('پیش‌فرض: همه فعال', () => {
    expect(DEFAULT_ENTRY_PREFS.types).toEqual(EXPENSE_TYPE_ORDER);
    expect(DEFAULT_ENTRY_PREFS.methods).toEqual(['perPerson', 'perUnit', 'perArea']);
  });
  it('خاموش/روشن؛ آخرین نوع و آخرین روش فعال خاموش نمی‌شود', () => {
    let p = setTypeEnabled(DEFAULT_ENTRY_PREFS, 'gas', false);
    expect(isTypeEnabled(p, 'gas')).toBe(false);
    p = setTypeEnabled(p, 'gas', true);
    expect(p.types).toEqual(EXPENSE_TYPE_ORDER); // ترتیب ثابت
    let one = DEFAULT_ENTRY_PREFS;
    for (const t of EXPENSE_TYPE_ORDER) one = setTypeEnabled(one, t, false);
    expect(one.types).toHaveLength(1); // آخرین باقی می‌ماند
    let m = DEFAULT_ENTRY_PREFS;
    for (const x of ALL_SPLIT_METHODS) m = setMethodEnabled(m, x, false);
    expect(m.methods).toHaveLength(1);
    expect(isMethodEnabled(setMethodEnabled(DEFAULT_ENTRY_PREFS, 'perArea', false), 'perArea')).toBe(false);
  });
  it('پاکسازی مقدار ذخیره‌شدهٔ خراب/خالی ← همه فعال', () => {
    expect(sanitizeEntryPrefs(null)).toEqual(DEFAULT_ENTRY_PREFS);
    expect(sanitizeEntryPrefs({ types: [], methods: ['x'] })).toEqual(DEFAULT_ENTRY_PREFS);
    expect(sanitizeEntryPrefs({ types: ['misc', 'gas', 'nope'], methods: ['perArea'] })).toEqual({ types: ['gas', 'misc'], methods: ['perArea'] });
  });
  it('روش یادآوری‌شدهٔ خاموش ← اولین روش فعال', () => {
    const p: EntryPrefs = { ...DEFAULT_ENTRY_PREFS, methods: ['perUnit', 'perArea'] };
    expect(resolveMethod(p, 'perPerson')).toBe('perUnit');
    expect(resolveMethod(p, 'perArea')).toBe('perArea');
    expect(resolveMethod({ ...p, methods: ['perArea'] }, defaultSplitFor('gas', { gas: 'perPerson' }))).toBe('perArea');
  });
  it('کاشی‌ها: فقط انواع فعال، ۳ تا در هر ردیف', () => {
    expect(tileRows(DEFAULT_ENTRY_PREFS).map((r) => r.length)).toEqual([3, 3, 2]);
    expect(tileRows(without('gas', 'water', 'misc')).flat()).not.toContain('gas');
    expect(tileRows(without('gas', 'water', 'misc')).map((r) => r.length)).toEqual([3, 2]);
    expect(tileRows({ ...DEFAULT_ENTRY_PREFS, types: ['water'] })).toEqual([['water']]);
  });
});

describe('نوع خاموش از فهرست‌ها، فیلترها، گزارش‌ها و جمع‌ها کنار می‌رود (داده می‌ماند)', () => {
  const data = [bill('water', 400_000), bill('gas', 600_000), bill('gas', 100_000, { month: 4 }), bill('cleaning', 1_000_000)];
  const off = without('gas');

  it('visibleBills فقط انواع فعال را برمی‌گرداند و آرایهٔ اصلی را تغییر نمی‌دهد؛ روشن کردن دوباره همه را برمی‌گرداند', () => {
    expect(visibleBills(data, off).map((b) => b.bill.expenseType)).toEqual(['water', 'cleaning']);
    expect(data).toHaveLength(4);
    expect(visibleBills(data, DEFAULT_ENTRY_PREFS)).toHaveLength(4);
    expect(visibleBillList(data.map((d) => d.bill), off)).toHaveLength(2);
  });
  it('گزارش سالانه: جمع، تعداد و نوع‌ها بدون نوع خاموش؛ «بدون هزینه» هم آن را نشان نمی‌دهد', () => {
    const all = yearlyReport(data, 1405);
    expect(all.grandTotal).toBe(2_100_000);
    const r = yearlyReport(visibleBills(data, off), 1405, off.types);
    expect(r.grandTotal).toBe(1_400_000);
    expect(r.billCount).toBe(2);
    expect(r.byType.map((t) => t.type)).not.toContain('gas');
    expect(r.byType).toHaveLength(7);
    expect(r.byMonth.reduce((s, m) => s + m.total, 0)).toBe(1_400_000);
  });
  it('بدهکاران: بدهی نوع خاموش در جمع و فهرست نیست', () => {
    const now = new Date('2026-10-03T08:00:00Z');
    const full = debtorsReport(data, now);
    const part = debtorsReport(visibleBills(data, off), now);
    expect(full.grandTotal).toBe(2_100_000);
    expect(part.grandTotal).toBe(1_400_000);
    expect(part.units.flatMap((u) => u.items.map((i) => i.expenseType))).not.toContain('gas');
  });
  it('پرداخت قبض‌ها و سوابق: ردیف‌ها و فیلتر نوع', () => {
    const today = { year: 1405, month: 6, day: 1 };
    expect(billPaymentReport(visibleBills(data, off), 1405, null, today).rows.every((r) => r.bill.expenseType !== 'gas')).toBe(true);
    expect(billPaymentReport(data, 1405, null, today).rows.some((r) => r.bill.expenseType === 'gas')).toBe(true);
    const f = { year: 1405, month: null, type: null, status: 'all' as const };
    expect(filterBills(visibleBills(data, off), f).map((b) => b.bill.expenseType)).not.toContain('gas');
    expect(filterBills(data, f)).toHaveLength(4);
  });
  it('هشدار مهلت پرداخت نوع خاموش نمی‌آید', () => {
    const today = { year: 1405, month: 3, day: 19 };
    expect(selectDueAlerts(data.map((d) => d.bill), today).length).toBe(4);
    expect(selectDueAlerts(visibleBillList(data.map((d) => d.bill), off), today).length).toBe(2);
  });
  it('گزینه‌های فیلتر نوع: همه + فقط انواع فعال؛ فیلتر روی نوع خاموش ← همه', () => {
    const o = typeFilterOptions(off);
    expect(o[0]).toEqual({ value: null, label: 'همه' });
    expect(o).toHaveLength(8);
    expect(o.map((x) => x.value)).not.toContain('gas');
    expect(activeTypeFilter(off, 'gas')).toBeNull();
    expect(activeTypeFilter(off, 'water')).toBe('water');
  });
});

describe('ذخیره و فرم', () => {
  beforeEach(() => mem.clear());
  it('کلید جدا در kvStore؛ خارج از پشتیبان؛ مقدار خراب ← همه فعال', async () => {
    expect(await entryPrefsRepository.get()).toEqual(DEFAULT_ENTRY_PREFS);
    await entryPrefsRepository.save({ types: ['water', 'gas'], methods: ['perUnit'] });
    expect(JSON.parse(mem.get('entryPrefs')!)).toEqual({ types: ['gas', 'water'].sort((a, b) => EXPENSE_TYPE_ORDER.indexOf(a as ExpenseType) - EXPENSE_TYPE_ORDER.indexOf(b as ExpenseType)), methods: ['perUnit'] });
    expect((await entryPrefsRepository.get()).methods).toEqual(['perUnit']);
    expect(JSON.stringify(await backupRepository.collect())).not.toContain('entryPrefs');
    expect(serializeBackup(createBackup(await backupRepository.collect(), '1.6.10'))).not.toContain('entryPrefs');
    mem.set('entryPrefs', '"junk"');
    expect(await entryPrefsRepository.get()).toEqual(DEFAULT_ENTRY_PREFS);
  });
  it('فرم ثبت قبض: کاشی نوع خاموش نیست؛ در ویرایش نوع فعلیِ خاموش همچنان دیده می‌شود', () => {
    current = without('gas', 'electricity');
    const html = renderToStaticMarkup(createElement(ExpenseTypePicker, { value: null, onChange: () => undefined }));
    expect(html).not.toContain('>گاز<');
    expect(html).not.toContain('>برق<');
    expect(html).toContain('>آب<');
    const editing = renderToStaticMarkup(createElement(ExpenseTypePicker, { value: 'gas', onChange: () => undefined }));
    expect(editing).toContain('>گاز<');
    current = DEFAULT_ENTRY_PREFS;
    expect(renderToStaticMarkup(createElement(ExpenseTypePicker, { value: null, onChange: () => undefined }))).toContain('>گاز<');
  });
});
