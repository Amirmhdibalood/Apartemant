import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Bill, Unit } from '../src/models/types';
import {
  BACKUP_VERSION,
  BackupErrors,
  backupFileName,
  createBackup,
  parseBackup,
  serializeBackup,
  type BackupData,
} from '../src/logic/backup';

// ذخیره‌ساز کلید/مقدار در حافظه (به‌جای Capacitor Preferences)
const mem = new Map<string, string>();
vi.mock('../src/storage/kvStore', () => ({
  readJson: async (key: string, fallback: unknown) => (mem.has(key) ? JSON.parse(mem.get(key)!) : fallback),
  writeJson: async (key: string, value: unknown) => { mem.set(key, JSON.stringify(value)); },
  removeKey: async (key: string) => { mem.delete(key); },
}));

const { backupRepository } = await import('../src/storage/backupRepository');
const { billRepository } = await import('../src/storage/billRepository');

function sample(): BackupData {
  const bills: Bill[] = [
    { id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: '123', description: 'آب مهر', totalAmount: 1000000, createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false },
    { id: 'b2', year: 1404, month: 12, expenseType: 'gas', billNumber: null, description: null, totalAmount: 900000, createdAt: '2026-03-01T08:00:00.000Z', isFullySettled: true },
  ];
  const units: Unit[] = [
    { id: 'u1', billId: 'b1', unitNumber: 1, personCount: 1, shareAmount: 333334, isSettled: true },
    { id: 'u2', billId: 'b1', unitNumber: 2, personCount: 1, shareAmount: 333333, isSettled: false },
    { id: 'u3', billId: 'b1', unitNumber: 3, personCount: 1, shareAmount: 333333, isSettled: false },
    { id: 'u4', billId: 'b2', unitNumber: 1, personCount: 2, shareAmount: 600000, isSettled: true },
    { id: 'u5', billId: 'b2', unitNumber: 2, personCount: 1, shareAmount: 300000, isSettled: true },
  ];
  const settings: AppSettings = { showSaveWarning: false, activeYears: [1405, 1406], dismissedWarnings: ['roundingAdjust', 'duplicateBill'] };
  return { bills, units, settings };
}

const NOW = new Date('2026-09-26T09:00:00Z'); // ۴ مهر ۱۴۰۵
const text = (mutate?: (o: any) => void) => {
  const o = JSON.parse(serializeBackup(createBackup(sample(), '1.1.0', NOW)));
  mutate?.(o);
  return JSON.stringify(o);
};
const errorOf = (t: string) => {
  const r = parseBackup(t);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
};

describe('پشتیبان‌گیری: ساخت فایل', () => {
  it('نام فایل با تاریخ شمسی ساخته می‌شود', () => {
    expect(backupFileName(NOW)).toBe('apartemant-backup-1405-07-04.json');
  });

  it('سربرگ فایل: app / backupVersion / appVersion / createdAt', () => {
    const o = JSON.parse(text());
    expect(o.app).toBe('apartemant');
    expect(o.backupVersion).toBe(BACKUP_VERSION);
    expect(o.appVersion).toBe('1.1.0');
    expect(o.createdAt).toBe(NOW.toISOString());
    expect(Object.keys(o.data).sort()).toEqual(['bills', 'settings', 'units']);
  });
});

