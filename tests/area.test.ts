import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bill, BillDraft, BillWithUnits, Unit } from '../src/models/types';
import { AREA_SCALE, areaToInput, areaToMilli, formatArea, parseArea, sanitizeAreaInput, sumAreas, unitsMissingArea } from '../src/logic/area';
import { calculateBySplit, defaultSplitFor, isSplitMethod, sanitizeSplitDefaults, splitWeights } from '../src/logic/split';
import { buildBill, draftFromBill, emptyDraft, addDraftUnit, removeDraftUnit } from '../src/logic/billFactory';
import { buildingFromBills, buildingFromDraftUnits, draftMatchesBuilding, draftUnitsFromBuilding, sanitizeBuilding } from '../src/logic/building';
import { validateDraft } from '../src/logic/validation';
import { buildBillImageModel } from '../src/logic/billImage';
import { createBackup, parseBackup, serializeBackup, BACKUP_VERSION, type BackupData } from '../src/logic/backup';
import { AREA_MODES, DEFAULT_AREA_MODE, sanitizeAreaMode } from '../src/logic/areaMode';
import { debtorsReport } from '../src/logic/debts';

const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));
let mode: 'column' | 'line' = 'line';
vi.mock('../src/context/AreaModeContext', () => ({ useAreaMode: () => ({ areaMode: mode, setAreaMode: () => undefined }) }));
const { areaModeRepository } = await import('../src/storage/areaModeRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { UnitsEditor, liveShares } = await import('../src/components/UnitsEditor');
const { GlyphSvg } = await import('../src/components/ExpenseIcon');

describe('متراژ: تبدیل و اعتبارسنجی', () => {
  it('ورودی حین تایپ: ارقام فارسی، ممیز فارسی، یک نقطه و حداکثر ۳ رقم اعشار', () => {
    expect(sanitizeAreaInput('۷۵٫۵')).toBe('75.5');
    expect(sanitizeAreaInput('75,5')).toBe('75.5');
    expect(sanitizeAreaInput('7a5')).toBe('75');
    expect(sanitizeAreaInput('1.2.3')).toBe('1.23');
    expect(sanitizeAreaInput('12.34567')).toBe('12.345');
    expect(sanitizeAreaInput('.5')).toBe('0.5');
    expect(sanitizeAreaInput('007')).toBe('7');
    expect(sanitizeAreaInput('75.')).toBe('75.');
    expect(sanitizeAreaInput('1234567')).toBe('123456');
  });

  it('parseArea: فقط عدد مثبت تا ۳ رقم اعشار و حداکثر ۱۰۰٬۰۰۰', () => {
    expect(parseArea('75')).toBe(75);
    expect(parseArea('75.5')).toBe(75.5);
    expect(parseArea('۷۵٫۲۵')).toBe(75.25);
    expect(parseArea('75.')).toBe(75);
    expect(parseArea(0.001)).toBe(0.001);
    for (const bad of ['', '0', '0.0', 'abc', '-5', '100000.001', '1e3', null, undefined, NaN, 0, -1]) expect(parseArea(bad as never)).toBeNull();
    expect(parseArea(75.1234)).toBeNull(); // بیش از ۳ رقم اعشار در مقدار ذخیره‌شده
    expect(parseArea(100000)).toBe(100000);
  });

  it('مقیاس امن: ۷۵٫۵ ← ۷۵۵۰۰ بدون خطای اعشاری', () => {
    expect(AREA_SCALE).toBe(1000);
    expect(areaToMilli(75.5)).toBe(75500);
    expect(areaToMilli(0.1 + 0.2 > 0.3 ? 0.3 : 0.3)).toBe(300);
    expect(areaToMilli(1.005)).toBe(1005);
    expect(sumAreas([0.1, 0.2, 0.3])).toBe(0.6); // با جمع مستقیم اعشاری ۰٫۶۰۰۰۰۰۰۰۰۰۰۰۰۰۰۱ می‌شد
    expect(sumAreas([100, 50, 75, 75], [false, true, false, false])).toBe(250);
    expect(sumAreas(['100', '', 'x', '50.5'])).toBe(150.5);
  });

  it('نمایش و رشته ویرایشی', () => {
    expect(formatArea(75.5)).toBe('۷۵٫۵');
    expect(formatArea(100)).toBe('۱۰۰');
    expect(formatArea(1200)).toBe('۱٬۲۰۰');
    expect(formatArea(0.125)).toBe('۰٫۱۲۵');
    expect(areaToInput(75.5)).toBe('75.5');
    expect(areaToInput(null)).toBe('');
    expect(areaToInput(undefined)).toBe('');
  });

  it('unitsMissingArea: فقط واحدهای غیرخالیِ بدون متراژ معتبر', () => {
    expect(unitsMissingArea(['100', '', 'x', '5'], [false, false, false, true], 4)).toEqual([2, 3]);
    expect(unitsMissingArea(['100', '50'], undefined, 3)).toEqual([3]);
    expect(unitsMissingArea(['100', '50'], [false, false], 2)).toEqual([]);
  });
});

describe('تقسیم بر اساس متراژ: ریاضیات', () => {
  it('۱۰۰ و ۵۰ مترمربع ← ۲/۳ و ۱/۳ (۳٬۰۰۰٬۰۰۰ ← ۲٬۰۰۰٬۰۰۰ و ۱٬۰۰۰٬۰۰۰)', () => {
    const r = calculateBySplit(3_000_000, [1, 1], 'perArea', undefined, [100, 50]);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([2_000_000, 1_000_000]);
    expect(r.totalArea).toBe(150);
    expect(r.pricePerArea).toBe(20_000);
    expect(r.isExact).toBe(true);
    expect(r.splitMethod).toBe('perArea');
  });

  it('نمونه قبض گاز: ۱۰۰/۵۰/۷۵/۷۵ ← قیمت هر متر ۱۰٬۰۰۰ و سهم‌ها ۱٫۰٫۷۵٫۷۵ میلیون', () => {
    const r = calculateBySplit(3_000_000, [3, 2, 4, 2], 'perArea', undefined, [100, 50, 75, 75]);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([1_000_000, 500_000, 750_000, 750_000]);
    expect(r.pricePerArea).toBe(10_000);
    expect(r.shares.map((s) => s.personCount)).toEqual([3, 2, 4, 2]); // نفرات واقعی دست‌نخورده
    expect(r.shares.map((s) => s.area)).toEqual([100, 50, 75, 75]);
  });

  it('گرد کردن: جمع سهم‌ها همیشه دقیقاً برابر مبلغ کل است (بزرگ‌ترین باقیمانده، شماره کوچک‌تر مقدم)', () => {
    const r = calculateBySplit(1_000_000, [1, 1, 1], 'perArea', undefined, [100, 100, 100]);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([333_334, 333_333, 333_333]);
    expect(r.remainder).toBe(1);
    expect(r.isExact).toBe(false);
    // متراژ اعشاری
    const d = calculateBySplit(1_000_001, [1, 1, 1], 'perArea', undefined, [33.333, 66.667, 0.1]);
    expect(d.shares.reduce((s, x) => s + x.shareAmount, 0)).toBe(1_000_001);
    expect(d.totalArea).toBe(100.1);
  });

  it('ویژگی: برای هزاران ترکیب تصادفی جمع سهم‌ها دقیقاً مبلغ کل است و سهم‌ها متناسب‌اند', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let t = 0; t < 3000; t++) {
      const n = 1 + Math.floor(rnd() * 12);
      const areas = Array.from({ length: n }, () => Math.round((0.001 + rnd() * 400) * 1000) / 1000);
      const vacant = areas.map(() => rnd() < 0.2);
      if (vacant.every(Boolean)) vacant[0] = false;
      const total = 1 + Math.floor(rnd() * 9_000_000_000);
      const r = calculateBySplit(total, areas.map(() => 1), 'perArea', vacant, areas);
      expect(r.shares.reduce((s, x) => s + x.shareAmount, 0)).toBe(total);
      const sumMilli = areas.reduce((s, a, i) => s + (vacant[i] ? 0 : areaToMilli(a)), 0);
      r.shares.forEach((s, i) => {
        if (vacant[i]) { expect(s.shareAmount).toBe(0); return; }
        const exact = (total * areaToMilli(areas[i])) / sumMilli;
        expect(Math.abs(s.shareAmount - exact)).toBeLessThan(1 + 1e-6 * exact);
      });
    }
  });

  it('واحد خالی از محاسبه کنار گذاشته می‌شود (حتی با متراژ)', () => {
    const r = calculateBySplit(900_000, [1, 1, 1], 'perArea', [false, true, false], [100, 500, 200]);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([300_000, 0, 600_000]);
    expect(r.totalArea).toBe(300);
    expect(r.shares[1].area).toBeNull();
    expect(splitWeights([1, 1], 'perArea', [true, false], [10, 20])).toEqual([0, 20_000]);
  });

  it('متراژ نبود/نامعتبر یک واحد غیرخالی خطا می‌دهد؛ روش‌های دیگر دست‌نخورده‌اند', () => {
    expect(() => calculateBySplit(1000, [1, 1], 'perArea', undefined, [100, null])).toThrow();
    expect(() => calculateBySplit(1000, [1, 1], 'perArea', [false, true], [100, null])).not.toThrow();
    expect(calculateBySplit(1000, [1, 3], 'perPerson').shares.map((s) => s.shareAmount)).toEqual([250, 750]);
    expect(calculateBySplit(1000, [1, 3], 'perUnit').shares.map((s) => s.shareAmount)).toEqual([500, 500]);
  });

  it('روش‌ها: perArea معتبر است و در پیش‌فرض هر نوع هزینه به‌خاطر سپرده می‌شود', () => {
    expect(isSplitMethod('perArea')).toBe(true);
    expect(isSplitMethod('perVolume')).toBe(false);
    const d = sanitizeSplitDefaults({ gas: 'perArea', water: 'perUnit', phone: 'perArea', electricity: 'x' });
    expect(d).toEqual({ gas: 'perArea', water: 'perUnit' });
    expect(defaultSplitFor('gas', d)).toBe('perArea');
    expect(defaultSplitFor('building', d)).toBe('perPerson');
  });
});

