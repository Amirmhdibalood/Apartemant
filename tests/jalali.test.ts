import { describe, expect, it } from 'vitest';
import {
  addJalaliDays, dayNumberToJalali, formatJalaliKey, isJalaliLeapYear, isValidJalali, jalaliDiffDays,
  jalaliMonthLength, jalaliToDayNumber, parseJalaliKey,
} from '../src/logic/jalali';
import { jalaliDateTime } from '../src/logic/date';

describe('تقویم شمسی (مهلت پرداخت)', () => {
  it('با تقویم persian مرورگر/Node برای هر روز ۱۴۰۰ تا ۱۴۱۰ یکسان است', () => {
    const start = Date.UTC(2021, 2, 21, 12); // ۱ فروردین ۱۴۰۰
    const base = jalaliToDayNumber({ year: 1400, month: 1, day: 1 });
    for (let i = 0; i < 4020; i++) {
      const j = jalaliDateTime(new Date(start + i * 86400000))!;
      const ours = dayNumberToJalali(base + i);
      expect(ours).toEqual({ year: j.year, month: j.month, day: j.day });
    }
  });

  it('طول ماه‌ها و سال کبیسه', () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1405, 12)).toBe(29);
    expect(jalaliMonthLength(1405, 6)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(isValidJalali({ year: 1405, month: 12, day: 30 })).toBe(false);
    expect(isValidJalali({ year: 1405, month: 7, day: 30 })).toBe(true);
  });

  it('جمع روز و اختلاف روز از مرز ماه و سال', () => {
    expect(addJalaliDays({ year: 1405, month: 6, day: 30 }, 3)).toEqual({ year: 1405, month: 7, day: 2 });
    expect(addJalaliDays({ year: 1405, month: 12, day: 28 }, 3)).toEqual({ year: 1406, month: 1, day: 2 });
    expect(jalaliDiffDays({ year: 1405, month: 7, day: 6 }, { year: 1405, month: 7, day: 9 })).toBe(3);
    expect(jalaliDiffDays({ year: 1405, month: 7, day: 9 }, { year: 1405, month: 7, day: 6 })).toBe(-3);
  });

  it('کلید ذخیره "1405-07-15"', () => {
    expect(formatJalaliKey({ year: 1405, month: 7, day: 5 })).toBe('1405-07-05');
    expect(parseJalaliKey('1405-07-05')).toEqual({ year: 1405, month: 7, day: 5 });
    for (const bad of ['1405-7-5', '1405-12-30', '1405/07/05', '', null, 14050705]) expect(parseJalaliKey(bad)).toBeNull();
  });
});
