/**
 * ۱.۸ — مسیر اندروید (Capacitor Filesystem) با یک فایل‌سیستم شبیه‌سازی‌شده:
 * snapshot تکه‌تکه (بدون یک رشتهٔ base64 عظیم)، tmp + rename، فایل قدیمی تا تأیید فایل تازه می‌ماند،
 * سازگاری با فایل apartemant.db نسخهٔ قبلی، و قطع ناگهانی وسط هر مرحله.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, Uint8Array>();
const faults = { failAppendOnPath: '' as string, failAppendAfter: -1, crashInRename: false, writes: [] as number[] };
const enc = new TextEncoder();
const dec = new TextDecoder();
const concat = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const toBytes = (data: string, encoding?: string) => (encoding ? enc.encode(data) : new Uint8Array(Buffer.from(data, 'base64')));

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => 'android' } };
});

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Cache: 'CACHE', Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    async writeFile({ path, data, encoding }: { path: string; data: string; encoding?: string }) {
      faults.writes.push(data.length);
      files.set(path, toBytes(data, encoding));
      return { uri: `file:///${path}` };
    },
    async appendFile({ path, data, encoding }: { path: string; data: string; encoding?: string }) {
      faults.writes.push(data.length);
      if (faults.failAppendOnPath && path.endsWith(faults.failAppendOnPath)) {
        if (faults.failAppendAfter === 0) throw new Error('ENOSPC');
        faults.failAppendAfter--;
      }
      files.set(path, concat(files.get(path) ?? new Uint8Array(), toBytes(data, encoding)));
    },
    async readFile({ path, encoding }: { path: string; encoding?: string }) {
      const b = files.get(path);
      if (!b) throw new Error('File does not exist');
      return { data: encoding ? dec.decode(b) : Buffer.from(b).toString('base64') };
    },
    async stat({ path }: { path: string }) {
      const b = files.get(path);
      if (!b) throw new Error('File does not exist');
      return { size: b.length, type: 'file' };
    },
    async rename({ from, to }: { from: string; to: string }) {
      const b = files.get(from);
      if (!b) throw new Error('File does not exist');
      files.delete(to); // Capacitor/ionfilesystem: delete target, then File.renameTo
      if (faults.crashInRename) throw new Error('process killed');
      files.set(to, b);
      files.delete(from);
    },
    async deleteFile({ path }: { path: string }) { files.delete(path); },
  },
}));

const { resetIdbForTests } = await import('../src/storage/idb');
const db = await import('../src/storage/sqlite/db');
const { billRepository } = await import('../src/storage/billRepository');
const { buildingRepository } = await import('../src/storage/buildingRepository');
const { backupRepository } = await import('../src/storage/backupRepository');
const { dumpAllTables, seedScenario, makeBills } = await import('./helpers/scenario');
const { DEFAULT_BUILDING_ID } = await import('../src/storage/sqlite/schema');

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;

async function restart() {
  db.closeSqliteKeepBytesForTests();
  billRepository._resetCache();
}

beforeEach(async () => {
  prefs().clear();
  files.clear();
  Object.assign(faults, { failAppendOnPath: '', failAppendAfter: -1, crashInRename: false, writes: [] });
  billRepository._resetCache();
  await resetIdbForTests();
  await db.resetSqliteForTests();
  db.setSqliteMemoryOnly(false); // → native backend (Capacitor mocked as Android)
});

describe('اندروید: فایل دیتابیس', () => {
  it('snapshot در تکه‌های ≤ ۴ مگابایتی نوشته و با اندازه تأیید می‌شود؛ ذخیرهٔ بعدی فقط ژورنال است', async () => {
    await seedScenario([{ name: 'بزرگ', units: 100, bills: 150 }]);
    await db.checkpointSqlite();
    const main = files.get('apartemant.db')!;
    expect(main.length).toBeGreaterThan(3 * 1024 * 1024); // forces several chunks
    expect(Math.max(...faults.writes)).toBeLessThanOrEqual(4 * 1024 * 1024 + 4);
    expect(files.has('apartemant.db.tmp')).toBe(false);
    faults.writes = [];
    const [{ bill, units }] = makeBills(DEFAULT_BUILDING_ID, 'n', 1, 100, 1);
    await billRepository.upsert(bill, units);
    expect(files.get('apartemant.db')).toBe(main); // snapshot untouched
    expect(faults.writes.length).toBe(1); // one small journal append
    expect(faults.writes[0]).toBeLessThan(100_000);
    const expected = await dumpAllTables();
    await restart();
    expect(await dumpAllTables()).toEqual(expected);
  });

  it('فایل apartemant.db نسخهٔ قبلی (بدون ژورنال/نسل) بدون مهاجرت خطرناک باز می‌شود و همان فایل ادامه می‌یابد', async () => {
    await seedScenario([{ name: 'قدیمی', units: 6, bills: 8, fund: true }]);
    const expected = await dumpAllTables();
    // build exactly what 1.8.0 left on disk: full DB image as base64, no persistGen row, no journal
    const old = await db.openDetachedDatabase(db.getSqliteExportBytes()!);
    old.run("DELETE FROM app_meta WHERE key = 'persistGen'");
    const oldBytes = old.export();
    old.close();
    files.clear();
    files.set('apartemant.db', oldBytes);
    await restart();
    expect(await dumpAllTables()).toEqual(expected);
    await buildingRepository.addFundDepositManual(4242, 'بعد از به‌روزرسانی');
    expect(files.get('apartemant.db')).toBe(oldBytes); // old file kept as-is; change went to the journal
    const after = await dumpAllTables();
    await restart();
    expect(await dumpAllTables()).toEqual(after);
  });

  it('قطع وسط نوشتن snapshot تازه (tmp ناقص): فایل قبلی + ژورنال سالم', async () => {
    await seedScenario([{ name: 'الف', units: 100, bills: 120, fund: true }]);
    await db.checkpointSqlite();
    await buildingRepository.addFundDepositManual(5151, 'در ژورنال');
    const saved = await dumpAllTables();
    Object.assign(faults, { failAppendOnPath: 'apartemant.db.tmp', failAppendAfter: 0 });
    await expect(db.checkpointSqlite()).rejects.toThrow('ENOSPC');
    expect(files.has('apartemant.db')).toBe(true);
    await restart();
    expect(await dumpAllTables()).toEqual(saved);
  });

  it('قطع بین «حذف فایل قبلی» و «تغییر نام tmp»: فایل tmp تأییدشده استفاده می‌شود', async () => {
    await seedScenario([{ name: 'الف', units: 10, bills: 10, fund: true }]);
    await db.checkpointSqlite();
    await buildingRepository.addFundDepositManual(6161, 'آخر');
    const saved = await dumpAllTables();
    faults.crashInRename = true;
    await expect(db.checkpointSqlite()).rejects.toThrow('killed');
    expect(files.has('apartemant.db')).toBe(false);
    expect(files.has('apartemant.db.tmp')).toBe(true);
    faults.crashInRename = false;
    await restart();
    expect(await dumpAllTables()).toEqual(saved);
  });

  it('بعد از یک checkpoint ناموفق، برنامه (بدون بسته شدن) هیچ ژورنالی روی وضعیت نامعلوم نمی‌نویسد', async () => {
    await seedScenario([{ name: 'الف', units: 10, bills: 10, fund: true }]);
    await db.checkpointSqlite();
    faults.crashInRename = true;
    await expect(db.checkpointSqlite()).rejects.toThrow('killed');
    faults.crashInRename = false;
    await buildingRepository.addFundDepositManual(7171, 'بعد از خطا'); // must go into a full snapshot
    expect(files.has('apartemant.db')).toBe(true);
    const saved = await dumpAllTables();
    await restart();
    expect(await dumpAllTables()).toEqual(saved);
  });

  it('فایل اصلی خراب و tmp نیست: فایل خراب کنار گذاشته می‌شود (هرگز رونویسی نمی‌شود) و برنامه بالا می‌آید', async () => {
    files.set('apartemant.db', enc.encode('not a database at all'.repeat(10)));
    await restart();
    expect((await dumpAllTables()).bills).toEqual([]);
    await buildingRepository.rename(DEFAULT_BUILDING_ID, 'تازه');
    const kept = [...files.keys()].find((k) => k.startsWith('apartemant.db.corrupt-'));
    expect(kept).toBeTruthy();
    expect(dec.decode(files.get(kept!)!)).toContain('not a database');
  });

  it('نسخهٔ ایمنی و پشتیبان کامل روی اندروید: فایل کنار دیتابیس، نه Preferences', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 5, fund: true }, { name: 'ب', units: 3, bills: 2 }]);
    const before = await dumpAllTables();
    await backupRepository.saveSafetyBackup('1.8.0');
    expect(files.has('aux/safety-backup.db')).toBe(true);
    expect(files.has('aux/safety-backup.json')).toBe(true);
    expect([...prefs().keys()].some((k) => k.includes('safety'))).toBe(false);
    await backupRepository.replaceAll({ bills: [], units: [], settings: { showSaveWarning: true, activeYears: [1405], dismissedWarnings: [] } });
    const safety = await backupRepository.getSafetyBackup();
    await backupRepository.replaceAll(safety!.data);
    expect(await dumpAllTables()).toEqual(before);
    await restart();
    expect(await dumpAllTables()).toEqual(before);
  });
});