describe('بازیابی: اعتبارسنجی و رفت‌وبرگشت', () => {
  it('رفت‌وبرگشت کامل بدون تغییر داده', () => {
    const r = parseBackup(text());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.data).toEqual(sample());
    expect(r.summary).toMatchObject({ bills: 2, units: 5, settledBills: 1, years: [1404, 1405], appVersion: '1.1.0' });
    expect(r.summary.createdAtFa).toContain('۱۴۰۵/۰۷/۰۴');
  });

  it('BOM ابتدای فایل مشکلی ایجاد نمی‌کند', () => {
    expect(parseBackup('\uFEFF' + text()).ok).toBe(true);
  });

  it('فایل خالی', () => {
    expect(errorOf('')).toBe(BackupErrors.empty);
    expect(errorOf('   \n')).toBe(BackupErrors.empty);
  });

  it('فایل خراب (JSON ناقص)', () => {
    const t = text();
    expect(errorOf(t.slice(0, t.length / 2))).toBe(BackupErrors.notJson);
    expect(errorOf('این فایل متنی است')).toBe(BackupErrors.notJson);
  });

  it('فایل برنامه دیگر', () => {
    expect(errorOf(text((o) => { o.app = 'other-app'; }))).toBe(BackupErrors.wrongApp);
    expect(errorOf('[]')).toBe(BackupErrors.wrongApp);
    expect(errorOf('null')).toBe(BackupErrors.wrongApp);
    expect(errorOf('{"name":"x"}')).toBe(BackupErrors.wrongApp);
  });

  it('نسخه جدیدتر قالب پشتیبان پذیرفته نمی‌شود', () => {
    const e = errorOf(text((o) => { o.backupVersion = BACKUP_VERSION + 1; }));
    expect(e).toContain('نسخه جدیدتری');
    expect(e).toContain('۲');
  });

  it('نسخه نامعتبر قالب', () => {
    expect(errorOf(text((o) => { o.backupVersion = 0; }))).toBe(BackupErrors.badVersion);
    expect(errorOf(text((o) => { o.backupVersion = '1'; }))).toBe(BackupErrors.badVersion);
    expect(errorOf(text((o) => { delete o.backupVersion; }))).toBe(BackupErrors.badVersion);
  });

  it('ساختار ناقص یا خراب با پیام فارسی مشخص', () => {
    const cases: [string, (o: any) => void][] = [
      ['بخش اطلاعات', (o) => { delete o.data; }],
      ['فهرست قبض‌ها', (o) => { o.data.bills = {}; }],
      ['فهرست واحدها', (o) => { delete o.data.units; }],
      ['قبض ۱', (o) => { o.data.bills[0].month = 13; }],
      ['قبض ۲', (o) => { o.data.bills[1].expenseType = 'phone'; }],
      ['قبض ۱', (o) => { o.data.bills[0].totalAmount = -5; }],
      ['تکراری', (o) => { o.data.bills[1].id = 'b1'; }],
      ['واحد ۳', (o) => { o.data.units[2].personCount = 0; }],
      ['هیچ قبضی', (o) => { o.data.units[0].billId = 'missing'; }],
      ['هیچ واحدی', (o) => { o.data.units = o.data.units.filter((u: Unit) => u.billId !== 'b2'); }],
      ['مبلغ کل', (o) => { o.data.units[0].shareAmount += 1; }],
      ['تاریخ تهیه', (o) => { o.createdAt = 'دیروز'; }],
    ];
    for (const [needle, mutate] of cases) {
      const e = errorOf(text(mutate));
      expect(e.startsWith('فایل پشتیبان ناقص یا خراب است')).toBe(true);
      expect(e).toContain(needle);
    }
  });

  it('تنظیمات هنگام بازیابی مهاجرت داده می‌شوند (سال‌های قبل از ۱۴۰۵ و هشدارهای ناشناخته حذف)', () => {
    const r = parseBackup(text((o) => { o.data.settings = { activeYears: [1403, 1404], dismissedWarnings: ['saveConfirm', 'bogus'], showSaveWarning: true }; }));
    expect(r.ok && r.backup.data.settings).toEqual({ showSaveWarning: true, activeYears: [1405], dismissedWarnings: ['saveConfirm'] });
  });

  it('وضعیت «تسویه کامل» از روی واحدها محاسبه می‌شود', () => {
    const r = parseBackup(text((o) => { o.data.bills[0].isFullySettled = true; o.data.bills[1].isFullySettled = false; }));
    expect(r.ok && r.backup.data.bills.map((b) => b.isFullySettled)).toEqual([false, true]);
  });
});

describe('مخزن پشتیبان (گرفتن و بازیابی کامل داده‌ها)', () => {
  beforeEach(() => { mem.clear(); billRepository._resetCache(); });

  it('گرفتن پشتیبان → بازیابی روی «گوشی جدید» → همان داده‌ها', async () => {
    const d = sample();
    await backupRepository.replaceAll(d);
    const json = serializeBackup(createBackup(await backupRepository.collect(), '1.1.0', NOW));

    // گوشی جدید: حافظه خالی
    mem.clear();
    billRepository._resetCache();
    expect((await backupRepository.collect()).bills).toHaveLength(0);

    const r = parseBackup(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await backupRepository.replaceAll(r.backup.data);
    billRepository._resetCache(); // خواندن دوباره از حافظه
    const after = await backupRepository.collect();
    expect(after).toEqual(d);
    expect((await billRepository.getById('b1'))?.units).toHaveLength(3);
  });

  it('نسخه ایمنی قبل از جایگزینی ذخیره و قابل برگشت است', async () => {
    const d = sample();
    await backupRepository.replaceAll(d);
    await backupRepository.saveSafetyBackup('1.1.0');
    await backupRepository.replaceAll({ bills: [], units: [], settings: { showSaveWarning: true, activeYears: [1405], dismissedWarnings: [] } });
    expect((await backupRepository.collect()).bills).toHaveLength(0);

    const safety = await backupRepository.getSafetyBackup();
    expect(safety?.data.bills).toHaveLength(2);
    await backupRepository.replaceAll(safety!.data);
    expect(await backupRepository.collect()).toEqual(d);
  });
});
