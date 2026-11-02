/**
 * نوع‌های قبض سفارشی (هر ساختمان جدا، قالب پشتیبان ۱۱): رجیستری، نام، جداسازی ساختمان‌ها، حذف/خاموش،
 * پشتیبان (رفت‌وبرگشت بدون هیچ «متفرقه»؛ نگاشت دفاعی نوع ناشناخته)، صندوق، ترتیب گزارش‌ها، برچسب PDF/تصویر.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests, withSqlite } from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { backupRepository } from '../src/storage/backupRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { billTypeRepository, BillTypeError } from '../src/storage/billTypeRepository';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import { BACKUP_VERSION, createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import {
  CUSTOM_COLORS, CUSTOM_ICON_IDS, MAX_CUSTOM_TYPES, buildingTypeOrder, cleanTypeName, compareTypes, customTypesOf, getCustomType,
  newCustomTypeId, setCustomTypeRegistry, suggestIconColor, typeInfo, typeLabel, typeNameKey, typeOrderIndex, validateCustomType,
  type CustomBillType,
} from '../src/logic/billTypes';
import { EXPENSE_TYPE_ORDER, isCustomTypeId, isExpenseType } from '../src/models/constants';
import { DEFAULT_ENTRY_PREFS, tileRows, typeFilterOptions, visibleBills, withCustomTypes, isTypeEnabled } from '../src/logic/entryPrefs';
import { fundDisplayOrder, fundReasonFa, fundTypeRows, sanitizeFundTypes } from '../src/logic/fundTypes';
import { sanitizeSplitDefaults } from '../src/logic/split';
import { normalizeType } from '../src/logic/billFilter';
import { yearlyReport } from '../src/logic/report';
import { monthlyTotals } from '../src/logic/monthlyTotals';
import { typeShares } from '../src/logic/chartReport';
import { yearlyDoc, monthlyDetailDoc } from '../src/logic/reportDoc';
import { buildBillImageModel } from '../src/logic/billImage';
import { typeColors, typeBarColor } from '../src/logic/typeColor';
import { GlyphSvg } from '../src/components/ExpenseIcon';
import { CustomTypesRows, CustomTypeSheet } from '../src/components/CustomTypesSection';
import { ThemeProvider } from '../src/context/ThemeContext';
import type { ReactElement } from 'react';
const themed = (el: ReactElement) => renderToStaticMarkup(createElement(ThemeProvider, null, el));
import type { Bill, BillWithUnits, CustomTypeId, ExpenseType, Payment, Unit } from '../src/models/types';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;
beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
  setCustomTypeRegistry([]);
});

const bill = (id: string, expenseType: ExpenseType, extra: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType, billNumber: null, description: null, totalAmount: 10_000,
  createdAt: '2026-01-01T00:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
});
const unit = (billId: string, payments: Payment[] = []): Unit => ({
  id: `${billId}-u1`, billId, unitNumber: 1, personCount: 2, shareAmount: 10_000, isSettled: false, payments,
});
const bw = (b: Bill): BillWithUnits => ({ bill: b, units: [unit(b.id)] });
const ct = (id: string, buildingId: string, name: string, extra: Partial<CustomBillType> = {}): CustomBillType => ({
  id: id as CustomTypeId, buildingId, name, icon: 'elevator', color: 'indigo', sortOrder: 0, hidden: false, createdAt: '2026-01-01T00:00:00.000Z', ...extra,
});
const exportText = async () => serializeBackup(createBackup(await backupRepository.collect(), '1.9.0'));
async function newPhone() {
  prefs().clear(); billRepository._resetCache(); await resetIdbForTests(); await resetSqliteForTests(); setCustomTypeRegistry([]);
}

describe('رجیستری و شناسه', () => {
  it('شناسهٔ سفارشی الگوی سخت‌گیرانه دارد؛ isExpenseType فقط ۸ نوع داخلی می‌ماند', () => {
    for (let i = 0; i < 50; i++) expect(isCustomTypeId(newCustomTypeId())).toBe(true);
    for (const bad of ['c_', 'c_short', 'C_abcdefgh', 'c_abcdefgh!', 'c_' + 'a'.repeat(25), 'constructor', '__proto__', 'water', 1, null]) {
      expect(isCustomTypeId(bad), String(bad)).toBe(false);
    }
    expect(isExpenseType('c_abcdefgh12')).toBe(false);
    expect(normalizeType('c_abcdefgh12')).toBe('c_abcdefgh12');
    expect(normalizeType('constructor')).toBeNull();
  });

  it('برچسب/رنگ/نماد از رجیستری؛ نوع ناشناخته مثل «متفرقه»', () => {
    setCustomTypeRegistry([ct('c_aaaaaaaa01', 'B', 'آسانسور')]);
    expect(typeLabel('c_aaaaaaaa01')).toBe('آسانسور');
    expect(typeInfo('c_aaaaaaaa01').custom).toBe(true);
    expect(typeInfo('c_aaaaaaaa01').icon).toBe('elevator');
    expect(typeLabel('c_zzzzzzzz99')).toBe('متفرقه');
    expect(typeLabel('water')).toBe('آب');
    expect(typeColors('c_aaaaaaaa01', 'light').color).toBe('#4F46E5');
    expect(typeColors('c_aaaaaaaa01', 'dark').color).toBe('#818CF8');
    expect(typeColors('c_aaaaaaaa01', 'dark', 'amoled').color).toBe('#818CF8');
    expect(typeBarColor('c_aaaaaaaa01', 'dark')).toBe('#818CF8');
  });

  it('ترتیب: ۸ نوع داخلی اول، بعد سفارشی‌ها به ترتیب خودشان؛ فقط سفارشی‌های همان ساختمان', () => {
    setCustomTypeRegistry([ct('c_bbbbbbbb02', 'A', 'دوم', { sortOrder: 1 }), ct('c_aaaaaaaa01', 'A', 'اول', { sortOrder: 0 }), ct('c_cccccccc03', 'B', 'دیگری')]);
    expect(buildingTypeOrder('A')).toEqual([...EXPENSE_TYPE_ORDER, 'c_aaaaaaaa01', 'c_bbbbbbbb02']);
    expect(buildingTypeOrder('B')).toEqual([...EXPENSE_TYPE_ORDER, 'c_cccccccc03']);
    expect(customTypesOf('C')).toEqual([]);
    expect(typeOrderIndex('misc')).toBeLessThan(typeOrderIndex('c_aaaaaaaa01'));
    expect(['c_bbbbbbbb02', 'water', 'c_aaaaaaaa01', 'misc'].sort(compareTypes)).toEqual(['water', 'misc', 'c_aaaaaaaa01', 'c_bbbbbbbb02']);
  });

  it('۱۲ نماد و ۸ رنگ تأییدشده؛ پیشنهاد ترکیب آزاد', () => {
    expect(CUSTOM_ICON_IDS).toHaveLength(12);
    expect(CUSTOM_COLORS.map((c) => c.color)).toEqual(['#16A34A', '#0284C7', '#4F46E5', '#B45309', '#C026D3', '#65A30D', '#E11D48', '#0E7490']);
    expect(CUSTOM_COLORS.map((c) => c.dark)).toEqual(['#4ADE80', '#38BDF8', '#818CF8', '#F59E0B', '#E879F9', '#A3E635', '#FB7185', '#22D3EE']);
    const taken = [ct('c_aaaaaaaa01', 'A', 'x', { icon: 'elevator', color: 'green' })];
    const s = suggestIconColor(taken);
    expect(s.icon === 'elevator' && s.color === 'green').toBe(false);
  });
});

describe('نام نوع قبض', () => {
  const v = (name: string, others: CustomBillType[] = [], isNew = true, icon = 'bell' as const, color = 'rose' as const) =>
    validateCustomType({ name, icon, color }, others, { isNew });
  it('یکسان‌سازی: فاصله‌ها، ي/ك عربی', () => {
    expect(cleanTypeName('  آسانسور    ساختمان ')).toBe('آسانسور ساختمان');
    expect(cleanTypeName('نگهباني كشيك')).toBe('نگهبانی کشیک');
    expect(typeNameKey('آب‌گرمکن')).toBe(typeNameKey('آب گرمکن'));
    expect(typeNameKey('آب‌گرمکن')).toBe(typeNameKey('آبگرمکن'));
  });
  it('۲ تا ۲۰ حرف، نه فقط عدد', () => {
    expect(v('آ')).toMatch(/دست‌کم/);
    expect(v('  آ  ')).toMatch(/دست‌کم/);
    expect(v('آب')).toMatch(/اصلی/); // نام نوع داخلی
    expect(v('ل'.repeat(21))).toMatch(/حداکثر/);
    expect(v('ل'.repeat(20))).toBeNull();
    expect(v('۱۲۳')).toMatch(/عدد/);
    expect(v('12 34')).toMatch(/عدد/);
    expect(v('پارکینگ ۲')).toBeNull();
  });
  it('یکتا در برابر ۸ نوع داخلی و سفارشی‌های همین ساختمان (بی‌توجه به نیم‌فاصله/فاصله/ي)', () => {
    expect(v('شارژساختمان')).toMatch(/اصلی/);
    expect(v('شارژ‌ ساختمان')).toMatch(/اصلی/);
    const others = [ct('c_aaaaaaaa01', 'A', 'نگهبانی', { icon: 'shield', color: 'green' })];
    expect(v('نگهباني', others)).toMatch(/از قبل/);
    expect(v('نگه‌بانی', others)).toMatch(/از قبل/);
    expect(v('آسانسور', others)).toBeNull();
  });
  it('ترکیب نماد+رنگ یکتا؛ سقف ۱۲', () => {
    const others = [ct('c_aaaaaaaa01', 'A', 'نگهبانی', { icon: 'bell', color: 'rose' })];
    expect(v('آیفون', others)).toMatch(/نماد/);
    expect(v('آیفون', others, true, 'bell', 'green' as never)).toBeNull();
    const twelve = Array.from({ length: MAX_CUSTOM_TYPES }, (_, i) => ct(`c_aaaaaaaa${String(i).padStart(2, '0')}`, 'A', `نوع ${i}`, { icon: CUSTOM_ICON_IDS[i], color: 'cyan' }));
    expect(v('سیزدهم', twelve)).toMatch(/حداکثر/);
    expect(v('ویرایش', twelve.slice(1), false)).toBeNull();
  });
});

describe('مخزن: هر ساختمان جدا، حذف فقط بی‌استفاده، تغییر نام روی قبض‌های قبلی', () => {
  it('جداسازی ساختمان‌ها: نام تکراری در ساختمان دیگر مجاز؛ فهرست هر ساختمان فقط مال خودش', async () => {
    const b2 = await buildingRepository.create('دوم', false);
    const a = await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'آسانسور', icon: 'elevator', color: 'indigo' });
    const b = await billTypeRepository.add(b2, { name: 'آسانسور', icon: 'elevator', color: 'indigo' });
    expect(a.id).not.toBe(b.id);
    expect((await billTypeRepository.list(DEFAULT_BUILDING_ID)).map((t) => t.id)).toEqual([a.id]);
    expect((await billTypeRepository.list(b2)).map((t) => t.id)).toEqual([b.id]);
    await expect(billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'آسانسور ', icon: 'bell', color: 'green' })).rejects.toBeInstanceOf(BillTypeError);
    expect(customTypesOf(DEFAULT_BUILDING_ID).map((t) => t.id)).toEqual([a.id]);
    expect(withCustomTypes(DEFAULT_ENTRY_PREFS, customTypesOf(b2)).types).toEqual([...EXPENSE_TYPE_ORDER, b.id]);
  });

  it('سقف ۱۲ در مخزن هم اعمال می‌شود', async () => {
    for (let i = 0; i < MAX_CUSTOM_TYPES; i++) await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: `نوع ${i + 1}`, icon: CUSTOM_ICON_IDS[i], color: 'green' });
    await expect(billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'سیزدهم', icon: 'bell', color: 'rose' })).rejects.toThrow(/حداکثر/);
    expect((await billTypeRepository.list(DEFAULT_BUILDING_ID)).map((t) => t.sortOrder)).toEqual([...Array(12).keys()]);
  });

  it('حذف: با قبض (حتی حذف‌شده) ممنوع، فقط خاموش؛ بی‌استفاده حذف و از صندوق هم برداشته می‌شود', async () => {
    const used = await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'آسانسور', icon: 'elevator', color: 'indigo' });
    const free = await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'نگهبانی', icon: 'shield', color: 'green' });
    await billRepository.upsert(bill('x', used.id, { deletedAt: '2026-02-01T00:00:00.000Z' }), [unit('x')]);
    await billRepository.flush();
    expect(await billTypeRepository.usage(DEFAULT_BUILDING_ID, used.id)).toBe(1);
    await expect(billTypeRepository.remove(DEFAULT_BUILDING_ID, used.id)).rejects.toThrow(/خاموش/);
    await billTypeRepository.setHidden(used.id, true);
    expect(getCustomType(used.id)?.hidden).toBe(true);
    await buildingRepository.setFundTypes(['building', free.id]);
    await billTypeRepository.remove(DEFAULT_BUILDING_ID, free.id);
    expect(await billTypeRepository.list(DEFAULT_BUILDING_ID)).toHaveLength(1);
    expect(await buildingRepository.getFundTypes()).toEqual(['building']);
    expect(getCustomType(free.id)).toBeNull();
  });

  it('تغییر نام/رنگ روی قبض‌های قبلی هم دیده می‌شود (قبض فقط شناسه را دارد)', async () => {
    const t = await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'آسانسور', icon: 'elevator', color: 'indigo' });
    await billRepository.upsert(bill('x', t.id), [unit('x')]);
    await billTypeRepository.update(DEFAULT_BUILDING_ID, t.id, { name: 'آسانسور و پله', icon: 'key', color: 'rose' });
    const [x] = await billRepository.getAll();
    expect(x.bill.expenseType).toBe(t.id);
    expect(typeLabel(x.bill.expenseType)).toBe('آسانسور و پله');
    expect(buildBillImageModel(x).typeLabel).toBe('آسانسور و پله');
    expect(buildBillImageModel(x).typeColor).toBe('#E11D48');
  });

  it('حذف ساختمان (CASCADE) نوع‌هایش را هم پاک می‌کند', async () => {
    const b2 = await buildingRepository.create('دوم', false);
    await billTypeRepository.add(b2, { name: 'آسانسور', icon: 'elevator', color: 'indigo' });
    const n = await withSqlite((db) => {
      db.run('PRAGMA foreign_keys = ON');
      db.run('DELETE FROM buildings WHERE id = ?', [b2]);
      return Number(db.exec('SELECT COUNT(*) FROM bill_types')[0].values[0][0]);
    });
    expect(n).toBe(0);
  });
});

describe('فرم، فیلتر و دیده شدن', () => {
  it('کاشی‌ها: داخلی‌های فعال، بعد سفارشی‌های روشن؛ ۳ در هر ردیف', () => {
    setCustomTypeRegistry([ct('c_aaaaaaaa01', 'A', 'آسانسور'), ct('c_bbbbbbbb02', 'A', 'نگهبانی', { sortOrder: 1, icon: 'shield' }), ct('c_cccccccc03', 'A', 'خاموش', { sortOrder: 2, hidden: true, icon: 'bell' })]);
    const p = withCustomTypes({ ...DEFAULT_ENTRY_PREFS, types: EXPENSE_TYPE_ORDER.filter((t) => t !== 'beautification') }, customTypesOf('A'));
    const rows = tileRows(p);
    expect(rows.flat().slice(-2)).toEqual(['c_aaaaaaaa01', 'c_bbbbbbbb02']);
    expect(rows.every((r) => r.length <= 3)).toBe(true);
    expect(rows.flat()).not.toContain('c_cccccccc03');
    expect(typeFilterOptions(p).map((o) => o.label)).toContain('آسانسور');
    const bills = [bw(bill('1', 'c_aaaaaaaa01')), bw(bill('2', 'c_cccccccc03')), bw(bill('3', 'water'))];
    expect(visibleBills(bills, p).map((b) => b.bill.id)).toEqual(['1', '3']);
    expect(isTypeEnabled(p, 'c_cccccccc03')).toBe(false);
  });

  it('نحوهٔ تقسیم و صندوق نوع سفارشی را می‌پذیرند (بدون تغییر قانون محاسبه)', () => {
    expect(sanitizeSplitDefaults({ c_aaaaaaaa01: 'perArea', constructor: 'perUnit', __proto__: 'perUnit' })).toEqual({ c_aaaaaaaa01: 'perArea' });
    expect(sanitizeFundTypes(['c_aaaaaaaa01', 'water', 'building'])).toEqual(['water', 'building', 'c_aaaaaaaa01']);
    expect(sanitizeFundTypes(['constructor'])).toBeNull();
  });
});

describe('صندوق: نوع سفارشی بلافاصله قابل انتخاب است', () => {
  it('در فهرست صندوق می‌آید، انتخاب ذخیره می‌شود و پرداختش به صندوق می‌رود', async () => {
    const t = await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'آسانسور', icon: 'elevator', color: 'indigo' });
    const order = fundDisplayOrder(customTypesOf(DEFAULT_BUILDING_ID).map((c) => c.id));
    const enabled = withCustomTypes(DEFAULT_ENTRY_PREFS, customTypesOf(DEFAULT_BUILDING_ID)).types;
    expect(fundTypeRows(enabled, ['building'], order).slice(-1)[0]).toBe(t.id);
    await buildingRepository.setFundEnabled(true);
    await buildingRepository.setFundTypes(['building', t.id]);
    expect(await buildingRepository.getFundTypes()).toEqual(['building', t.id]);
    await billRepository.upsert(bill('x', t.id), [unit('x', [{ id: 'p1', amount: 4000, paidAt: '2026-02-01T00:00:00.000Z' }])]);
    await billRepository.flush();
    expect(await buildingRepository.getFundBalance()).toBe(4000);
    const [d] = (await buildingRepository.listFundEntries()).filter((e) => e.kind === 'deposit');
    expect(fundReasonFa(d.reason, d.kind, d.billExpenseType)).toBe('واریز از پرداخت قبض آسانسور');
  });
});

describe('گزارش‌ها و خروجی PDF/تصویر', () => {
  beforeEach(() => setCustomTypeRegistry([ct('c_aaaaaaaa01', 'A', 'آسانسور'), ct('c_bbbbbbbb02', 'A', 'نگهبانی', { sortOrder: 1, icon: 'shield' })]));
  const types = () => withCustomTypes(DEFAULT_ENTRY_PREFS, customTypesOf('A')).types;

  it('هزینه‌های سال: سفارشی‌ها با مبلغ برابر بعد از داخلی‌ها؛ بی‌هزینه‌ها در «بدون هزینه»', () => {
    const r = yearlyReport([bw(bill('1', 'c_aaaaaaaa01')), bw(bill('2', 'water')), bw(bill('3', 'gas', { totalAmount: 30_000 }))], 1405, types());
    expect(r.byType.slice(0, 3).map((t) => t.type)).toEqual(['gas', 'water', 'c_aaaaaaaa01']);
    expect(r.byType.filter((t) => t.total === 0).map((t) => t.type).slice(-1)[0]).toBe('c_bbbbbbbb02');
    const doc = yearlyDoc(r);
    const rows = doc.blocks.find((b) => b.k === 'rows') as { rows: { label: string }[] };
    expect(rows.rows.map((x) => x.label)).toContain('آسانسور');
  });

  it('جمع ماه، سهم نمودار و برچسب PDF به ترتیب نوع', () => {
    const all = [bw(bill('1', 'c_bbbbbbbb02')), bw(bill('2', 'c_aaaaaaaa01')), bw(bill('3', 'misc'))];
    const m = monthlyTotals(all, 1405, 7, types());
    expect(m.bills.map((b) => b.expenseType)).toEqual(['misc', 'c_aaaaaaaa01', 'c_bbbbbbbb02']);
    expect(typeShares(all, 1405, 1, 12, types()).shares.map((s) => s.type)).toEqual(['misc', 'c_aaaaaaaa01', 'c_bbbbbbbb02']);
    const detail = monthlyDetailDoc(m);
    expect(JSON.stringify(detail)).toContain('نگهبانی');
  });

  it('نماد اختصاصی در تصویر قبض/گزارش (نه نماد «متفرقه»)', () => {
    const custom = renderToStaticMarkup(createElement(GlyphSvg, { type: 'c_bbbbbbbb02', color: '#000' }));
    const misc = renderToStaticMarkup(createElement(GlyphSvg, { type: 'misc', color: '#000' }));
    expect(custom).not.toBe(misc);
    expect(custom).toContain('M12 2.8 4.5 5.6');
  });
});

describe('تنظیمات: ردیف‌ها و برگهٔ افزودن (۱۰-a/b)', () => {
  it('دامنهٔ ساختمان، نشان «سفارشی»، شمارنده و سقف', () => {
    const list = [ct('c_aaaaaaaa01', 'A', 'آسانسور')];
    setCustomTypeRegistry(list);
    const html = themed(createElement(CustomTypesRows, { types: list, buildingName: 'برج آفتاب', onAdd: () => undefined, onEdit: () => undefined, onToggle: () => undefined }));
    expect(html).toContain('نوع‌های سفارشی این ساختمان: <b>برج آفتاب</b>');
    expect(html).toContain('ct-badge');
    expect(html).toContain('۱ از ۱۲ نوع سفارشی');
    const sheet = themed(createElement(CustomTypeSheet, {
      draft: { id: null, name: 'آسانسور', icon: 'elevator', color: 'indigo' }, onChange: () => undefined, error: null, onSave: () => undefined, onCancel: () => undefined,
    }));
    expect(sheet).toContain('نوع قبض جدید');
    expect(sheet).toContain('۷/۲۰');
    expect(sheet).toContain('نحوهٔ تقسیم مثل بقیهٔ قبض‌ها');
    expect(sheet).not.toContain('حذف این نوع');
    const edit = (usage: number) => themed(createElement(CustomTypeSheet, {
      draft: { id: 'c_aaaaaaaa01', name: 'آسانسور', icon: 'elevator', color: 'indigo' }, onChange: () => undefined, error: null,
      onSave: () => undefined, onCancel: () => undefined, usage, onDelete: () => undefined,
    }));
    expect(edit(0)).toContain('حذف این نوع قبض');
    expect(edit(3)).not.toContain('حذف این نوع قبض');
    expect(edit(3)).toContain('خاموشش کنید');
  });
});

describe('پشتیبان قالب ۱۱', () => {
  async function seed() {
    const b2 = await buildingRepository.create('دوم', false);
    const a = await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'آسانسور', icon: 'elevator', color: 'indigo' });
    const h = await billTypeRepository.add(DEFAULT_BUILDING_ID, { name: 'نگهبانی', icon: 'shield', color: 'green' });
    await billTypeRepository.setHidden(h.id, true);
    const c = await billTypeRepository.add(b2, { name: 'استخر', icon: 'pool', color: 'cyan' });
    await buildingRepository.setFundTypes(['building', a.id]);
    await buildingRepository.setFundTypes([c.id], b2);
    await billRepository.upsertMany([
      { bill: bill('x1', a.id), units: [unit('x1')] },
      { bill: bill('x2', h.id, { deletedAt: '2026-02-01T00:00:00.000Z' }), units: [unit('x2')] },
      { bill: bill('x3', 'water'), units: [unit('x3')] },
    ]);
    await buildingRepository.setActiveId(b2);
    await billRepository.upsert(bill('y1', c.id), [unit('y1')]);
    await buildingRepository.setActiveId(DEFAULT_BUILDING_ID);
    await billRepository.flush();
    return { b2, a, h, c };
  }
  const dumpTypes = () => withSqlite((db) => db.exec('SELECT * FROM bill_types ORDER BY id')[0]?.values ?? []);
  const dumpBillTypes = () => withSqlite((db) => db.exec('SELECT id, building_id, expense_type FROM bills ORDER BY id')[0]?.values ?? []);

  it('خروجی همیشه تعریف همهٔ نوع‌های همهٔ ساختمان‌ها را دارد؛ رفت‌وبرگشت هرگز «متفرقه» نمی‌سازد', async () => {
    const { b2, a, h, c } = await seed();
    const text = await exportText();
    const json = JSON.parse(text);
    expect(json.backupVersion).toBe(11);
    expect(BACKUP_VERSION).toBe(11);
    const byId = Object.fromEntries(json.data.buildings.map((b: { id: string; billTypes: { id: string }[] }) => [b.id, b.billTypes.map((t) => t.id)]));
    expect(byId[DEFAULT_BUILDING_ID].sort()).toEqual([a.id, h.id].sort());
    expect(byId[b2]).toEqual([c.id]);
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.summary.remappedBills).toBe(0);
    expect(parsed.summary.customTypes).toBe(3);
    const types = await dumpTypes();
    const bills = await dumpBillTypes();
    await newPhone();
    await backupRepository.replaceAll(parsed.backup.data);
    expect(await dumpTypes()).toEqual(types);
    expect(await dumpBillTypes()).toEqual(bills);
    expect((await dumpBillTypes()).filter((r) => r[2] === 'misc')).toHaveLength(0);
    expect(getCustomType(h.id)?.hidden).toBe(true);
    expect(typeLabel(c.id)).toBe('استخر');
    expect(await buildingRepository.getFundTypes(b2)).toEqual([c.id]);
    expect(await buildingRepository.getFundTypes(DEFAULT_BUILDING_ID)).toEqual(['building', a.id]);
    // دور دوم: خروجیِ بازیابی‌شده = همان
    expect(JSON.parse(await exportText()).data.buildings).toEqual(json.data.buildings);
  });

  it('فقط فایل دستکاری‌شده: نوع ناشناخته یا نوعِ ساختمان دیگر رد نمی‌شود و «متفرقه» بازیابی می‌شود', async () => {
    const { b2, c } = await seed();
    const json = JSON.parse(await exportText());
    const x1 = json.data.bills.find((b: { id: string }) => b.id === 'x1');
    const x3 = json.data.bills.find((b: { id: string }) => b.id === 'x3');
    x1.expenseType = c.id; // سفارشیِ ساختمان دیگر
    x3.expenseType = 'c_unknown00000';
    const r = parseBackup(JSON.stringify(json));
    if (!r.ok) throw new Error(r.error);
    expect(r.summary.remappedBills).toBe(2);
    expect(r.backup.data.bills.find((b) => b.id === 'x1')?.expenseType).toBe('misc');
    expect(r.backup.data.bills.find((b) => b.id === 'x3')?.expenseType).toBe('misc');
    expect(r.backup.data.bills.find((b) => b.id === 'y1')?.expenseType).toBe(c.id);
    await newPhone();
    await backupRepository.replaceAll(r.backup.data);
    const rows = await dumpBillTypes();
    expect(rows.find((x) => x[0] === 'x1')?.[2]).toBe('misc');
    expect(rows.find((x) => x[0] === 'y1')).toEqual(['y1', b2, c.id]);
    // نوع ارثی همچنان رد می‌شود (امنیت)
    x3.expenseType = 'constructor';
    expect(parseBackup(JSON.stringify(json)).ok).toBe(false);
  });

  it('تعریف نوع خراب رد می‌شود (نام تکراری، سقف، شناسه/نماد/رنگ نامعتبر)', async () => {
    await seed();
    const base = JSON.parse(await exportText());
    const types = () => base.data.buildings.find((b: { id: string }) => b.id === DEFAULT_BUILDING_ID).billTypes;
    const cases: [string, (t: { id: string; name: string; icon: string; color: string }[]) => void][] = [
      ['dup name', (t) => { t[1].name = t[0].name; }],
      ['bad id', (t) => { t[0].id = 'constructor'; }],
      ['bad icon', (t) => { t[0].icon = 'rocket'; }],
      ['bad color', (t) => { t[0].color = '#ff0000'; }],
      ['short', (t) => { t[0].name = 'ا'; }],
      ['too many', (t) => { for (let i = 0; i < 12; i++) t.push({ ...t[0], id: `c_extra${String(i).padStart(5, '0')}`, name: `اضافه ${i}` }); }],
    ];
    for (const [name, mut] of cases) {
      const copy = JSON.parse(JSON.stringify(base));
      const saved = types();
      base.data.buildings.find((b: { id: string }) => b.id === DEFAULT_BUILDING_ID).billTypes = JSON.parse(JSON.stringify(saved));
      mut(copy.data.buildings.find((b: { id: string }) => b.id === DEFAULT_BUILDING_ID).billTypes);
      expect(parseBackup(JSON.stringify(copy)).ok, name).toBe(false);
    }
  });

  it('قالب‌های ۱ تا ۱۰ هنوز بازیابی می‌شوند (بی‌نوع سفارشی؛ شناسهٔ سفارشی در آن‌ها = «متفرقه»)', async () => {
    await seed();
    const json = JSON.parse(await exportText());
    json.backupVersion = 10;
    for (const b of json.data.buildings) delete b.billTypes;
    const r = parseBackup(JSON.stringify(json));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.data.bills.every((b) => isExpenseType(b.expenseType))).toBe(true);
    expect(r.summary.remappedBills).toBe(3);
    expect(r.backup.data.buildings?.every((b) => b.fundTypes.every((t) => isExpenseType(t)))).toBe(true);
    await newPhone();
    await backupRepository.replaceAll(r.backup.data);
    expect(await dumpTypes()).toEqual([]);
    // قالب قدیمی تک‌ساختمانی (۵)
    const old = { app: 'apartemant', backupVersion: 5, appVersion: '1.6.0', createdAt: '2026-01-01T00:00:00.000Z',
      data: { bills: [bill('o1', 'gas')], units: [unit('o1')], settings: {} } };
    const ro = parseBackup(JSON.stringify(old));
    expect(ro.ok && ro.summary.remappedBills).toBe(0);
  });
});
