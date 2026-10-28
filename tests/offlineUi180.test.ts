import { beforeEach, describe, expect, it } from 'vitest';
import { resetIdbForTests } from '../src/storage/idb';
import { resetSqliteForTests } from '../src/storage/sqlite/db';
import { billRepository } from '../src/storage/billRepository';
import { buildingRepository } from '../src/storage/buildingRepository';
import { DEFAULT_BUILDING_ID } from '../src/storage/sqlite/schema';
import type { Bill, Unit } from '../src/models/types';

const prefs = () => (globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem;

beforeEach(async () => {
  prefs().clear();
  billRepository._resetCache();
  await resetIdbForTests();
  await resetSqliteForTests();
});

const bill = (id: string, extra: Partial<Bill> = {}): Bill => ({
  id, year: 1405, month: 7, expenseType: 'building', billNumber: null, description: null,
  totalAmount: 3000, createdAt: '2026-01-01T00:00:00.000Z', isFullySettled: false,
  billPaid: false, billPaidDate: null, dueDate: null, deletedAt: null, ...extra,
});
const unit = (id: string, billId: string, payments: Unit['payments'] = []): Unit => ({
  id, billId, unitNumber: 1, personCount: 2, shareAmount: 3000, isSettled: false, payments,
});

describe('۱.۸.۰ — UI آفلاین (چندساختمان / صندوق / دوره مدیریت)', () => {
  it('چند ساختمان: سوییچ prefs + جدا بودن قبض‌ها', async () => {
    expect(await buildingRepository.isMultiEnabled()).toBe(false);
    await buildingRepository.setMultiEnabled(true);
    expect(await buildingRepository.isMultiEnabled()).toBe(true);

    const b2 = await buildingRepository.create('گلستان', false);
    await buildingRepository.setActiveId(DEFAULT_BUILDING_ID);
    await billRepository.upsert(bill('b-a'), [unit('u-a', 'b-a', [{ id: 'p1', amount: 1000, paidAt: '2026-01-02T00:00:00.000Z' }])]);

    await buildingRepository.setActiveId(b2);
    expect(await billRepository.getAll()).toHaveLength(0);
    await billRepository.upsert(bill('b-b', { expenseType: 'water' }), [unit('u-b', 'b-b')]);
    expect((await billRepository.getAll()).map((x) => x.bill.id)).toEqual(['b-b']);

    await buildingRepository.setActiveId(DEFAULT_BUILDING_ID);
    expect((await billRepository.getAll()).map((x) => x.bill.id)).toEqual(['b-a']);
  });

  it('صندوق per-building و برداشت', async () => {
    await buildingRepository.setFundEnabled(true);
    await billRepository.upsert(
      bill('chg1'),
      [unit('uc', 'chg1', [{ id: 'pay', amount: 2000, paidAt: '2026-02-01T00:00:00.000Z' }])],
    );
    expect(await buildingRepository.getFundBalance()).toBe(2000);
    await buildingRepository.addFundWithdraw(500, 'تعمیر');
    expect(await buildingRepository.getFundBalance()).toBe(1500);
    const entries = await buildingRepository.listFundEntries();
    expect(entries.some((e) => e.kind === 'withdraw' && e.amount === 500)).toBe(true);
  });

  it('دوره مدیریت ثبت و بستن زودهنگام', async () => {
    const id = await buildingRepository.addManagementPeriod({
      managerLabel: 'آقای تست',
      startDate: '1405-01-01',
      endDate: '1405-12-29',
    });
    let rows = await buildingRepository.listManagementPeriods();
    expect(rows[0]?.id).toBe(id);
    expect(rows[0]?.endedEarlyAt).toBeNull();
    await buildingRepository.endManagementEarly(id);
    rows = await buildingRepository.listManagementPeriods();
    expect(rows[0]?.endedEarlyAt).toBeTruthy();
  });
});
