/**
 * ۱.۸ — ذخیرهٔ کم‌هزینه: ژورنال ردیف‌های تغییرکرده + snapshot اتمی.
 * هر ذخیره فقط ردیف‌های لمس‌شده را اضافه می‌کند؛ بعد از «خاموش/روشن» (یا قطع ناگهانی) داده‌ها کامل برمی‌گردند.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import {
  checkpointSqlite, closeSqliteKeepBytesForTests, getPersistStats, memoryFaults, memoryStoreForTests,
  requestCheckpoint, resetSqliteForTests, withSqlite, withSqliteWrite, JOURNAL_CHECKPOINT_BYTES,
} from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { backupRepository } from '../src/storage/backupRepository';
import { dumpAllTables, makeBills, seedScenario } from './helpers/scenario';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;

async function restart() {
  closeSqliteKeepBytesForTests();
  billRepository._resetCache();
}

beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

describe('ذخیرهٔ ردیفی (ژورنال)', () => {
  it('ذخیرهٔ یک قبض فقط ژورنال را اضافه می‌کند، نه کل دیتابیس', async () => {
    await seedScenario([{ name: 'الف', units: 20, bills: 30, fund: true }]);
    await checkpointSqlite();
    const before = getPersistStats();
    const snap = memoryStoreForTests().snapshotBytes;
    const [{ bill, units }] = makeBills(DEFAULT_BUILDING_ID, 'new', 1, 20, 5);
    await billRepository.upsert(bill, units);
    const after = getPersistStats();
    expect(after.checkpoints).toBe(before.checkpoints);
    expect(after.journalAppends).toBe(before.journalAppends + 1);
    expect(after.lastJournalBytes).toBeLessThan(snap / 10);
    expect(memoryStoreForTests().snapshotBytes).toBe(snap);
  });

  it('همهٔ نوع تغییرها بعد از راه‌اندازی دوباره (replay ژورنال) دقیقاً برمی‌گردند', async () => {
    const ids = await seedScenario([
      { name: 'الف', units: 5, bills: 10, fund: true },
      { name: 'ب', units: 8, bills: 6, fund: true, meetings: 3 },
    ]);
    await checkpointSqlite();
    // ویرایش، حذف نرم، بازگردانی، حذف کامل، پرداخت، صندوق، جلسه، ساختمان
    const all = (await billRepository.getAllWithDeleted()).filter((b) => !b.bill.billPaid && !b.bill.deletedAt);
    const first = all[0];
    await billRepository.upsert({ ...first.bill, description: 'ویرایش‌شده' }, first.units.map((u) => ({ ...u, payments: [], isSettled: u.shareAmount === 0 })));
    await billRepository.remove(all[1].bill.id);
    await billRepository.restore(all[1].bill.id);
    await billRepository.remove(all[2].bill.id);
    await billRepository.purge(all[2].bill.id);
    await buildingRepository.addFundWithdraw(1000, 'لامپ', DEFAULT_BUILDING_ID);
    const meetings = await buildingRepository.listMeetings(ids[1]);
    await buildingRepository.removeMeeting(meetings[0].id); // cascade → attendance rows
    await buildingRepository.rename(ids[1], 'ب تازه');
    await buildingRepository.save({ units: [{ alias: 'x', defaultPersons: 2, phone: '09120000000' }] }, ids[1]);
    await buildingRepository.endManagementEarly((await buildingRepository.listManagementPeriods(ids[0]))[0].id);
    const expected = await dumpAllTables();
    expect(memoryStoreForTests().journal.length).toBeGreaterThan(0);

    await restart();
    expect(await dumpAllTables()).toEqual(expected);
    expect(getPersistStats().replayedOps).toBeGreaterThan(0);
    // و یک بار دیگر بعد از checkpoint
    await checkpointSqlite();
    expect(memoryStoreForTests().journal).toBe('');
    await restart();
    expect(await dumpAllTables()).toEqual(expected);
  });

  it('رگبار ذخیره‌ها هم‌زمان در یک نوبت ذخیره جمع می‌شوند', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 2 }]);
    await checkpointSqlite();
    const base = getPersistStats().journalAppends;
    await Promise.all(Array.from({ length: 10 }, (_, i) => buildingRepository.addFundDepositManual(100 + i, null).catch(() => undefined)));
    await buildingRepository.setFundEnabled(true);
    await Promise.all(Array.from({ length: 10 }, (_, i) => buildingRepository.addFundDepositManual(100 + i, null)));
    expect(getPersistStats().journalAppends - base).toBeLessThan(12);
    const expected = await dumpAllTables();
    await restart();
    expect(await dumpAllTables()).toEqual(expected);
  });

  it('ژورنال بزرگ خودکار به snapshot تبدیل می‌شود', async () => {
    await seedScenario([{ name: 'الف', units: 100, bills: 1 }]);
    await checkpointSqlite();
    const c0 = getPersistStats().checkpoints;
    let i = 0;
    while (getPersistStats().checkpoints === c0 && i < 400) {
      const [{ bill, units }] = makeBills(DEFAULT_BUILDING_ID, `big${i}`, 1, 100, i);
      await billRepository.upsert({ ...bill, description: 'x'.repeat(4000) }, units);
      i++;
    }
    expect(getPersistStats().checkpoints).toBeGreaterThan(c0);
    expect(memoryStoreForTests().journal.length).toBeLessThan(JOURNAL_CHECKPOINT_BYTES);
    const expected = await dumpAllTables();
    await restart();
    expect(await dumpAllTables()).toEqual(expected);
  });

  it('بازیابی کامل پشتیبان یک snapshot تازه می‌نویسد (نه ژورنال میلیونی)', async () => {
    await seedScenario([{ name: 'الف', units: 20, bills: 20, fund: true }, { name: 'ب', units: 5, bills: 5 }]);
    const data = await backupRepository.collect();
    const c0 = getPersistStats().checkpoints;
    await backupRepository.replaceAll(data);
    expect(getPersistStats().checkpoints).toBeGreaterThan(c0);
    expect(memoryStoreForTests().journal).toBe('');
  });
});

describe('ایمنی در برابر قطع ناگهانی / خطای حافظه', () => {
  it('شکست نوشتن ژورنال: خطا به کاربر می‌رسد و ذخیرهٔ بعدی همان ردیف‌ها را هم می‌نویسد', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 3, fund: true }]);
    await checkpointSqlite();
    memoryFaults.failAppend = 1;
    await expect(buildingRepository.addFundDepositManual(777, 'اول')).rejects.toThrow('injected');
    await buildingRepository.addFundDepositManual(888, 'دوم');
    const expected = await dumpAllTables();
    expect(expected.fund_entries.some((r) => r.includes(777))).toBe(true);
    await restart();
    expect(await dumpAllTables()).toEqual(expected);
  });

  it('سطر نیمه‌نوشته (قطع وسط نوشتن) نادیده گرفته می‌شود؛ بقیه سالم', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 3, fund: true }]);
    await checkpointSqlite();
    await buildingRepository.addFundDepositManual(111, 'قبل');
    Object.assign(memoryFaults, { failAppend: 1, tornAppend: true });
    await expect(buildingRepository.addFundDepositManual(222, 'نیمه')).rejects.toThrow();
    await buildingRepository.addFundDepositManual(333, 'بعد');
    const expected = await dumpAllTables();
    await restart();
    expect(await dumpAllTables()).toEqual(expected);
  });

  it('قطع بدون هیچ ذخیرهٔ تأییدشده: آخرین وضعیت ذخیره‌شده برمی‌گردد', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 3, fund: true }]);
    const saved = await dumpAllTables();
    // تغییر در حافظه که هرگز ذخیره نشد (برنامه وسط کار بسته شد)
    await withSqlite((db) => { db.run("UPDATE buildings SET name = 'ذخیره‌نشده'"); });
    await restart();
    expect(await dumpAllTables()).toEqual(saved);
  });

  it('شکست نوشتن snapshot: فایل قبلی + ژورنالش سالم می‌ماند', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 3, fund: true }]);
    await checkpointSqlite();
    await buildingRepository.addFundDepositManual(111, 'در ژورنال');
    const saved = await dumpAllTables();
    memoryFaults.failSnapshot = 1;
    await expect(checkpointSqlite()).rejects.toThrow('injected');
    await restart();
    expect(await dumpAllTables()).toEqual(saved);
  });

  it('snapshot نوشته شد ولی پاک کردن ژورنال نه: سطرهای نسل قبل نادیده گرفته می‌شوند (تغییر تازه برنمی‌گردد عقب)', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 3 }]);
    await checkpointSqlite();
    await buildingRepository.rename(DEFAULT_BUILDING_ID, 'نام ۱'); // journaled (old generation)
    memoryFaults.failJournalReset = 1;
    await withSqliteWrite((db) => {
      requestCheckpoint();
      db.run("UPDATE buildings SET name = 'نام ۲' WHERE id = ?", [DEFAULT_BUILDING_ID]); // only in the new snapshot
    });
    expect(memoryStoreForTests().journal.length).toBeGreaterThan(0); // stale journal still there
    await restart();
    expect(await buildingRepository.getName(DEFAULT_BUILDING_ID)).toBe('نام ۲');
  });

  it('شکست snapshot بعد از بازیابی کامل → بازیابی برگشت می‌خورد و داده‌های قبلی می‌مانند', async () => {
    await seedScenario([{ name: 'الف', units: 5, bills: 4, fund: true }]);
    const data = await backupRepository.collect();
    await buildingRepository.addFundDepositManual(999, 'بعد از پشتیبان');
    const before = await dumpAllTables();
    memoryFaults.failSnapshot = 1;
    await expect(backupRepository.replaceAll(data)).rejects.toThrow('injected');
    expect(await dumpAllTables()).toEqual(before);
    await restart();
    expect(await dumpAllTables()).toEqual(before);
  });
});
