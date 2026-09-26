import { describe, expect, it } from 'vitest';
import type { Unit } from '../src/models/types';
import {
  addPayment, clearPayments, completesBill, lastPaidAt, paidAmount, PaymentErrors, remainingAmount, settleFully, unitPayments, validatePayment,
} from '../src/logic/payments';

const T1 = new Date('2026-09-20T10:00:00Z');
const T2 = new Date('2026-09-25T10:00:00Z');
const unit = (over: Partial<Unit> = {}): Unit => ({ id: 'u1', billId: 'b1', unitNumber: 1, personCount: 2, shareAmount: 1000000, isSettled: false, ...over });

describe('پرداخت واحدها (کامل و جزئی)', () => {
  it('مهاجرت: واحد تسویه‌شده قدیمی = یک پرداخت کامل با تاریخ نامشخص', () => {
    const legacy = unit({ isSettled: true });
    expect(unitPayments(legacy)).toEqual([{ id: 'u1-legacy', amount: 1000000, paidAt: null }]);
    expect(paidAmount(legacy)).toBe(1000000);
    expect(remainingAmount(legacy)).toBe(0);
    expect(lastPaidAt(legacy)).toBeNull();
    expect(unitPayments(unit())).toEqual([]);
    expect(remainingAmount(unit())).toBe(1000000);
  });

  it('چند پرداخت جزئی با تاریخ خودکار؛ با صفر شدن مانده «تسویه» می‌شود', () => {
    let u = addPayment(unit(), 300000, T1);
    expect(u).toMatchObject({ isSettled: false });
    expect(remainingAmount(u)).toBe(700000);
    u = addPayment(u, 200000, T2);
    expect(paidAmount(u)).toBe(500000);
    expect(u.payments!.map((p) => [p.amount, p.paidAt])).toEqual([[300000, T1.toISOString()], [200000, T2.toISOString()]]);
    u = addPayment(u, 500000, T2);
    expect(u.isSettled).toBe(true);
    expect(remainingAmount(u)).toBe(0);
    expect(lastPaidAt(u)).toBe(T2.toISOString());
  });

  it('«تسویه کامل» کل مانده را پرداخت می‌کند', () => {
    const partial = addPayment(unit(), 250000, T1);
    const done = settleFully(partial, T2);
    expect(done.isSettled).toBe(true);
    expect(done.payments![done.payments!.length - 1]).toMatchObject({ amount: 750000, paidAt: T2.toISOString() });
    // واحد پرداخت‌نشده
    expect(settleFully(unit(), T1).payments).toEqual([expect.objectContaining({ amount: 1000000 })]);
  });

  it('اعتبارسنجی مبلغ پرداخت', () => {
    expect(validatePayment(unit(), null)).toBe(PaymentErrors.empty);
    expect(validatePayment(unit(), 0)).toBe(PaymentErrors.invalid);
    expect(validatePayment(unit(), -5)).toBe(PaymentErrors.invalid);
    expect(validatePayment(unit(), 1000001)).toContain('بیشتر از مانده');
    expect(validatePayment(unit(), 1000000)).toBeNull();
    expect(validatePayment(unit({ isSettled: true }), 5)).toBe(PaymentErrors.alreadySettled);
    expect(() => addPayment(unit(), 2000000)).toThrow();
  });

  it('حذف پرداخت‌ها واحد را به «پرداخت‌نشده» برمی‌گرداند (شامل داده قدیمی)', () => {
    const c = clearPayments(unit({ isSettled: true }));
    expect(c).toMatchObject({ isSettled: false, payments: [] });
    expect(remainingAmount(c)).toBe(1000000);
  });

  it('تشخیص تسویه کامل قبض (برای هشدار قفل)', () => {
    const units = [unit(), unit({ id: 'u2', unitNumber: 2, isSettled: true })];
    expect(completesBill(units, settleFully(units[0]))).toBe(true);
    expect(completesBill(units, addPayment(units[0], 10))).toBe(false);
    const units2 = [unit(), unit({ id: 'u2', unitNumber: 2 })];
    expect(completesBill(units2, settleFully(units2[0]))).toBe(false);
  });
});
