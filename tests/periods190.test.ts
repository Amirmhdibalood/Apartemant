/**
 * ۱.۹.۰ — سال‌ها و دوره‌های مدیریت: تاریخ شروع/پایان سال، بستن خودکار دورهٔ قبلی، قفل قبض،
 * مهاجرت (schema 8)، پشتیبان قالب ۱۲ و سازگاری با قالب‌های قدیمی، و جمع‌های فیلتر چندتایی.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { exportCurrentBytes, openDetachedDatabase, replaceDatabaseWithBytes, resetSqliteForTests, withSqlite } from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { backupRepository } from '../src/storage/backupRepository';
import { periodsRepository, PeriodRuleError, todayKeyNow } from '../src/storage/periodsRepository';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import { BACKUP_VERSION, createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import {
  billLockState, dayBefore, isPeriodClosed, managerDisplayName, planNewPeriod, yearEndKey,
  yearRangeLines, yearStartKey, type MgmtPeriod,
} from '../src/logic/periods';
import { newBillBlockers } from '../src/logic/billGate';
import { filterBillsMulti, monthsHeading, multiSummary, normalizeStatuses } from '../src/logic/multiFilter';
import { monthlyTotals } from '../src/logic/monthlyTotals';
import { billPaymentReport } from '../src/logic/billPaymentReport';
import { addJalaliDays, parseJalaliKey, formatJalaliKey, todayJalali } from '../src/logic/jalali';
import { makeBills } from './helpers/scenario';
import type { Bill, BillWithUnits, Unit } from '../src/models/types';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;
beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

const today = () => todayKeyNow();
const shift = (days: number) => formatJalaliKey(addJalaliDays(parseJalaliKey(today())!, days));
const P = (x: Partial<MgmtPeriod> & Pick<MgmtPeriod, 'id' | 'startDate'>): MgmtPeriod => ({
  buildingId: 'b', managerLabel: '', managerUnit: 1, endDate: '', endedEarlyAt: null, notes: null, hidden: false, ...x,
});

function bill(id: string, extra: Partial<Bill> = {}): BillWithUnits {
  const b: Bill = {
    id, year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null, totalAmount: 1000,
    createdAt: new Date().toISOString(), isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
  };
  const u: Unit = { id: `${id}-u1`, billId: id, unitNumber: 1, personCount: 1, shareAmount: b.totalAmount, isSettled: false, payments: [] };
  return { bill: b, units: [u] };
}

async function setupBuilding() {
  await buildingRepository.save({ units: [{ alias: 'الف', defaultPersons: 1 }, { alias: null, defaultPersons: 2 }, { alias: null, defaultPersons: 1 }] });
}

describe('سال: شروع ۱ فروردین، پایان آخرین روز اسفند (ثابت)', () => {
  it('۲۹ اسفند در سال عادی و ۳۰ اسفند در سال کبیسه', () => {
    expect(yearStartKey(1405)).toBe('1405-01-01');
    expect(yearEndKey(1405)).toBe('1405-12-29');
    expect(yearEndKey(1403)).toBe('1403-12-30');
    expect(yearRangeLines(1405)).toEqual({ start: 'تاریخ شروع: ۱۴۰۵/۰۱/۰۱', end: 'تاریخ پایان: ۱۴۰۵/۱۲/۲۹' });
    expect(yearRangeLines(1403).end).toBe('تاریخ پایان: ۱۴۰۳/۱۲/۳۰');
  });
});

describe('مدیریت ساختمان: ثبت مدیر جدید دورهٔ قبلی را روز قبل می‌بندد', () => {
  it('دورهٔ باز قبلی ← پایان = روز قبل از شروع جدید', () => {
    const plan = planNewPeriod([P({ id: 'a', startDate: '1404-01-01' })], { startDate: '1405-08-01', endDate: null, managerUnit: 2 }, '1405-08-12');
    expect(plan).toEqual({ ok: true, closes: [{ id: 'a', name: 'واحد ۱', endDate: '1405-07-30' }] });
    expect(dayBefore('1405-01-01')).toBe('1404-12-29');
  });
  it('بدون واحد، هم‌پوشانی با دورهٔ بسته، یا شروع قبل از دورهٔ باز = خطا', () => {
    expect(planNewPeriod([], { startDate: '1405-01-01', endDate: null, managerUnit: null }, '1405-08-12').ok).toBe(false);
    const closed = P({ id: 'c', startDate: '1404-01-01', endDate: '1405-06-31', endedEarlyAt: '2026-09-01T00:00:00Z' });
    expect(planNewPeriod([closed], { startDate: '1405-03-01', endDate: null, managerUnit: 1 }, '1405-08-12').ok).toBe(false);
    expect(planNewPeriod([P({ id: 'o', startDate: '1405-05-01' })], { startDate: '1405-04-01', endDate: null, managerUnit: 1 }, '1405-08-12').ok).toBe(false);
  });
  it('نام نمایشی: نام مستعار، وگرنه «واحد N»', () => {
    expect(managerDisplayName({ managerLabel: 'آقای رضایی', managerUnit: 3 })).toBe('آقای رضایی');
    expect(managerDisplayName({ managerLabel: '  ', managerUnit: 3 })).toBe('واحد ۳');
  });
  it('دورهٔ پایان‌یافته بسته است (دکمهٔ «بستن دوره» برایش نیست)', () => {
    expect(isPeriodClosed(P({ id: 'x', startDate: '1403-01-01', endDate: '1403-12-30' }), '1405-08-12')).toBe(true);
    expect(isPeriodClosed(P({ id: 'y', startDate: '1405-01-01' }), '1405-08-12')).toBe(false);
  });
  it('دروازهٔ ثبت قبض: فقط کلید مدیر روشن بدون مدیر فعال (سال همیشه خودکار هست)', () => {
    const e = newBillBlockers({ mgmtEnabled: true, periods: [], todayKey: '1405-08-12' });
    expect(e).toHaveLength(1);
    expect(e[0].message).toContain('در حال حاضر مدیر فعالی ثبت نشده است');
    expect(newBillBlockers({ mgmtEnabled: false, periods: [], todayKey: '1405-08-12' })).toEqual([]);
    for (const x of e) expect(x.message).not.toMatch(new RegExp([['دوره', 'مالی'].join(' '), 'سال مالی'].join('|')));
  });
});

describe('قفل قبض: فقط دورهٔ مدیریت بسته (۱.۹.۱: سال قفل نمی‌کند)', () => {
  it('billLockState', () => {
    const closedP = P({ id: 'p0', startDate: '1400-01-01', endDate: '1400-12-29' });
    const openP = P({ id: 'p1', startDate: '1405-01-01' });
    const ctx = { periods: [closedP, openP], todayKey: '1405-08-12' };
    expect(billLockState({ year: 1403, mgmtPeriodId: null }, ctx)).toMatchObject({ locked: false, reason: null });
    expect(billLockState({ year: 1405, mgmtPeriodId: 'p0' }, ctx)).toMatchObject({ locked: true, reason: 'manager' });
    expect(billLockState({ year: 1405, mgmtPeriodId: 'p1' }, ctx).locked).toBe(false);
    expect(billLockState({ year: 1405, mgmtPeriodId: null }, ctx).locked).toBe(false);
  });

  it('مخزن: قبض تازه خودکار به مدیر فعال وصل می‌شود؛ بستن دوره قفل می‌کند', async () => {
    await setupBuilding();
    await periodsRepository.setMgmtEnabled(true);
    const pid = await periodsRepository.addManager({ managerUnit: 1, alias: '', startDate: shift(-30), endDate: null });
    const a = bill('a');
    await billRepository.upsert(a.bill, a.units);
    expect(await withSqlite((db) => db.exec("SELECT mgmt_period_id FROM bills WHERE id='a'")[0].values[0][0])).toBe(pid);
    expect((await periodsRepository.billLock('a')).locked).toBe(false);
    // ویرایش (upsert دوباره بدون mgmtPeriodId) وصل بودن را نگه می‌دارد
    await billRepository.upsert({ ...a.bill, description: 'x' }, a.units);
    expect((await periodsRepository.getState()).periodBillCounts.get(pid)).toBe(1);

    // مدیر جدید از فردا → دورهٔ قبلی تا امروز؛ بعد بستن دوره → قفل
    const plan = await periodsRepository.planNewManager({ managerUnit: 2, startDate: shift(1), endDate: null });
    expect(plan.ok && plan.closes.map((c) => c.endDate)).toEqual([today()]);
    await periodsRepository.addManager({ managerUnit: 2, alias: 'خانم احمدی', startDate: shift(1), endDate: null });
    await periodsRepository.closeManager(pid);
    expect(await periodsRepository.billLock('a')).toMatchObject({ locked: true, reason: 'manager' });
    expect([...(await periodsRepository.lockedIds())]).toEqual(['a']);
    // دورهٔ بسته دوباره باز نمی‌شود و ویرایشش ممکن نیست
    await expect(periodsRepository.editManager(pid, { managerUnit: 1, alias: '', endDate: null })).rejects.toThrow(PeriodRuleError);
  });

  it('کلید مدیر خاموش: قبض بدون دوره و بی‌قفل؛ سالِ گذشته پنهان می‌شود ولی قفل نمی‌شود', async () => {
    await setupBuilding();
    expect((await periodsRepository.getState()).mgmtEnabled).toBe(false); // نصب تازه
    const b = bill('b', { year: 1404 });
    await billRepository.upsert(b.bill, b.units);
    expect(await withSqlite((db) => db.exec("SELECT mgmt_period_id FROM bills WHERE id='b'")[0].values[0][0])).toBeNull();
    await periodsRepository.setYearHidden(1404, true);
    expect((await periodsRepository.billLock('b')).locked).toBe(false);
    const s = await periodsRepository.getState();
    expect(s.years.find((y) => y.year === 1404)).toMatchObject({ hidden: true, billCount: 1 });
    await expect(periodsRepository.setYearHidden(1405, true)).rejects.toThrow(PeriodRuleError); // سال جاری همیشه نمایان
  });
});

describe('مهاجرت به schema 8 (کاربر قدیمی)', () => {
  it('کلید مدیر روشن، قبض‌های قدیمی بر اساس زمان ثبت به دوره وصل؛ بی‌دوره = بی‌قفل', async () => {
    await setupBuilding();
    // دو دوره: ۱۴۰۳ (پایان‌یافته) و از ۱۴۰۵/۰۱/۰۱ (باز)
    await buildingRepository.addManagementPeriod({ managerLabel: 'آقای قدیمی', startDate: '1403-01-01', endDate: '1403-12-30', notes: null, endPreviousEarly: false });
    await buildingRepository.addManagementPeriod({ managerLabel: 'خانم تازه', startDate: '1405-01-01', endDate: '1405-12-29', notes: null, endPreviousEarly: false });
    const items = [
      bill('old', { year: 1403, createdAt: '2024-09-01T08:00:00.000Z' }), // ۱۴۰۳/۰۶/۱۱
      bill('gap', { year: 1404, createdAt: '2025-09-01T08:00:00.000Z' }), // ۱۴۰۴ (بدون دوره)
      bill('now', { year: 1405, createdAt: new Date().toISOString() }),
    ];
    await billRepository.upsertMany(items.map((x) => ({ ...x, bill: { ...x.bill, mgmtPeriodId: null } })));
    await billRepository.flush();
    // ساخت تصویر قالب ۷ (قبل از ۱.۹): ستون‌ها/جدول تازه برداشته می‌شوند
    const d = await openDetachedDatabase(await exportCurrentBytes());
    d.run('DROP INDEX IF EXISTS idx_bills_mgmt');
    d.run('ALTER TABLE bills DROP COLUMN mgmt_period_id');
    d.run('ALTER TABLE buildings DROP COLUMN mgmt_enabled');
    d.run('ALTER TABLE buildings DROP COLUMN default_year');
    d.run('ALTER TABLE management_periods DROP COLUMN manager_unit');
    d.run('ALTER TABLE management_periods DROP COLUMN hidden');
    d.run('DROP TABLE building_years');
    const v7 = d.export();
    d.close();
    await replaceDatabaseWithBytes(v7);
    billRepository._resetCache();

    const s = await periodsRepository.getState();
    expect(s.mgmtEnabled).toBe(true);
    const ids = await withSqlite((db) => Object.fromEntries(db.exec('SELECT id, mgmt_period_id FROM bills')[0].values.map((r) => [r[0], r[1]])));
    const byName = Object.fromEntries(s.periods.map((p) => [p.managerLabel, p.id]));
    expect(ids).toEqual({ old: byName['آقای قدیمی'], gap: null, now: byName['خانم تازه'] });
    expect(s.periods.every((p) => p.managerUnit === null)).toBe(true); // نام قدیمی ← نام مستعار
    expect((await periodsRepository.billLock('old')).locked).toBe(true); // دورهٔ ۱۴۰۳ تمام شده
    expect((await periodsRepository.billLock('gap')).locked).toBe(false);
    expect((await periodsRepository.billLock('now')).locked).toBe(false);
  });
});

describe('پشتیبان قالب ۱۲', () => {
  async function exportText() {
    return serializeBackup(createBackup(await backupRepository.collect(), '1.9.0', new Date('2026-11-03T08:00:00Z')));
  }
  it('رفت‌وبرگشت: سال‌های پنهان، کلید مدیر، واحد مدیر و دورهٔ هر قبض', async () => {
    expect(BACKUP_VERSION).toBe(12);
    await setupBuilding();
    await periodsRepository.setMgmtEnabled(true);
    const pid = await periodsRepository.addManager({ managerUnit: 3, alias: 'آقای رضایی', startDate: shift(-10), endDate: null });
    const a = bill('a'); await billRepository.upsert(a.bill, a.units);
    const c = bill('c', { year: 1404 }); await billRepository.upsert(c.bill, c.units);
    await periodsRepository.setYearHidden(1404, true);
    await billRepository.flush();
    const text = await exportText();
    expect(JSON.parse(text).backupVersion).toBe(12);

    await resetSqliteForTests(); billRepository._resetCache();
    const r = parseBackup(text);
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const after = await periodsRepository.getState();
    expect(after.mgmtEnabled).toBe(true);
    expect(after.years.find((y) => y.year === 1404)).toMatchObject({ hidden: true, closedAt: null });
    expect(after.periods.find((p) => p.id === pid)).toMatchObject({ managerUnit: 3, managerLabel: 'آقای رضایی', endDate: '' });
    expect(await withSqlite((db) => db.exec("SELECT mgmt_period_id FROM bills WHERE id='a'")[0].values[0][0])).toBe(pid);
    expect((await periodsRepository.billLock('c')).locked).toBe(false);
  });

  it('پشتیبان قالب ۱۱ (و قدیمی‌تر) هنوز بازیابی می‌شود: کلید مدیر روشن، قبض‌ها با زمان ثبت وصل، سال‌ها خودکار (سال جاری + سال‌های دارای قبض)', async () => {
    await setupBuilding();
    await buildingRepository.addManagementPeriod({ managerLabel: 'مدیر قدیم', startDate: shift(-40), endDate: shift(200), notes: null, endPreviousEarly: false });
    const a = bill('a'); await billRepository.upsert({ ...a.bill, mgmtPeriodId: null }, a.units);
    await billRepository.flush();
    const json = JSON.parse(await exportText());
    json.backupVersion = 11;
    for (const b of json.data.buildings) { delete b.mgmtEnabled; delete b.defaultYear; delete b.years; }
    for (const p of json.data.managementPeriods) { delete p.managerUnit; delete p.hidden; }
    for (const b of json.data.bills) delete b.mgmtPeriodId;
    json.data.settings.activeYears = [1405, 1406];

    await resetSqliteForTests(); billRepository._resetCache();
    const r = parseBackup(JSON.stringify(json));
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    const s = await periodsRepository.getState();
    expect(s.mgmtEnabled).toBe(true);
    expect(s.years.map((y) => y.year).sort()).toEqual([todayJalali().year]); // «سال‌های فعال» قدیمی دیگر سال خالی نمی‌سازد
    expect(await withSqlite((db) => db.exec("SELECT mgmt_period_id FROM bills WHERE id='a'")[0].values[0][0])).toBe(s.periods[0].id);
  });
});

describe('فیلترهای چندتایی: جمع‌ها با مجموعهٔ فیلترشده برابرند', () => {
  const all = makeBills(DEFAULT_BUILDING_ID, 'm', 60, 4, 3) as BillWithUnits[];
  it('سوابق: سال × ماه × نوع × وضعیت', () => {
    const f = { years: [1404, 1405], months: [7, 8], types: [] as never[], statuses: normalizeStatuses(['paid', 'unpaid']) };
    expect(f.statuses).toEqual([]); // هر دو = بدون فیلتر
    const got = filterBillsMulti(all, f);
    const want = all.filter(({ bill: b }) => !b.deletedAt && [1404, 1405].includes(b.year) && [7, 8].includes(b.month));
    expect(got.map((x) => x.bill.id).sort()).toEqual(want.map((x) => x.bill.id).sort());
    const del = filterBillsMulti(all, { years: [], months: [], types: [], statuses: normalizeStatuses(['paid', 'deleted']) });
    expect(del.every((x) => x.bill.deletedAt)).toBe(true); // «حذف‌شده» انحصاری
    expect(del.length).toBe(all.filter((x) => x.bill.deletedAt).length);
  });
  it('جمع قبض‌های چند ماه = جمع همان قبض‌ها', () => {
    const year = all[0].bill.year;
    const mt = monthlyTotals(all, year, [1, 2, 3]);
    const live = all.filter(({ bill: b }) => !b.deletedAt && b.year === year && [1, 2, 3].includes(b.month));
    expect(mt.billsTotal).toBe(live.reduce((s, x) => s + x.bill.totalAmount, 0));
    expect(mt.grandTotal).toBe(mt.billsTotal);
    expect(monthsHeading([1, 2, 3], 1405)).toBe('جمع ۳ ماه');
    expect(monthsHeading([7], 1405)).toBe('مهر ۱۴۰۵');
    expect(multiSummary(['مهر', 'آبان'], 'ماه')).toBe('۲ ماه (مهر، آبان)');
  });
  it('پرداخت قبض‌ها: چند سال و چند نوع', () => {
    const t = todayJalali();
    const one = billPaymentReport(all, [1404], ['water'], t).rows.length + billPaymentReport(all, [1405], ['water'], t).rows.length;
    expect(billPaymentReport(all, [1404, 1405], ['water'], t).rows.length).toBe(one);
    expect(billPaymentReport(all, [], [], t).rows.length).toBe(billPaymentReport(all, [...new Set(all.map((x) => x.bill.year))], null, t).rows.length);
  });
});
