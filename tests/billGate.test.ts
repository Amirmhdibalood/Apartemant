import { describe, expect, it } from 'vitest';
import {
  hasOpenManagementPeriod, isCurrentFinancialYearOpen, isOpenManagementPeriod, newBillBlockers,
} from '../src/logic/billGate';
import type { ManagementPeriodRow } from '../src/storage/sqlite/domain';

const period = (partial: Partial<ManagementPeriodRow> & Pick<ManagementPeriodRow, 'startDate' | 'endDate'>): ManagementPeriodRow => ({
  id: 'p1', buildingId: 'b', managerLabel: 'م', endedEarlyAt: null, notes: null, ...partial,
});

describe('دروازه ثبت قبض جدید', () => {
  it('سال جاری باید در سال‌های فعال باشد', () => {
    expect(isCurrentFinancialYearOpen([1404, 1405], 1405)).toBe(true);
    expect(isCurrentFinancialYearOpen([1404], 1405)).toBe(false);
  });

  it('دوره مدیریت باز: شروع≤امروز≤پایان و بدون بستن زودهنگام', () => {
    const open = period({ startDate: '1404-01-01', endDate: '1404-12-29' });
    expect(isOpenManagementPeriod(open, '1404-08-15')).toBe(true);
    expect(isOpenManagementPeriod({ ...open, endedEarlyAt: '2026-01-01' }, '1404-08-15')).toBe(false);
    expect(isOpenManagementPeriod(open, '1405-01-01')).toBe(false);
    expect(hasOpenManagementPeriod([open], '1404-08-15')).toBe(true);
  });

  it('هر دو مانع در یک فهرست خطا می‌آیند', () => {
    const errs = newBillBlockers({
      activeYears: [1404],
      currentYear: 1405,
      periods: [],
      todayKey: '1405-01-10',
    });
    expect(errs).toHaveLength(2);
    expect(errs[0].message).toMatch(/سال‌ها/);
    expect(errs[1].message).toMatch(/دورهٔ مدیریت/);
  });

  it('بدون مانع، فهرست خالی است', () => {
    expect(newBillBlockers({
      activeYears: [1405],
      currentYear: 1405,
      periods: [period({ startDate: '1405-01-01', endDate: '1405-12-29' })],
      todayKey: '1405-06-01',
    })).toEqual([]);
  });
});
