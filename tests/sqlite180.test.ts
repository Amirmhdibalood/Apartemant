import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests } from '../src/storage/sqlite/db';
import { ensureMigrated, clearLegacyPrefsAfterMigration } from '../src/storage/migration';
import { billRepository } from '../src/storage/billRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { withSqlite } from '../src/storage/sqlite/db';
import { fundBalance, listFundEntries, readAllUnits } from '../src/storage/sqlite/domain';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import type { Bill, Unit } from '../src/models/types';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;

function seedPrefs(bills: Bill[], units: Unit[]) {
  prefs().set('bc.bills', JSON.stringify(bills));
  prefs().set('bc.units', JSON.stringify(units));
  prefs().set('bc.schemaVersion', JSON.stringify(2));
}

const bill = (id: string, extra: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType: 'water', billNumber: null, description: null,
  totalAmount: 1000, createdAt: '2026-01-01T00:00:00.000Z', isFullySettled: false,
  billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
});
const unit = (id: string, billId: string, extra: Partial<Unit> = {}): Unit => ({
  id, billId, unitNumber: 1, personCount: 2, shareAmount: 1000, isSettled: false, payments: [], ...extra,
});

beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

describe('۱.۸.۰ — SQLite مستقل', () => {
  it('باز کردن دیتابیس و مهاجرت از Preferences', async () => {
    seedPrefs([bill('b1'), bill('b2')], [unit('u1', 'b1'), unit('u2', 'b2')]);
    const r = await ensureMigrated();
    expect(r.migratedNow).toBe(true);
    expect(r.bills).toHaveLength(2);
    expect(r.units).toHaveLength(2);

    billRepository._resetCache();
    const again = await ensureMigrated();
    expect(again.migratedNow).toBe(false);
    expect(again.bills.map((b) => b.id).sort()).toEqual(['b1', 'b2']);

    const units = await withSqlite((db) => readAllUnits(db));
    expect(units).toHaveLength(2);
  });

  it('CRUD ردیفی قبض + واحد + پرداخت', async () => {
    await billRepository.replaceAll([], []);
    const b = bill('bx', { expenseType: 'electricity', totalAmount: 5000 });
    const u1: Unit = {
      id: 'ux1', billId: 'bx', unitNumber: 1, personCount: 1, shareAmount: 3000, isSettled: false,
      payments: [{ id: 'p1', amount: 1000, paidAt: '2026-01-02T00:00:00.000Z' }],
    };
    const u2: Unit = {
      id: 'ux2', billId: 'bx', unitNumber: 2, personCount: 1, shareAmount: 2000, isSettled: false, payments: [],
    };
    await billRepository.upsert(b, [u1, u2]);
    billRepository._resetCache();
    const got = await billRepository.getById('bx');
    expect(got).not.toBeNull();
    expect(got!.units).toHaveLength(2);
    expect(got!.units.find((u) => u.id === 'ux1')!.payments).toEqual([
      { id: 'p1', amount: 1000, paidAt: '2026-01-02T00:00:00.000Z' },
    ]);

    await billRepository.remove('bx');
    expect((await billRepository.getAll()).some((x) => x.bill.id === 'bx')).toBe(false);
    expect((await billRepository.getAllWithDeleted()).some((x) => x.bill.id === 'bx')).toBe(true);
    await billRepository.restore('bx');
    expect((await billRepository.getAll()).some((x) => x.bill.id === 'bx')).toBe(true);
    await billRepository.remove('bx');
    await billRepository.purge('bx');
    expect(await billRepository.getById('bx')).toBeNull();
  });

  it('واریز صندوق با پرداخت روی قبض شارژ وقتی fund_enabled', async () => {
    await billRepository.replaceAll([], []);
    await buildingRepository.setFundEnabled(true);
    expect(await buildingRepository.getFundEnabled()).toBe(true);

    const b = bill('chg', { expenseType: 'building', totalAmount: 4000 });
    const u: Unit = {
      id: 'cu1', billId: 'chg', unitNumber: 1, personCount: 2, shareAmount: 4000, isSettled: false,
      payments: [
        { id: 'pay1', amount: 1500, paidAt: '2026-02-01T00:00:00.000Z' },
        { id: 'pay2', amount: 500, paidAt: '2026-02-02T00:00:00.000Z' },
      ],
    };
    await billRepository.upsert(b, [u]);

    const bal = await withSqlite((db) => fundBalance(db, DEFAULT_BUILDING_ID));
    expect(bal).toBe(2000);
    const entries = await withSqlite((db) => listFundEntries(db, DEFAULT_BUILDING_ID));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.kind === 'deposit')).toBe(true);

    // Reverse payments → fund cleared
    await billRepository.upsert(b, [{ ...u, payments: [], isSettled: false }]);
    expect(await withSqlite((db) => fundBalance(db, DEFAULT_BUILDING_ID))).toBe(0);

    // Fund off → no deposits
    await buildingRepository.setFundEnabled(false);
    await billRepository.upsert(b, [{
      ...u,
      payments: [{ id: 'pay3', amount: 4000, paidAt: '2026-02-03T00:00:00.000Z' }],
      isSettled: true,
    }]);
    expect(await withSqlite((db) => fundBalance(db, DEFAULT_BUILDING_ID))).toBe(0);
  });

  it('پاک‌سازی Preferences پس از مهاجرت SQLite', async () => {
    seedPrefs([bill('b1')], [unit('u1', 'b1')]);
    await ensureMigrated();
    const cleared = await clearLegacyPrefsAfterMigration();
    expect(cleared).toBe(true);
    expect(prefs().has('bc.bills')).toBe(false);
    expect(await clearLegacyPrefsAfterMigration()).toBe(false);
  });
});
