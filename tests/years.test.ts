import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, FIRST_YEAR, LAST_YEAR } from '../src/models/constants';
import { activeYearsSummary, migrateActiveYears, recordYearOptions, selectableYears } from '../src/logic/years';
import { pickDefaultYear } from '../src/logic/date';
import { sanitizeSettings } from '../src/storage/settingsRepository';
import { APP_VERSION, APP_VERSION_FA } from '../src/appVersion';

describe('بازه سال‌ها (۱۴۰۵ تا ۱۵۰۵)', () => {
  it('سال‌های قابل انتخاب از ۱۴۰۵ شروع و به ۱۵۰۵ ختم می‌شوند', () => {
    const ys = selectableYears();
    expect(FIRST_YEAR).toBe(1405);
    expect(LAST_YEAR).toBe(1505);
    expect(ys[0]).toBe(1405);
    expect(ys[ys.length - 1]).toBe(1505);
    expect(ys).toHaveLength(101);
    expect(ys.some((y) => y < 1405)).toBe(false);
  });

  it('پیش‌فرض فقط ۱۴۰۵ فعال است', () => {
    expect(DEFAULT_SETTINGS.activeYears).toEqual([1405]);
    expect(sanitizeSettings(null).activeYears).toEqual([1405]);
  });

  it('مهاجرت: سال‌های قبل از ۱۴۰۵ حذف می‌شوند', () => {
    expect(migrateActiveYears([1403, 1404, 1405])).toEqual([1405]);
    expect(migrateActiveYears([1404, 1407, 1406, 1407])).toEqual([1406, 1407]);
    expect(migrateActiveYears([1600, 1505])).toEqual([1505]);
  });

  it('مهاجرت: اگر هیچ سالی باقی نماند ۱۴۰۵ فعال می‌شود', () => {
    expect(migrateActiveYears([1403, 1404])).toEqual([1405]);
    expect(migrateActiveYears([])).toEqual([1405]);
    expect(migrateActiveYears('bad')).toEqual([1405]);
    expect(migrateActiveYears([1405.5, '1406'])).toEqual([1405]);
  });

  it('تنظیمات ذخیره‌شده نسخه قبلی درست مهاجرت می‌کنند و بقیه تنظیمات حفظ می‌شوند', () => {
    const old = { showSaveWarning: false, activeYears: [1404, 1405], dismissedWarnings: ['rounding'] };
    expect(sanitizeSettings(old as never)).toEqual({ showSaveWarning: false, activeYears: [1405], dismissedWarnings: ['rounding'] });
    expect(sanitizeSettings({ activeYears: [1403, 1404] }).activeYears).toEqual([1405]);
  });

  it('سوابق: سال قبض‌های قدیمی (مثلاً ۱۴۰۴) همچنان در کشوی سال دیده می‌شود', () => {
    expect(recordYearOptions([1405], [1404, 1404, 1405])).toEqual([1404, 1405]);
    expect(recordYearOptions([1406, 1405], [])).toEqual([1405, 1406]);
    // سال پیش‌فرض همیشه از سال‌های فعال انتخاب می‌شود
    expect(pickDefaultYear([1405], 1404)).toBe(1405);
  });

  it('خلاصه سال‌های فعال با ارقام فارسی', () => {
    expect(activeYearsSummary([1405])).toBe('۱۴۰۵');
    expect(activeYearsSummary([1407, 1405, 1406])).toBe('۱۴۰۵، ۱۴۰۶، ۱۴۰۷');
    expect(activeYearsSummary([1405, 1406, 1407, 1408, 1409])).toBe('۱۴۰۵، ۱۴۰۶، ۱۴۰۷ و ۲ سال دیگر');
  });
});

describe('نسخه برنامه', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));

  it('package.json نسخه معتبر (x.y.z) و versionCode عدد صحیح مثبت دارد', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number.isInteger(pkg.versionCode) && pkg.versionCode >= 1).toBe(true);
  });

  it('نسخه با ارقام فارسی در تنظیمات نمایش داده می‌شود', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION_FA).toBe('نسخه ' + pkg.version.replace(/\d/g, (d: string) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]));
    if (pkg.version === '1.0.0') expect(APP_VERSION_FA).toBe('نسخه ۱.۰.۰');
  });
});
