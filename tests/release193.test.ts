/**
 * ۱.۹.۳ — پیش‌فرض تاریخ مدیر جدید، اعتبارسنجی دوقدم فرم قبض، بایگانی/بازگردانی ساختمان و پشتیبان.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests } from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { backupRepository } from '../src/storage/backupRepository';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import { defaultNewManagerDates, yearEndKey } from '../src/logic/periods';
import { validateBillStep1, isStep1BillError, validateDraft } from '../src/logic/validation';
import { emptyDraft } from '../src/logic/billFactory';
import { createBackup, parseBackup, serializeBackup } from '../src/logic/backup';
import { Errors } from '../src/logic/errors';
import { searchTopics } from '../src/logic/help';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;

async function newPhone() {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
}

beforeEach(newPhone);

describe('۱.۹.۳ پیش‌فرض تاریخ مدیر جدید', () => {
  it('شروع = امروز و پایان = آخر اسفند همان سال (۲۹ عادی، ۳۰ کبیسه)', () => {
    expect(defaultNewManagerDates('1405-08-19')).toEqual({ startDate: '1405-08-19', endDate: yearEndKey(1405) });
    expect(defaultNewManagerDates('1405-08-19').endDate).toBe('1405-12-29');
    expect(defaultNewManagerDates('1403-01-01')).toEqual({ startDate: '1403-01-01', endDate: '1403-12-30' });
    expect(defaultNewManagerDates('1403-12-30').endDate).toBe('1403-12-30');
  });
});

describe('۱.۹.۳ اعتبارسنجی دوقدم فرم قبض', () => {
  it('قدم ۱ فقط سال، ماه و نوع را می‌خواهد', () => {
    const base = { ...emptyDraft(1405, 8, null), expenseType: 'water' as const };
    expect(validateBillStep1({ ...base, expenseType: null })).toMatchObject({ ok: false });
    expect(validateBillStep1({ ...base, month: 0 })).toMatchObject({ ok: false });
    expect(validateBillStep1(base).ok).toBe(true);
  });

  it('خطاهای قدم ۱ از مبلغ/واحدها جدا می‌شوند', () => {
    expect(isStep1BillError(Errors.requiredMissing('سال'))).toBe(true);
    expect(isStep1BillError(Errors.requiredMissing('ماه'))).toBe(true);
    expect(isStep1BillError(Errors.requiredMissing('نوع هزینه'))).toBe(true);
    expect(isStep1BillError(Errors.requiredMissing('مبلغ'))).toBe(false);
    const draft = { ...emptyDraft(1405, 8, null), expenseType: 'water' as const, amountDigits: '' };
    const full = validateDraft(draft);
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.errors.some(isStep1BillError)).toBe(false);
      expect(full.errors.some((e) => e.code === 'AMOUNT_MISSING' || /مبلغ/.test(e.message))).toBe(true);
    }
  });
});

describe('۱.۹.۳ بایگانی و بازگردانی ساختمان', () => {
  it('unarchive ساختمان را به فهرست فعال برمی‌گرداند و داده حفظ می‌شود', async () => {
    await buildingRepository.setMultiEnabled(true);
    const id = await buildingRepository.create('فرعی', false);
    await buildingRepository.setActiveId(id);
    await buildingRepository.save({
      units: [{ alias: 'الف', defaultPersons: 2, vacant: false, area: 80, phone: null }],
    });
    await buildingRepository.archive(id);
    expect((await buildingRepository.list()).some((b) => b.id === id)).toBe(false);
    expect((await buildingRepository.listArchived()).some((b) => b.id === id)).toBe(true);
    expect(await buildingRepository.getActiveId()).toBe(DEFAULT_BUILDING_ID);

    await buildingRepository.unarchive(id);
    expect((await buildingRepository.listArchived()).some((b) => b.id === id)).toBe(false);
    expect((await buildingRepository.list()).some((b) => b.id === id)).toBe(true);
    await buildingRepository.setActiveId(id);
    const b = await buildingRepository.get();
    expect(b.units[0].alias).toBe('الف');
    expect(b.units[0].area).toBe(80);
  });

  it('پشتیبان رفت‌وبرگشت: بایگانی‌شده با archivedAt برمی‌گردد و بعد از بازگردانی فعال است', async () => {
    await buildingRepository.setMultiEnabled(true);
    const id = await buildingRepository.create('بایگانی‌شونده', false);
    await buildingRepository.archive(id);
    const text = serializeBackup(createBackup(await backupRepository.collect(), '1.9.3', new Date('2026-11-10T00:00:00Z')));
    await newPhone();
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await backupRepository.replaceAll(parsed.backup.data);
    const arch = await buildingRepository.listArchived();
    expect(arch.some((b) => b.id === id && b.name === 'بایگانی‌شونده')).toBe(true);
    await buildingRepository.unarchive(id);
    expect((await buildingRepository.list()).find((b) => b.id === id)?.name).toBe('بایگانی‌شونده');
  });
});

describe('۱.۹.۳ راهنما', () => {
  it('تنظیمات ساختمان، اطلاعات تکمیلی و بازگردانی در آموزش هست', () => {
    expect(searchTopics('تنظیمات ساختمان').some((t) => t.id === 'buildings')).toBe(true);
    expect(searchTopics('اطلاعات تکمیلی').some((t) => t.id === 'newbill')).toBe(true);
    expect(searchTopics('بازگردانی').some((t) => t.id === 'buildings')).toBe(true);
    expect(searchTopics('ساختمان‌ها').some((t) => t.id === 'buildings')).toBe(true);
  });
});
