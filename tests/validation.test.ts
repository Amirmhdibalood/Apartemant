import { describe, expect, it } from 'vitest';
import type { BillDraft } from '../src/models/types';
import { validateDraft } from '../src/logic/validation';
import { emptyDraft } from '../src/logic/billFactory';
import { toggleYear } from '../src/logic/years';
import { dismissWarning, shouldShowWarning } from '../src/logic/warnings';
import { DEFAULT_SETTINGS } from '../src/models/constants';

describe('validateDraft', () => {
  const base: BillDraft = { ...emptyDraft(1404, 7), expenseType: 'water', amountDigits: '5000000', personCounts: ['2', '3'] };

  it('accepts a valid draft', () => {
    const r = validateDraft(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ totalAmount: 5_000_000, personCounts: [2, 3], vacant: [false, false], areas: [null, null] });
  });

  it('reports each error separately', () => {
    const codes = (d: BillDraft) => {
      const r = validateDraft(d);
      return r.ok ? [] : r.errors.map((e) => e.code);
    };
    expect(codes({ ...base, amountDigits: '' })).toEqual(['AMOUNT_MISSING']);
    expect(codes({ ...base, amountDigits: '0' })).toEqual(['AMOUNT_INVALID']);
    expect(codes({ ...base, personCounts: [] })).toEqual(['NO_UNITS']);
    expect(codes({ ...base, personCounts: ['2', ''] })).toEqual(['PERSON_COUNT_MISSING']);
    // از نسخه ۱.۶.۰ صفر = واحد خالی (مجاز)، ولی همه واحدها صفر نفر نمی‌توانند باشند
    expect(codes({ ...base, personCounts: ['0', '3'] })).toEqual([]);
    expect(codes({ ...base, personCounts: ['0'] })).toEqual(['NO_PERSONS']);
    expect(codes({ ...base, personCounts: ['0', '0'], splitMethod: 'perUnit' })).toEqual([]);
    // واحد خالی (۱.۶.۳): نفراتش بررسی نمی‌شود؛ همه خالی = خطا
    expect(codes({ ...base, personCounts: ['', '3'], unitVacant: [true, false] })).toEqual([]);
    expect(codes({ ...base, personCounts: ['2', '3'], unitVacant: [true, true] })).toEqual(['ALL_VACANT']);
    expect(codes({ ...base, personCounts: ['2', '3'], unitVacant: [false, true], splitMethod: 'perUnit' })).toEqual([]);
    expect(codes({ ...base, personCounts: ['0', '3'], unitVacant: [false, true] })).toEqual(['NO_PERSONS']);
    expect(codes({ ...base, personCounts: ['1.5'] })).toEqual(['PERSON_COUNT_INVALID']);
    expect(codes({ ...base, expenseType: null })).toEqual(['REQUIRED_MISSING']);
  });
});

describe('years & warnings', () => {
  it('keeps at least one active year', () => {
    expect(toggleYear([1405, 1406], 1406)).toEqual([1405]);
    expect(toggleYear([1405], 1405)).toBeNull();
    expect(toggleYear([1405], 1410)).toEqual([1405, 1410]);
  });
  it('save warning follows the settings toggle; others use dismissed list', () => {
    expect(shouldShowWarning('saveConfirm', DEFAULT_SETTINGS)).toBe(true);
    const s1 = dismissWarning('saveConfirm', DEFAULT_SETTINGS);
    expect(s1.showSaveWarning).toBe(false);
    expect(shouldShowWarning('saveConfirm', s1)).toBe(false);
    const s2 = dismissWarning('duplicateBill', DEFAULT_SETTINGS);
    expect(shouldShowWarning('duplicateBill', s2)).toBe(false);
    expect(shouldShowWarning('lastUnitSettle', s2)).toBe(true);
  });
});
