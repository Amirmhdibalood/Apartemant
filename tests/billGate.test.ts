import { describe, expect, it } from 'vitest';
import { hasOpenManagementPeriod, isOpenManagementPeriod, isYearOpen, newBillBlockers } from '../src/logic/billGate';
import type { MgmtPeriod } from '../src/logic/periods';

const period = (partial: Partial<MgmtPeriod> & Pick<MgmtPeriod, 'startDate' | 'endDate'>): MgmtPeriod => ({
  id: 'p1', buildingId: 'b', managerLabel: 'م', managerUnit: 1, endedEarlyAt: null, notes: null, hidden: false, ...partial,
});

describe('دروازه ثبت قبض جدید (۱.۹: سال باز + مدیر فعال وقتی کلید روشن است)', () => {
  it('سال باز یعنی در فهرست سال‌های باز ساختمان باشد', () => {
    expect(isYearOpen([1404, 1405], 1405)).toBe(true);
    expect(isYearOpen([1404], 1405)).toBe(false);
  });

  it('دوره مدیریت باز: شروع≤امروز≤پایان (یا بدون پایان) و بدون بستن زودهنگام', () => {
    const open = period({ startDate: '1404-01-01', endDate: '1404-12-29' });
    expect(isOpenManagementPeriod(open, '1404-08-15')).toBe(true);
    expect(isOpenManagementPeriod({ ...open, endedEarlyAt: '2026-01-01' }, '1404-08-15')).toBe(false);
    expect(isOpenManagementPeriod(open, '1405-01-01')).toBe(false);
    expect(isOpenManagementPeriod(period({ startDate: '1404-01-01', endDate: '' }), '1409-01-01')).toBe(true);
    expect(hasOpenManagementPeriod([open], '1404-08-15')).toBe(true);
  });

  it('هر دو مانع در یک فهرست خطا می‌آیند و مسیر تازهٔ «دوره‌ها» را نشان می‌دهند', () => {
    const errs = newBillBlockers({ openYears: [], mgmtEnabled: true, periods: [], todayKey: '1405-01-10' });
    expect(errs).toHaveLength(2);
    expect(errs[0].message).toMatch(/دوره‌ها ← سال‌ها/);
    expect(errs[1].message).toMatch(/دوره‌ها ← مدیر ساختمان/);
    for (const e of errs) expect(e.message).not.toMatch(new RegExp(['تنظیمات', ['دوره', 'مالی'].join(' '), 'سال مالی'].join('|')));
  });

  it('کلید مدیر خاموش: دوره لازم نیست', () => {
    expect(newBillBlockers({ openYears: [1405], mgmtEnabled: false, periods: [], todayKey: '1405-06-01' })).toEqual([]);
  });

  it('بدون مانع، فهرست خالی است', () => {
    expect(newBillBlockers({
      openYears: [1405], mgmtEnabled: true,
      periods: [period({ startDate: '1405-01-01', endDate: '1405-12-29' })],
      todayKey: '1405-06-01',
    })).toEqual([]);
  });
});
