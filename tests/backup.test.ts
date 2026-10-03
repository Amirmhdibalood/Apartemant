import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Bill, Unit } from '../src/models/types';
import {
  BACKUP_VERSION,
  BackupErrors,
  backupFileName,
  createBackup,
  parseBackup,
  summarizeBackup,
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
    { id: 'b1', year: 1405, month: 7, expenseType: 'water', billNumber: '123', description: 'آب مهر', totalAmount: 1000000, createdAt: '2026-09-26T08:00:00.000Z', isFullySettled: false, billPaid: false, billPaidDate: null, dueDate: '1405-07-12', deletedAt: null },
    { id: 'b2', year: 1404, month: 12, expenseType: 'gas', billNumber: null, description: null, totalAmount: 900000, createdAt: '2026-03-01T08:00:00.000Z', isFullySettled: true, billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null },
  ];
  const units: Unit[] = [
    { id: 'u1', billId: 'b1', unitNumber: 1, personCount: 1, alias: 'آقای رضایی', shareAmount: 333334, isSettled: true },
    { id: 'u2', billId: 'b1', unitNumber: 2, personCount: 1, shareAmount: 333333, isSettled: false },
    { id: 'u3', billId: 'b1', unitNumber: 3, personCount: 1, shareAmount: 333333, isSettled: false },
    { id: 'u4', billId: 'b2', unitNumber: 1, personCount: 2, shareAmount: 600000, isSettled: true },
    { id: 'u5', billId: 'b2', unitNumber: 2, personCount: 1, shareAmount: 300000, isSettled: true },
  ];
  const settings: AppSettings = { showSaveWarning: false, activeYears: [1405, 1406], dismissedWarnings: ['roundingAdjust', 'duplicateBill'] };
  const building = { units: [{ alias: 'آقای رضایی', defaultPersons: 1 }, { alias: null, defaultPersons: 1 }, { alias: null, defaultPersons: 1, vacant: true }] };
  return { bills, units, settings, building };
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
    expect(Object.keys(o.data).sort()).toEqual(['bills', 'building', 'settings', 'units']);
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
    expect(e).toContain(String(BACKUP_VERSION + 1).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]));
    expect(BACKUP_VERSION).toBe(6);
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
      ['واحد ۳', (o) => { o.data.units[2].personCount = -1; }],
      ['واحد ۲', (o) => { o.data.units[1].alias = 42; }],
      ['تنظیمات ساختمان', (o) => { o.data.building = { units: [] }; }],
      ['تنظیمات ساختمان', (o) => { o.data.building = { units: [{ alias: null, defaultPersons: -2 }] }; }],
      ['هیچ قبضی', (o) => { o.data.units[0].billId = 'missing'; }],
      ['هیچ واحدی', (o) => { o.data.units = o.data.units.filter((u: Unit) => u.billId !== 'b2'); }],
      ['مبلغ کل', (o) => { o.data.units[0].shareAmount += 1; }],
      ['تاریخ تهیه', (o) => { o.createdAt = 'دیروز'; }],
      ['الگوی واحدها', (o) => { o.data.unitTemplate = [2, 0, 1]; }],
      ['الگوی واحدها', (o) => { o.data.unitTemplate = 'x'; }],
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

  it('پشتیبان قدیمی (قالب ۱، نسخه ۱٫۱ برنامه، بدون الگوی واحدها) همچنان بازیابی می‌شود', () => {
    const r = parseBackup(text((o) => { o.backupVersion = 1; o.appVersion = '1.1.0'; delete o.data.unitTemplate; }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.data.bills).toHaveLength(2);
    expect(r.backup.data.unitTemplate).toBeUndefined();
  });

  it('انواع هزینه جدید (نظافت، تعمیرات، زیبایی ساختمان) پذیرفته می‌شوند', () => {
    for (const t of ['cleaning', 'repairs', 'beautification']) {
      const r = parseBackup(text((o) => { o.data.bills[0].expenseType = t; }));
      expect(r.ok && r.backup.data.bills[0].expenseType).toBe(t);
    }
  });

  it('پرداخت‌های واحدها (payments با تاریخ) ذخیره و بازیابی می‌شوند؛ داده نامعتبر رد می‌شود', () => {
    const pays = [{ id: 'p1', amount: 200000, paidAt: '2026-09-20T10:00:00.000Z' }, { id: 'p2', amount: 133333, paidAt: null }];
    const r = parseBackup(text((o) => { o.data.units[1].payments = pays; o.data.units[1].isSettled = false; }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.data.units[1].payments).toEqual(pays);
    expect(r.backup.data.units[1].isSettled).toBe(true); // جمع پرداخت‌ها = سهم → تسویه
    expect('payments' in r.backup.data.units[0]).toBe(false); // داده قدیمی بدون payments دست‌نخورده می‌ماند
    for (const bad of [
      (o: any) => { o.data.units[0].payments = [{ id: 'x', amount: 0, paidAt: null }]; },
      (o: any) => { o.data.units[0].payments = [{ id: 'x', amount: 5, paidAt: 'دیروز' }]; },
      (o: any) => { o.data.units[0].payments = [{ id: 'x', amount: 999999999, paidAt: null }]; },
      (o: any) => { o.data.units[0].payments = 'x'; },
    ]) expect(errorOf(text(bad))).toContain('واحد ۱');
  });

  it('نحوه تقسیم (قالب ۳): رفت‌وبرگشت، پیش‌فرض‌های هر نوع هزینه و رد مقدار نامعتبر', () => {
    const r = parseBackup(text((o) => { o.data.bills[1].splitMethod = 'perUnit'; o.data.splitDefaults = { gas: 'perUnit', water: 'perPerson', phone: 'perUnit', electricity: 'x' }; }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.data.bills[1].splitMethod).toBe('perUnit');
    expect('splitMethod' in r.backup.data.bills[0]).toBe(false); // قبض قدیمی = بر اساس نفرات
    expect(r.backup.data.splitDefaults).toEqual({ gas: 'perUnit', water: 'perPerson' });
    expect(errorOf(text((o) => { o.data.bills[0].splitMethod = 'perArea'; }))).toContain('قبض ۱');
  });

  it('پشتیبان قالب ۲ (نسخه ۱٫۲، بدون نحوه تقسیم) همچنان بازیابی می‌شود', () => {
    const r = parseBackup(text((o) => { o.backupVersion = 2; o.appVersion = '1.2.0'; }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.data.bills.every((b) => b.splitMethod === undefined)).toBe(true);
    expect(r.backup.data.splitDefaults).toBeUndefined();
  });

  it('«پرداخت شد» خودِ قبض (قالب ۴): رفت‌وبرگشت با تاریخ؛ مقدار نامعتبر رد می‌شود', () => {
    const r = parseBackup(text((o) => { o.data.bills[1].billPaid = true; o.data.bills[1].billPaidDate = '1404-12-20'; }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.backupVersion).toBe(BACKUP_VERSION);
    expect(r.backup.data.bills[1]).toMatchObject({ billPaid: true, billPaidDate: '1404-12-20' });
    // برچسب زمانی ISO (داده آزمایشی قدیمی) به تاریخ شمسی همان روز تبدیل می‌شود
    const iso = parseBackup(text((o) => { o.data.bills[1].billPaid = true; o.data.bills[1].billPaidDate = '2026-03-05T10:00:00.000Z'; }));
    expect(iso.ok && iso.backup.data.bills[1].billPaidDate).toBe('1404-12-14');
    expect(r.backup.data.bills[0]).toMatchObject({ billPaid: false, billPaidDate: null });
    expect(errorOf(text((o) => { o.data.bills[0].billPaid = 'yes'; }))).toContain('قبض ۱');
    expect(errorOf(text((o) => { o.data.bills[1].billPaidDate = 'دیروز'; }))).toContain('قبض ۲');
  });

  it('پشتیبان‌های قالب ۱ تا ۳ (بدون billPaid) بازیابی می‌شوند و قبض‌ها «پرداخت‌نشده» هستند', () => {
    for (const v of [1, 2, 3]) {
      const r = parseBackup(text((o) => {
        o.backupVersion = v;
        for (const b of o.data.bills) { delete b.billPaid; delete b.billPaidDate; delete b.dueDate; delete b.deletedAt; }
        for (const u of o.data.units) delete u.alias;
        delete o.data.building;
        if (v > 1) o.data.unitTemplate = [1, 1, 1];
      }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.backup.backupVersion).toBe(v);
      expect(r.backup.data.bills.map((b) => [b.billPaid, b.billPaidDate, b.dueDate, b.deletedAt])).toEqual([[false, null, null, null], [false, null, null, null]]);
    }
  });

  it('مهلت پرداخت و حذف نرم (قالب ۴): رفت‌وبرگشت؛ مقدار نامعتبر رد می‌شود؛ خلاصه تعداد حذف‌شده‌ها', () => {
    const r = parseBackup(text((o) => { o.data.bills[1].deletedAt = '2026-09-27T08:00:00.000Z'; }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.data.bills[0].dueDate).toBe('1405-07-12');
    expect(r.backup.data.bills[1]).toMatchObject({ dueDate: null, deletedAt: '2026-09-27T08:00:00.000Z' });
    expect(summarizeBackup(r.backup).deletedBills).toBe(1);
    expect(errorOf(text((o) => { o.data.bills[0].dueDate = '1405/07/12'; }))).toContain('قبض ۱');
    expect(errorOf(text((o) => { o.data.bills[1].deletedAt = 'دیروز'; }))).toContain('قبض ۲');
    expect(errorOf(text((o) => { o.data.bills[0].dueDate = '1405-07-40'; }))).toContain('قبض ۱');
  });

  it('قالب ۵: تنظیمات ساختمان و اسم مستعار واحدها رفت‌وبرگشت؛ واحد خالی (۰ نفر، سهم ۰) مجاز است', () => {
    const r = parseBackup(text((o) => {
      o.data.units[0].shareAmount -= 1; o.data.units[1].shareAmount += 1; // مجموع ثابت
      o.data.units[2].personCount = 0;
      o.data.units[1].alias = '  خانم   احمدی ';
    }));
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.data.building).toEqual(sample().building);
    expect(r.backup.data.units.slice(0, 3).map((u) => [u.alias, u.personCount])).toEqual([['آقای رضایی', 1], ['خانم احمدی', 1], [undefined, 0]]);
  });

  it('بازیابی قالب‌های ۱ تا ۴: تنظیمات ساختمان از جدیدترین قبض حذف‌نشده ساخته می‌شود', () => {
    for (const v of [1, 2, 3, 4]) {
      const r = parseBackup(text((o) => {
        o.backupVersion = v;
        delete o.data.building;
        for (const u of o.data.units) { delete u.alias; if (u.billId === 'b1') u.personCount = u.unitNumber; }
        if (v > 1) o.data.unitTemplate = [7, 7];
      }));
      if (!r.ok) throw new Error(r.error);
      expect(r.backup.data.building).toEqual({ units: [1, 2, 3].map((n) => ({ alias: null, defaultPersons: n })) });
    }
    // جدیدترین قبض حذف شده باشد → قبض بعدی
    const del = parseBackup(text((o) => { o.backupVersion = 4; delete o.data.building; o.data.bills[0].deletedAt = '2026-09-27T08:00:00.000Z'; }));
    if (!del.ok) throw new Error(del.error);
    expect(del.backup.data.building).toEqual({ units: [{ alias: null, defaultPersons: 2 }, { alias: null, defaultPersons: 1 }] });
  });

  it('تاریخ پرداخت بدون تیک «پرداخت شد» نادیده گرفته می‌شود', () => {
    const r = parseBackup(text((o) => { o.data.bills[0].billPaidDate = '2026-03-05T10:00:00.000Z'; }));
    expect(r.ok && r.backup.data.bills[0]).toMatchObject({ billPaid: false, billPaidDate: null });
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

  it('تنظیمات ساختمان در پشتیبان ذخیره و بازیابی می‌شود', async () => {
    const building = { units: [{ alias: 'آقای رضایی', defaultPersons: 5 }, { alias: null, defaultPersons: 1, vacant: true }] };
    await backupRepository.replaceAll({ ...sample(), building });
    const json = serializeBackup(createBackup(await backupRepository.collect(), '1.6.0', NOW));
    expect(JSON.parse(json).data.building).toEqual(building);
    expect(JSON.parse(json).data.unitTemplate).toBeUndefined();
    mem.clear();
    billRepository._resetCache();
    const r = parseBackup(json);
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    billRepository._resetCache();
    expect((await backupRepository.collect()).building).toEqual(building);
  });

  it('بازیابی پشتیبان قدیمی (بدون تنظیمات ساختمان): از آخرین قبض، وگرنه از الگوی قدیمی ساخته می‌شود', async () => {
    await backupRepository.replaceAll({ ...sample(), building: { units: [{ alias: 'x', defaultPersons: 5 }] } });
    const old = sample();
    delete old.building;
    old.units = old.units.map((u) => (u.billId === 'b1' ? { ...u, personCount: u.unitNumber, alias: undefined } : u));
    await backupRepository.replaceAll(old);
    billRepository._resetCache();
    expect((await backupRepository.collect()).building).toEqual({ units: [1, 2, 3].map((n) => ({ alias: null, defaultPersons: n })) });
    await backupRepository.replaceAll({ bills: [], units: [], settings: old.settings, unitTemplate: [4, 2] });
    expect((await backupRepository.collect()).building).toEqual({ units: [{ alias: null, defaultPersons: 4 }, { alias: null, defaultPersons: 2 }] });
  });

  it('پیش‌فرض‌های نحوه تقسیم در پشتیبان ذخیره و بازیابی می‌شوند؛ پشتیبان قدیمی آن‌ها را پاک می‌کند', async () => {
    await backupRepository.replaceAll({ ...sample(), splitDefaults: { gas: 'perUnit' } });
    const json = serializeBackup(createBackup(await backupRepository.collect(), '1.3.0', NOW));
    expect(JSON.parse(json).data.splitDefaults).toEqual({ gas: 'perUnit' });
    mem.clear();
    billRepository._resetCache();
    const r = parseBackup(json);
    if (!r.ok) throw new Error(r.error);
    await backupRepository.replaceAll(r.backup.data);
    expect((await backupRepository.collect()).splitDefaults).toEqual({ gas: 'perUnit' });
    await backupRepository.replaceAll(sample()); // قالب قدیمی بدون splitDefaults
    expect((await backupRepository.collect()).splitDefaults).toBeUndefined();
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