describe('اعتبارسنجی فرم و سهم زنده (UI)', () => {
  const base: BillDraft = { ...emptyDraft(1405, 7), expenseType: 'gas', amountDigits: '3000000', personCounts: ['3', '2', '4', '2'], unitAliases: [null, null, null, null], unitVacant: [false, false, false, false], unitAreas: ['100', '50', '75', '75'], splitMethod: 'perArea' };

  it('معتبر: متراژها parse می‌شوند و نفرات خالی/صفر مانع نیست', () => {
    const r = validateDraft({ ...base, personCounts: ['', '0', 'x', '2'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.areas).toEqual([100, 50, 75, 75]);
  });

  it('متراژ واحد غیرخالی خالی/نامعتبر ← خطای مسدودکننده با شماره واحد', () => {
    const r = validateDraft({ ...base, unitAreas: ['100', '', '75', '75'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toEqual(['AREA_MISSING']);
    if (!r.ok) expect(r.errors[0].message).toContain('واحد ۲');
    const bad = validateDraft({ ...base, unitAreas: ['100', '50', '0', '75.1234'] });
    if (!bad.ok) expect(bad.errors.map((e) => e.code)).toEqual(['AREA_INVALID', 'AREA_INVALID']);
    else throw new Error('should fail');
    // واحد خالی نیازی به متراژ ندارد
    expect(validateDraft({ ...base, unitAreas: ['100', '', '75', '75'], unitVacant: [false, true, false, false] }).ok).toBe(true);
    // در روش‌های دیگر متراژ لازم نیست
    expect(validateDraft({ ...base, splitMethod: 'perPerson', unitAreas: ['', '', '', ''] }).ok).toBe(true);
    expect(validateDraft({ ...base, splitMethod: 'perUnit', unitAreas: ['', '', '', ''] }).ok).toBe(true);
  });

  it('همه واحدها خالی همچنان خطاست', () => {
    const r = validateDraft({ ...base, unitVacant: [true, true, true, true] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain('ALL_VACANT');
  });

  it('liveShares: سهم زنده فقط وقتی همه متراژها معتبر باشند', () => {
    expect(liveShares('3000000', base.personCounts, 'perArea', base.unitVacant, base.unitAreas)).toEqual([1_000_000, 500_000, 750_000, 750_000]);
    expect(liveShares('3000000', base.personCounts, 'perArea', base.unitVacant, ['100', '', '75', '75'])).toBeNull();
    expect(liveShares('3000000', ['1', '1'], 'perArea', [false, true], ['10', ''])).toEqual([3_000_000, 0]);
    expect(liveShares('', base.personCounts, 'perArea', base.unitVacant, base.unitAreas)).toBeNull();
  });

  it('افزودن/حذف واحد در فرم، متراژ را هم‌ردیف نگه می‌دارد', () => {
    const added = addDraftUnit(base, '1');
    expect(added.unitAreas).toEqual(['100', '50', '75', '75', '']);
    expect(removeDraftUnit(added, 1).unitAreas).toEqual(['100', '75', '75', '']);
  });

  const render = (m: 'column' | 'line', method: 'perPerson' | 'perArea') => {
    mode = m;
    return renderToStaticMarkup(createElement(UnitsEditor, {
      personCounts: base.personCounts, unitAliases: base.unitAliases, unitVacant: base.unitVacant, unitAreas: base.unitAreas,
      amountDigits: '3000000', splitMethod: method, onAdd: () => undefined, onRemoveLast: () => undefined, onChangeCount: () => undefined, onChangeVacant: () => undefined, onChangeArea: () => undefined,
    }));
  };

  it('فرم قبض: «ستون» ← ستون متراژ جای نفرات؛ «خط جدا» ← خط دوم برای هر واحد', () => {
    const col = render('column', 'perArea');
    expect(col).toContain('متراژ (م²)');
    expect(col).not.toContain('units-row__line2');
    expect(col).toContain('value="100"');
    const line = render('line', 'perArea');
    expect(line).toContain('units-row__line2');
    expect(line).toContain('مترمربع');
    expect(line).toContain('٪ از کل متراژ');
    expect(line).toContain('has-line');
    // سهم زنده
    expect(line).toContain('۱٬۰۰۰٬۰۰۰');
    // روش نفرات: هیچ‌کدام از اجزای متراژ دیده نمی‌شود
    const persons = render('line', 'perPerson');
    expect(persons).not.toContain('units-row__line2');
    expect(persons).toContain('تعداد نفرات');
  });
});

describe('عکس لحظه‌ای قبض و ساختمان', () => {
  const draft: BillDraft = { ...emptyDraft(1405, 7), expenseType: 'gas', amountDigits: '3000000', personCounts: ['3', '2', '4', '2'], unitAliases: ['آقای رضایی', null, null, null], unitVacant: [false, false, false, true], unitAreas: ['100', '50', '75.5', ''], splitMethod: 'perArea' };
  const make = () => {
    const v = validateDraft(draft);
    if (!v.ok) throw new Error('invalid');
    const calc = calculateBySplit(v.value.totalAmount, v.value.personCounts, draft.splitMethod, v.value.vacant, v.value.areas);
    return buildBill(draft, calc, null, new Date('2026-10-03T08:00:00Z'));
  };

  it('قبض، متراژ هر واحد (معتبر) و روش تقسیم را ذخیره می‌کند؛ ویرایش دوباره همان متراژها را می‌دهد', () => {
    const b = make();
    expect(b.bill.splitMethod).toBe('perArea');
    expect(b.units.map((u) => u.area)).toEqual([100, 50, 75.5, undefined]);
    expect(b.units.reduce((s, u) => s + u.shareAmount, 0)).toBe(3_000_000);
    expect(b.units[3].vacant).toBe(true);
    expect(b.units[3].shareAmount).toBe(0);
    const back = draftFromBill(b);
    expect(back.unitAreas).toEqual(['100', '50', '75.5', '']);
    expect(back.splitMethod).toBe('perArea');
  });

  it('تنظیمات ساختمان: متراژ نگهداری/پاکسازی می‌شود و پیش‌فرض فرم را پر می‌کند', () => {
    const b = sanitizeBuilding({ units: [{ alias: null, defaultPersons: 2, area: 80.25 }, { alias: 'x', defaultPersons: 1, area: -3 }, { alias: null, defaultPersons: 1 }, { alias: null, defaultPersons: 1, area: '55' }] });
    expect(b?.units.map((u) => u.area)).toEqual([80.25, undefined, undefined, 55]);
    const rows = draftUnitsFromBuilding(b!);
    expect(rows.unitAreas).toEqual(['80.25', '', '', '55']);
    expect(draftMatchesBuilding(rows.personCounts, rows.unitAliases, b!, rows.unitVacant, rows.unitAreas)).toBe(true);
    // تغییر فقط در متراژ هم «فرق با پیش‌فرض» حساب می‌شود
    expect(draftMatchesBuilding(rows.personCounts, rows.unitAliases, b!, rows.unitVacant, ['81', '', '', '55'])).toBe(false);
    expect(buildingFromDraftUnits(rows.personCounts, rows.unitAliases, rows.unitVacant, ['90', 'x', '', '5.5'])!.units.map((u) => u.area)).toEqual([90, undefined, undefined, 5.5]);
  });

  it('تغییر تنظیمات ساختمان روی قبض ثبت‌شده اثر ندارد (فقط قبض بعدی)', () => {
    const saved = make();
    const building = { units: [{ alias: null, defaultPersons: 3, area: 999 }] };
    expect(saved.units[0].area).toBe(100);
    expect(draftUnitsFromBuilding(building).unitAreas).toEqual(['999']);
    // ساخت ساختمان از جدیدترین قبض، متراژ آن را برمی‌دارد
    expect(buildingFromBills([saved]).units.map((u) => u.area)).toEqual([100, 50, 75.5, undefined]);
  });

  it('واحد خالی در بدهکاران نیست و سهم‌ها در گزارش بدهکاران می‌آید', () => {
    const r = debtorsReport([make()], new Date('2026-10-03T08:00:00Z'));
    expect(r.units.map((u) => u.unitNumber).sort()).toEqual([1, 2, 3]);
    expect(r.units.reduce((s, u) => s + u.total, 0)).toBe(3_000_000);
  });
});

describe('تصویر قبض', () => {
  const bill: Bill = { id: 'b', year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null, totalAmount: 3_000_000, createdAt: '2026-09-20T08:00:00.000Z', isFullySettled: false, splitMethod: 'perArea' };
  const mk = (n: number, personCount: number, area: number | undefined, share: number, vacant = false): Unit => ({ id: 'u' + n, billId: 'b', unitNumber: n, personCount, ...(area ? { area } : {}), ...(vacant ? { vacant: true } : {}), shareAmount: share, isSettled: false });
  const data: BillWithUnits = { bill, units: [mk(1, 3, 100, 1_000_000), mk(2, 2, 50, 500_000), mk(3, 4, 75, 750_000), mk(4, 2, 75, 750_000)] };

  it('ستون متراژ به‌جای نفرات و خط «قیمت هر مترمربع»', () => {
    const m = buildBillImageModel(data, new Date('2026-10-03T08:00:00Z'));
    expect(m.splitMethod).toBe('perArea');
    expect(m.splitLabel).toBe('بر اساس متراژ');
    expect(m.showArea).toBe(true);
    expect(m.showOccupants).toBe(false);
    expect(m.rows.map((r) => r.area)).toEqual(['۱۰۰', '۵۰', '۷۵', '۷۵']);
    expect(m.totalArea).toBe('۳۰۰');
    expect(m.perShareLine).toBe('قیمت هر مترمربع: ۱۰٬۰۰۰ تومان');
  });

  it('واحد خالی و متراژ اعشاری', () => {
    const d: BillWithUnits = { bill: { ...bill, totalAmount: 600_000 }, units: [mk(1, 1, 75.5, 300_000), mk(2, 1, 99, 0, true), mk(3, 1, 75.5, 300_000)] };
    const m = buildBillImageModel(d);
    expect(m.rows.map((r) => r.area)).toEqual(['۷۵٫۵', '—', '۷۵٫۵']);
    expect(m.totalArea).toBe('۱۵۱');
  });

  it('قبض‌های دیگر بدون ستون متراژ', () => {
    const m = buildBillImageModel({ bill: { ...bill, splitMethod: 'perPerson' }, units: data.units });
    expect(m.showArea).toBe(false);
    expect(m.showOccupants).toBe(true);
  });
});

describe('پشتیبان قالب ۷: متراژ', () => {
  const sample = (): BackupData => ({
    bills: [{ id: 'b', year: 1405, month: 7, expenseType: 'gas', billNumber: null, description: null, totalAmount: 3_000_000, createdAt: '2026-09-20T08:00:00.000Z', isFullySettled: false, splitMethod: 'perArea', billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null }],
    units: [
      { id: 'u1', billId: 'b', unitNumber: 1, personCount: 3, area: 100, shareAmount: 2_000_000, isSettled: false },
      { id: 'u2', billId: 'b', unitNumber: 2, personCount: 2, area: 50, shareAmount: 1_000_000, isSettled: false },
      { id: 'u3', billId: 'b', unitNumber: 3, personCount: 2, vacant: true, shareAmount: 0, isSettled: true },
    ],
    settings: { showSaveWarning: false, activeYears: [1405], dismissedWarnings: [] },
    building: { units: [{ alias: null, defaultPersons: 3, area: 100 }, { alias: null, defaultPersons: 2, area: 50.5 }, { alias: null, defaultPersons: 2, vacant: true }] },
    splitDefaults: { gas: 'perArea' },
  });
  const make = (mut?: (o: any) => void) => { const o = JSON.parse(serializeBackup(createBackup(sample(), '1.6.5', new Date()))); mut?.(o); return JSON.stringify(o); };

  it('نسخه ۷ و رفت‌وبرگشت کامل (متراژ قبض و ساختمان و روش تقسیم)', () => {
    expect(BACKUP_VERSION).toBe(7);
    const r = parseBackup(make());
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.backupVersion).toBe(7);
    expect(r.backup.data.units.map((u) => u.area)).toEqual([100, 50, undefined]);
    expect(r.backup.data.bills[0].splitMethod).toBe('perArea');
    expect(r.backup.data.building!.units.map((u) => u.area)).toEqual([100, 50.5, undefined]);
    expect(r.backup.data.splitDefaults).toEqual({ gas: 'perArea' });
  });

  it('مهاجرت: فایل قالب ۶ (بدون متراژ) بازیابی می‌شود و همه متراژها خالی‌اند', () => {
    const r = parseBackup(make((o) => {
      o.backupVersion = 6;
      o.data.bills[0].splitMethod = 'perUnit';
      o.data.units[0].shareAmount = 1_500_000; o.data.units[1].shareAmount = 1_500_000;
      delete o.data.splitDefaults;
      for (const u of o.data.units) delete u.area;
      for (const u of o.data.building.units) delete u.area;
    }));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.data.units.every((u) => u.area === undefined)).toBe(true);
    expect(r.backup.data.building!.units.every((u) => u.area === undefined)).toBe(true);
    // تنظیمات ساختمان ساخته‌شده از قبض‌های قدیمی هم بدون متراژ است
    const noBuilding = parseBackup(make((o) => { o.backupVersion = 5; delete o.data.building; for (const u of o.data.units) delete u.area; o.data.bills[0].splitMethod = 'perPerson'; o.data.units[0].shareAmount = 1_500_000; o.data.units[1].shareAmount = 1_500_000; }));
    if (!noBuilding.ok) throw new Error(noBuilding.error);
    expect(noBuilding.backup.data.building!.units.map((u) => u.area)).toEqual([undefined, undefined, undefined]);
  });

  it('رد: متراژ نامعتبر، قبض «بر اساس متراژ» بدون متراژ، قالب جدیدتر', () => {
    expect(parseBackup(make((o) => { o.data.units[0].area = -5; })).ok).toBe(false);
    expect(parseBackup(make((o) => { o.data.units[0].area = 'abc'; })).ok).toBe(false);
    expect(parseBackup(make((o) => { o.data.units[0].area = 12.34567; })).ok).toBe(false);
    const missing = parseBackup(make((o) => { delete o.data.units[1].area; }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain('متراژ');
    // واحد خالی بدون متراژ مشکلی ندارد (u3 همین‌طور است)
    expect(parseBackup(make((o) => { o.backupVersion = 8; })).ok).toBe(false);
    // متراژ نامعتبر ساختمان نادیده گرفته می‌شود (فقط آن مقدار)
    const b = parseBackup(make((o) => { o.data.building.units[0].area = -1; }));
    if (!b.ok) throw new Error(b.error);
    expect(b.backup.data.building!.units[0].area).toBeUndefined();
  });

  it('«نحوه نمایش متراژ» داخل پشتیبان نیست و در کلید جداگانه ذخیره می‌شود', async () => {
    mem.clear();
    await areaModeRepository.save('column');
    expect(mem.get('areaMode')).toBe('"column"');
    expect(JSON.stringify(await backupRepository.collect())).not.toContain('areaMode');
    expect(serializeBackup(createBackup(sample(), '1.6.5'))).not.toContain('areaMode');
  });
});

describe('نحوه نمایش متراژ', () => {
  beforeEach(() => mem.clear());
  it('پیش‌فرض «خط جدا زیر هر واحد»؛ دو گزینه؛ ذخیره و خواندن', async () => {
    expect(DEFAULT_AREA_MODE).toBe('line');
    expect(AREA_MODES.map((m) => [m.id, m.label])).toEqual([['column', 'ستون کنار نفرات'], ['line', 'خط جدا زیر هر واحد']]);
    expect(sanitizeAreaMode('column')).toBe('column');
    expect(sanitizeAreaMode('x')).toBeNull();
    expect(await areaModeRepository.get()).toBe('line');
    await areaModeRepository.save('column');
    expect(await areaModeRepository.get()).toBe('column');
    mem.set('areaMode', '"garbage"');
    expect(await areaModeRepository.get()).toBe('line');
  });
});

describe('آیکون تصویر قبض', () => {
  it('آیکون نوع هزینه بدون ThemeProvider هم رسم می‌شود (ریشه جدا هنگام ساخت تصویر)', () => {
    for (const t of ['water', 'electricity', 'gas', 'building', 'misc', 'cleaning', 'repairs', 'beautification'] as const) {
      const html = renderToStaticMarkup(createElement(GlyphSvg, { type: t, size: 64, color: '#0F766E' }));
      expect(html.startsWith('<svg')).toBe(true);
      expect(html).toContain('#0F766E');
    }
  });
});
