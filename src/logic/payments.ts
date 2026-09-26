/**
 * پرداخت‌های هر واحد در هر قبض (تسویه کامل یا پرداخت مبلغ / پرداخت جزئی) — منطق خالص.
 *
 * مهاجرت داده‌های قدیمی (نسخه ۱.۱ و قبل): واحدی که فقط `isSettled = true` دارد و فهرست `payments` ندارد،
 * یک «پرداخت کامل» به مبلغ سهم خود با تاریخ نامشخص حساب می‌شود (بدون نیاز به بازنویسی داده‌ها).
 */
import type { Payment, Unit } from '../models/types';
import { newId } from './id';
import { formatAmount } from './formatting';

/** پرداخت‌های واحد (با مهاجرت خودکار وضعیت «تسویه» قدیمی به یک پرداخت کامل) */
export function unitPayments(u: Unit): Payment[] {
  if (Array.isArray(u.payments)) return u.payments;
  return u.isSettled ? [{ id: `${u.id}-legacy`, amount: u.shareAmount, paidAt: null }] : [];
}

/** جمع پرداخت‌ها (حداکثر به اندازه سهم) */
export function paidAmount(u: Unit): number {
  const sum = unitPayments(u).reduce((s, p) => s + p.amount, 0);
  return Math.min(sum, u.shareAmount);
}

/** مانده بدهی واحد در این قبض */
export function remainingAmount(u: Unit): number {
  return Math.max(0, u.shareAmount - unitPayments(u).reduce((s, p) => s + p.amount, 0));
}

/** تاریخ آخرین پرداخت (ISO) یا null */
export function lastPaidAt(u: Unit): string | null {
  const dates = unitPayments(u).map((p) => p.paidAt).filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** وضعیت تسویه همیشه از روی مانده محاسبه می‌شود */
export function withPayments(u: Unit, payments: Payment[]): Unit {
  const next: Unit = { ...u, payments };
  next.isSettled = remainingAmount(next) === 0;
  return next;
}

export const PaymentErrors = {
  empty: 'مبلغ پرداخت را وارد کنید.',
  invalid: 'مبلغ پرداخت باید عددی بزرگ‌تر از صفر باشد.',
  tooMuch: (remaining: number) => `مبلغ پرداخت نمی‌تواند بیشتر از مانده بدهی (${formatAmount(remaining)} تومان) باشد.`,
  alreadySettled: 'این واحد قبلاً تسویه شده است.',
};

/** بررسی مبلغ «پرداخت مبلغ»؛ در صورت خطا پیام فارسی برمی‌گرداند */
export function validatePayment(u: Unit, amount: number | null): string | null {
  const remaining = remainingAmount(u);
  if (remaining === 0) return PaymentErrors.alreadySettled;
  if (amount === null) return PaymentErrors.empty;
  if (!Number.isSafeInteger(amount) || amount <= 0) return PaymentErrors.invalid;
  if (amount > remaining) return PaymentErrors.tooMuch(remaining);
  return null;
}

/** «پرداخت مبلغ»: مبلغ واردشده از بدهی کم می‌شود (تاریخ پرداخت خودکار = اکنون) */
export function addPayment(u: Unit, amount: number, now: Date = new Date()): Unit {
  const err = validatePayment(u, amount);
  if (err) throw new Error(err);
  return withPayments(u, [...unitPayments(u), { id: newId(), amount, paidAt: now.toISOString() }]);
}

/** «تسویه کامل»: کل مانده به‌صورت خودکار پرداخت می‌شود */
export function settleFully(u: Unit, now: Date = new Date()): Unit {
  const remaining = remainingAmount(u);
  if (remaining === 0) return withPayments(u, unitPayments(u));
  return addPayment(u, remaining, now);
}

/** حذف همه پرداخت‌های واحد (برگرداندن به «پرداخت‌نشده»؛ فقط برای قبض قفل‌نشده) */
export function clearPayments(u: Unit): Unit {
  return withPayments(u, []);
}

/** آیا این پرداخت باعث تسویه کامل همه واحدهای قبض (و قفل آن) می‌شود؟ */
export function completesBill(units: Unit[], updated: Unit): boolean {
  if (!updated.isSettled) return false;
  const before = units.find((u) => u.id === updated.id);
  if (before?.isSettled) return false;
  return units.every((u) => (u.id === updated.id ? true : u.isSettled));
}
