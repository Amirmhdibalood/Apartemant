/** Perf fixes (stress review): batched SQLite writes, cheap migration gate, O(n) backup grouping; cache ≡ DB. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Bill, Unit } from '../src/models/types';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests, withSqlite } from '../src/storage/sqlite/db';
import { inTransaction, readAllBills, readAllUnits } from '../src/storage/sqlite/domain';
import { billRepository } from '../src/storage/billRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { createBackup, groupUnitsByBill, parseBackup, serializeBackup } from '../src/logic/backup';
import { DEFAULT_SETTINGS } from '../src/models/constants';

const bill = (id: string, extra: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null,
  totalAmount: 3000, createdAt: `2026-01-0${(id.length % 9) + 1}T00:00:00.000Z`, isFullySettled: false,
  billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
});
const units3 = (billId: string): Unit[] => [3, 1, 2].map((n) => ({
  id: `${billId}-u${n}`, billId, unitNumber: n, personCount: 1, shareAmount: 1000, isSettled: false, payments: [],
}));

beforeEach(async () => {
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

/** cached view must equal a fresh load from SQLite */
async function expectCacheMatchesDb() {
  const cached = await billRepository.getAllWithDeleted();
  billRepository._resetCache();
  const fresh = await billRepository.getAllWithDeleted();
  const norm = (xs: typeof cached) => xs
    .map((x) => ({ id: x.bill.id, deleted: x.bill.deletedAt, units: x.units.map((u) => [u.id, u.unitNumber, u.shareAmount, (u.payments ?? []).length]) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  expect(norm(cached)).toEqual(norm(fresh));
  return cached;
}

describe('بهینه‌سازی‌های تست فشار', () => {
  it('کش حافظه بعد از upsert/upsertMany/remove/restore/purge با بارگذاری تازه برابر است', async () => {
    await billRepository.replaceAll([bill('a'), bill('bb')], [...units3('a'), ...units3('bb')]);
    await billRepository.upsert(bill('ccc'), units3('ccc'));
    // ویرایش: واحدهای قبض a عوض می‌شوند (۲ واحد)
    await billRepository.upsert(bill('a', { totalAmount: 2000 }), units3('a').slice(0, 2).map((u) => ({ ...u, id: u.id + 'x' })));
    await billRepository.upsertMany([{ bill: bill('dddd'), units: units3('dddd') }, { bill: bill('bb', { totalAmount: 3000 }), units: units3('bb') }]);
    await billRepository.remove('ccc');
    await billRepository.restore('ccc');
    await billRepository.remove('dddd');
    await billRepository.purge('dddd');
    const all = await expectCacheMatchesDb();
    expect(all.map((x) => x.bill.id).sort()).toEqual(['a', 'bb', 'ccc']);
    // واحدهای هر قبض همچنان به ترتیب شماره واحد
    for (const x of all) expect(x.units.map((u) => u.unitNumber)).toEqual([...x.units.map((u) => u.unitNumber)].sort((p, q) => p - q));
    expect((await billRepository.getById('a'))!.units.map((u) => u.id)).toEqual(['a-u1x', 'a-u3x']);
  });

  it('inTransaction: خطا وسط دسته‌ای از نوشتن‌ها همه را برمی‌گرداند', async () => {
    await billRepository.replaceAll([bill('a')], units3('a'));
    await withSqlite((db) => {
      expect(() => inTransaction(db, () => {
        db.run('DELETE FROM bill_units');
        db.run('DELETE FROM bills');
        throw new Error('boom');
      })).toThrow('boom');
      expect(readAllBills(db)).toHaveLength(1);
      expect(readAllUnits(db)).toHaveLength(3);
      // تراکنش باز نمانده: نوشتن بعدی عادی کار می‌کند
      db.run("UPDATE bills SET description = 'ok' WHERE id = 'a'");
      expect(readAllBills(db)[0].description).toBe('ok');
    });
  });

  it('replaceAll (بازیابی) با تراکنش، همه ردیف‌ها و پرداخت‌ها را می‌نویسد', async () => {
    const us = units3('a');
    us[0].payments = [{ id: 'p1', amount: 1000, paidAt: '2026-01-02T00:00:00.000Z' }];
    us[0].isSettled = true;
    await billRepository.replaceAll([bill('a'), bill('bb')], [...us, ...units3('bb')]);
    const units = await withSqlite((db) => readAllUnits(db));
    expect(units).toHaveLength(6);
    expect(units.find((u) => u.id === 'a-u3')!.payments).toHaveLength(1);
  });

  it('مخزن ساختمان بعد از مهاجرت درست کار می‌کند (بدون خواندن کل قبض‌ها)', async () => {
    await billRepository.replaceAll([bill('a')], units3('a'));
    await buildingRepository.replace({ units: [{ alias: null, defaultPersons: 2 }, { alias: 'x', defaultPersons: 1 }] });
    expect((await buildingRepository.get()).units).toHaveLength(2);
    expect((await buildingRepository.list()).length).toBeGreaterThan(0);
  });

  it('groupUnitsByBill هم‌ارز filter و با حفظ ترتیب است؛ parseBackup قبض‌های درهم را درست گروه می‌کند', () => {
    const us: Unit[] = [...units3('a'), ...units3('bb')];
    const mixed = [us[3], us[0], us[4], us[1], us[5], us[2]];
    const g = groupUnitsByBill(mixed);
    for (const id of ['a', 'bb']) expect(g.get(id)).toEqual(mixed.filter((u) => u.billId === id));
    const text = serializeBackup(createBackup({ bills: [bill('a'), bill('bb')], units: mixed, settings: DEFAULT_SETTINGS }, 't'));
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.data.units.map((u) => u.id)).toEqual(mixed.map((u) => u.id));
  });
});
