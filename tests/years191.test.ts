/**
 * ۱.۹.۱ — سال‌های خودکار: سال جاری همیشه هست، فقط سال بعد اضافه می‌شود، فقط پنهان/نمایش،
 * بدون بستن سال و بدون سال پیش‌فرض؛ مهاجرت از ۱.۹.۰ (پاک شدن زمان بستن، پاک شدن سال‌های خالی قدیمی).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests, withSqlite, withSqliteWrite } from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { backupRepository } from '../src/storage/backupRepository';
import { periodsRepository, PeriodRuleError } from '../src/storage/periodsRepository';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import { createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import {
  canHideYear, defaultBillYear, mergeBuildingYears, nextAddableYear, selectableBillYears, staleYearRows, visibleYears, yearRangeLines,
} from '../src/logic/periods';
import { todayJalali } from '../src/logic/jalali';
import { HELP_TOPICS } from '../src/content/help';
import type { Bill, BillWithUnits, Unit } from '../src/models/types';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;
beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

const Y = (year: number, hidden = false) => ({ year, closedAt: null, hidden });
const CUR = todayJalali().year;

function bill(id: string, extra: Partial<Bill> = {}): BillWithUnits {
  const b: Bill = {
    id, year: CUR, month: 3, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000,
    createdAt: new Date().toISOString(), isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
  };
  const u: Unit = { id: `${id}-u1`, billId: id, unitNumber: 1, personCount: 1, shareAmount: b.totalAmount, isSettled: false, payments: [] };
  return { bill: b, units: [u] };
}
async function setup() {
  await buildingRepository.save({ units: [{ alias: null, defaultPersons: 1 }, { alias: null, defaultPersons: 1 }] });
}

describe('منطق خالص سال‌ها', () => {
  it('فهرست: سال‌های دارای قبض ∪ ذخیره‌شده ∪ سال جاری، از اولین سالِ دارای قبض؛ بدون سال خالی قدیمی', () => {
    // ردیف‌های قدیمی ۱۳۹۳ تا ۱۴۰۷ (باگ پنجرهٔ قدیمی «افزودن سال») بدون قبض
    const rows = Array.from({ length: 15 }, (_, i) => Y(1393 + i));
    expect(mergeBuildingYears(rows, [], 1405).map((y) => y.year)).toEqual([1406, 1405]);
    expect(mergeBuildingYears(rows, [1403, 1405], 1405).map((y) => y.year)).toEqual([1406, 1405, 1404, 1403]);
    expect(mergeBuildingYears([], [1401], 1405).map((y) => y.year)).toEqual([1405, 1401]);
    expect(mergeBuildingYears([], [], 1405)).toEqual([Y(1405)]);
  });
  it('سال جاری و بعد از آن هیچ‌وقت پنهان نیستند', () => {
    const m = mergeBuildingYears([Y(1404, true), Y(1405, true), Y(1406, true)], [1404], 1405);
    expect(m).toEqual([Y(1406), Y(1405), Y(1404, true)]);
    expect(canHideYear(1404, 1405)).toBe(true);
    expect(canHideYear(1405, 1405)).toBe(false);
    expect(canHideYear(1406, 1405)).toBe(false);
  });
  it('فقط «سال بعد» اضافه می‌شود و وقتی هست دکمه نیست', () => {
    expect(nextAddableYear([Y(1405)], 1405)).toBe(1406);
    expect(nextAddableYear([Y(1406), Y(1405)], 1405)).toBeNull();
  });
  it('فیلترها سال پنهان را ندارند؛ فرم قبض دارد؛ قبض تازه سال جاری را می‌گیرد', () => {
    const ys = [Y(1405), Y(1404, true), Y(1403)];
    expect(visibleYears(ys)).toEqual([1403, 1405]);
    expect(selectableBillYears(ys)).toEqual([1403, 1404, 1405]);
    expect(defaultBillYear(1405)).toBe(1405);
  });
  it('پاک‌سازی: سال خالیِ قبل از سال جاری یا دورتر از سال بعد', () => {
    expect(staleYearRows([Y(1393), Y(1403), Y(1405), Y(1406), Y(1407)], new Set([1403]), 1405)).toEqual([1393, 1407]);
  });
  it('تاریخ شروع و پایان با رقم فارسی (۳۰ اسفند در سال کبیسه)', () => {
    expect(yearRangeLines(1406)).toEqual({ start: 'تاریخ شروع: ۱۴۰۶/۰۱/۰۱', end: 'تاریخ پایان: ۱۴۰۶/۱۲/۲۹' });
    expect(yearRangeLines(1408).end).toBe('تاریخ پایان: ۱۴۰۸/۱۲/۳۰');
  });
});

describe('مخزن سال‌ها', () => {
  it('نصب تازه: فقط سال جاری، پنهان نمی‌شود؛ «افزودن سال» فقط سال بعد', async () => {
    await setup();
    let s = await periodsRepository.getState();
    expect(s.currentYear).toBe(CUR);
    expect(s.years.map((y) => [y.year, y.isCurrent, y.canHide])).toEqual([[CUR, true, false]]);
    expect(await periodsRepository.addNextYear()).toBe(CUR + 1);
    await periodsRepository.addNextYear(); // دوباره زدن تکراری نمی‌سازد
    s = await periodsRepository.getState();
    expect(s.years.map((y) => y.year)).toEqual([CUR + 1, CUR]);
    await expect(periodsRepository.setYearHidden(CUR, true)).rejects.toThrow(PeriodRuleError);
    await expect(periodsRepository.setYearHidden(CUR + 1, true)).rejects.toThrow(PeriodRuleError);
    expect(await periodsRepository.defaultYearForNewBill()).toBe(CUR);
  });

  it('سال گذشته پنهان/نمایان می‌شود و از فیلترها می‌رود و برمی‌گردد؛ قفل نمی‌شود', async () => {
    await setup();
    const a = bill('a', { year: CUR - 1 });
    await billRepository.upsert(a.bill, a.units);
    expect(await periodsRepository.filterYears()).toEqual([CUR - 1, CUR]);
    await periodsRepository.setYearHidden(CUR - 1, true);
    expect(await periodsRepository.filterYears()).toEqual([CUR]);
    expect((await periodsRepository.getState()).years.find((y) => y.year === CUR - 1)).toMatchObject({ hidden: true, billCount: 1, canHide: true });
    expect((await periodsRepository.billLock('a')).locked).toBe(false);
    expect((await periodsRepository.lockedIds()).size).toBe(0);
    await periodsRepository.setYearHidden(CUR - 1, false);
    expect(await periodsRepository.filterYears()).toEqual([CUR - 1, CUR]);
  });

  it('مهاجرت از ۱.۹.۰: زمان بستن پاک، پنهان می‌ماند، سال‌های خالی قدیمی و دور حذف، قفل فقط از دوره', async () => {
    await setup();
    const a = bill('a', { year: CUR - 2 });
    await billRepository.upsert(a.bill, a.units);
    await billRepository.flush();
    await periodsRepository.getState();
    // وضعیت ۱.۹.۰: سال بسته+پنهان، سال بسته، سال‌های خالی ۱۳۹۳.. و +۲
    await withSqliteWrite((db) => {
      db.run('DELETE FROM building_years');
      const ins = (y: number, closed: string | null, hidden: number) =>
        db.run('INSERT INTO building_years(building_id, year, closed_at, hidden) VALUES (?,?,?,?)', [DEFAULT_BUILDING_ID, y, closed, hidden]);
      ins(CUR - 12, null, 0);
      ins(CUR - 2, '2025-03-25T08:00:00Z', 1);
      ins(CUR - 1, '2026-03-25T08:00:00Z', 0);
      ins(CUR, null, 0);
      ins(CUR + 2, null, 0);
    });
    const s = await periodsRepository.getState();
    expect(s.years.map((y) => [y.year, y.hidden])).toEqual([[CUR, false], [CUR - 2, true]]);
    expect(s.years.every((y) => y.closedAt === null)).toBe(true);
    const rows = await withSqlite((db) => db.exec('SELECT year, closed_at, hidden FROM building_years ORDER BY year')[0].values);
    expect(rows).toEqual([[CUR - 2, null, 1], [CUR, null, 0]]);
    expect((await periodsRepository.billLock('a')).locked).toBe(false);
  });

  it('پشتیبان ۱.۹.۰ (قالب ۱۲ با سال بسته و سال پیش‌فرض) بازیابی می‌شود: پنهان می‌ماند، بستن و پیش‌فرض نادیده', async () => {
    await setup();
    const a = bill('a', { year: CUR - 1 });
    await billRepository.upsert(a.bill, a.units);
    await billRepository.flush();
    const json = JSON.parse(serializeBackup(createBackup(await backupRepository.collect(), '1.9.0', new Date())));
    expect(json.backupVersion).toBe(12);
    const b = json.data.buildings[0];
    b.defaultYear = CUR - 1;
    b.years = [{ year: CUR - 1, closedAt: '2026-03-25T08:00:00.000Z', hidden: true }, { year: CUR - 9, closedAt: null, hidden: false }];
    await resetSqliteForTests(); billRepository._resetCache();
    const r = parseBackup(JSON.stringify(json));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const s = await periodsRepository.getState();
    expect(s.years.map((y) => [y.year, y.hidden])).toEqual([[CUR, false], [CUR - 1, true]]);
    expect((await periodsRepository.billLock('a')).locked).toBe(false);
    const again = JSON.parse(serializeBackup(createBackup(await backupRepository.collect(), '1.9.1', new Date())));
    expect(again.data.buildings[0].defaultYear).toBeNull();
    expect(again.data.buildings[0].years.every((y: { closedAt: unknown }) => y.closedAt === null)).toBe(true);
  });
});

describe('راهنما: سال‌ها', () => {
  const all = JSON.stringify(HELP_TOPICS);
  it('چیزی از بستن سال یا سال پیش‌فرض نمانده و سال‌های خودکار توضیح داده شده', () => {
    expect(all).not.toMatch(/بستن سال|سال بسته|سال پیش‌فرض|برداشتن از فهرست|نمایش سال‌های پنهان/);
    expect(all).not.toContain(['دوره', 'مالی'].join(' '));
    expect(all).toMatch(/سال‌های پنهان/);
    expect(all).toMatch(/افزودن سال/);
    expect(all).toMatch(/همیشه نمایان/);
  });
});
