/**
 * پرداخت بدهی یک واحد (از ۱.۷.۳) — منطق خالص.
 * بدهی واحد = مانده‌ی همهٔ قبض‌های حذف‌نشدهٔ تسویه‌نشدهٔ آن واحد (همان فهرست «بدهکاران»).
 * - «تسویه کامل»: برای هر قبض یک پرداخت به‌اندازهٔ کل مانده‌اش.
 * - «مبلغ دلخواه»: از قدیمی‌ترین قبض (سال، ماه، زمان ثبت) شروع و به‌ترتیب به جدیدتر؛ آخرین قبضِ لمس‌شده ممکن است جزئی بماند.
 * - مبلغ بیشتر از کل بدهی رد می‌شود (بدون اعتبار/بستانکاری)؛ همهٔ مبالغ عدد صحیح تومان‌اند (بدون گرد کردن).
 * - همهٔ پرداخت‌های یک عملیات یک `batchId` مشترک و یک تاریخ (اکنون) دارند؛ با `undoBatch` دقیقاً همان‌ها برمی‌گردند
 *   و وضعیت تسویه/قفل قبض‌ها دوباره از روی مانده محاسبه می‌شود.
 */
import type { Bill, BillWithUnits, ExpenseType, Payment, Unit } from '../models/types';
import { isBillDeleted } from './billPaid';
import { newId } from './id';
import { formatAmount } from './formatting';
import { paidAmount, remainingAmount, unitPayments, withPayments } from './payments';
import { allSettled } from './settlement';

export type AllocationKind = 'settled' | 'partial' | 'untouched';

export interface AllocationLine {
  billId: string;
  unitId: string;
  year: number;
  month: number;
  expenseType: ExpenseType;
  createdAt: string;
  /** سهم کامل واحد در این قبض */
  share: number;
  /** مانده پیش از این پرداخت */
  remainingBefore: number;
  /** مبلغی که در همین عملیات روی این قبض پرداخت می‌شود (۰ = دست‌نخورده) */
  pay: number;
  remainingAfter: number;
  kind: AllocationKind;
  /** آیا با این پرداخت همهٔ واحدهای این قبض تسویه و قبض قفل می‌شود؟ */
  locksBill: boolean;
}

export interface Allocation {
  unitNumber: number;
  mode: 'full' | 'amount';
  totalDebt: number;
  /** مجموع مبلغ پرداختی */
  amount: number;
  remainingDebt: number;
  lines: AllocationLine[];
  settledCount: number;
  partialCount: number;
  untouchedCount: number;
  /** تعداد قبض‌هایی که با این پرداخت قفل می‌شوند */
  locksCount: number;
}

export const UnitPayErrors = {
  noDebt: 'این واحد بدهی ندارد.',
  empty: 'مبلغ پرداخت را وارد کنید.',
  invalid: 'مبلغ پرداخت باید عددی بزرگ‌تر از صفر باشد.',
  tooMuch: (max: number) => `مبلغ پرداخت نمی‌تواند بیشتر از کل بدهی واحد (${formatAmount(max)} تومان) باشد.`,
};

interface OpenItem { bill: Bill; units: Unit[]; unit: Unit; remaining: number }

const byPeriod = (a: OpenItem, b: OpenItem) =>
  a.bill.year - b.bill.year || a.bill.month - b.bill.month || a.bill.createdAt.localeCompare(b.bill.createdAt);

/** قبض‌های دارای بدهی این واحد، قدیمی‌ترین اول (مثل گزارش بدهکاران) */
function openItems(bills: BillWithUnits[], unitNumber: number): OpenItem[] {
  const out: OpenItem[] = [];
  for (const { bill, units } of bills) {
    if (isBillDeleted(bill)) continue;
    const unit = units.find((u) => u.unitNumber === unitNumber);
    if (!unit || unit.vacant) continue;
    const remaining = remainingAmount(unit);
    if (remaining > 0) out.push({ bill, units, unit, remaining });
  }
  return out.sort(byPeriod);
}

/** کل بدهی واحد */
export function unitTotalDebt(bills: BillWithUnits[], unitNumber: number): number {
  return openItems(bills, unitNumber).reduce((s, i) => s + i.remaining, 0);
}

/** خطای مبلغ دلخواه (یا null) */
export function validateUnitPayAmount(totalDebt: number, amount: number | null): string | null {
  if (totalDebt <= 0) return UnitPayErrors.noDebt;
  if (amount === null) return UnitPayErrors.empty;
  if (!Number.isSafeInteger(amount) || amount <= 0) return UnitPayErrors.invalid;
  if (amount > totalDebt) return UnitPayErrors.tooMuch(totalDebt);
  return null;
}

function build(items: OpenItem[], unitNumber: number, mode: 'full' | 'amount', amount: number): Allocation {
  const totalDebt = items.reduce((s, i) => s + i.remaining, 0);
  let left = amount;
  const lines: AllocationLine[] = items.map((it) => {
    const pay = Math.min(it.remaining, left);
    left -= pay;
    const remainingAfter = it.remaining - pay;
    const settledNow = remainingAfter === 0;
    const othersSettled = it.units.every((u) => u.id === it.unit.id || u.isSettled);
    return {
      billId: it.bill.id, unitId: it.unit.id, year: it.bill.year, month: it.bill.month, expenseType: it.bill.expenseType,
      createdAt: it.bill.createdAt, share: it.unit.shareAmount, remainingBefore: it.remaining, pay, remainingAfter,
      kind: pay === 0 ? 'untouched' : settledNow ? 'settled' : 'partial',
      locksBill: settledNow && pay > 0 && othersSettled && !it.bill.isFullySettled,
    };
  });
  return {
    unitNumber, mode, totalDebt, amount, remainingDebt: totalDebt - amount, lines,
    settledCount: lines.filter((l) => l.kind === 'settled').length,
    partialCount: lines.filter((l) => l.kind === 'partial').length,
    untouchedCount: lines.filter((l) => l.kind === 'untouched').length,
    locksCount: lines.filter((l) => l.locksBill).length,
  };
}

/** «تسویه کامل»: همهٔ بدهی‌های واحد (یک پرداخت برای هر قبض) */
export function allocateFull(bills: BillWithUnits[], unitNumber: number): Allocation {
  const items = openItems(bills, unitNumber);
  if (items.length === 0) throw new Error(UnitPayErrors.noDebt);
  return build(items, unitNumber, 'full', items.reduce((s, i) => s + i.remaining, 0));
}

/** «مبلغ دلخواه»: از قدیمی‌ترین قبض کم می‌شود؛ در صورت خطا پیام فارسی پرتاب می‌شود */
export function allocateOldestFirst(bills: BillWithUnits[], unitNumber: number, amount: number): Allocation {
  const items = openItems(bills, unitNumber);
  const err = validateUnitPayAmount(items.reduce((s, i) => s + i.remaining, 0), amount);
  if (err) throw new Error(err);
  return build(items, unitNumber, 'amount', amount);
}

/** نسخهٔ بدون پرتاب برای پیش‌نمایش زنده: خطا یا تخصیص */
export function previewAllocation(
  bills: BillWithUnits[], unitNumber: number, mode: 'full' | 'amount', amount: number | null,
): { error: string | null; allocation: Allocation | null } {
  const items = openItems(bills, unitNumber);
  const total = items.reduce((s, i) => s + i.remaining, 0);
  if (total <= 0) return { error: UnitPayErrors.noDebt, allocation: null };
  if (mode === 'full') return { error: null, allocation: build(items, unitNumber, 'full', total) };
  const err = validateUnitPayAmount(total, amount);
  return err ? { error: err, allocation: null } : { error: null, allocation: build(items, unitNumber, 'amount', amount!) };
}

export interface BillChange { bill: Bill; units: Unit[] }

/**
 * اعمال تخصیص: فقط قبض‌هایی که پرداخت دارند برمی‌گردند (واحدهای دیگر دست‌نخورده)؛
 * وضعیت `isFullySettled` قبض از روی واحدها دوباره محاسبه می‌شود. ورودی تغییر نمی‌کند.
 */
export function applyAllocation(bills: BillWithUnits[], allocation: Allocation, batchId: string, now: Date = new Date()): BillChange[] {
  const out: BillChange[] = [];
  const paidAt = now.toISOString();
  for (const line of allocation.lines) {
    if (line.pay <= 0) continue;
    const src = bills.find((b) => b.bill.id === line.billId);
    if (!src) throw new Error('قبض پیدا نشد.');
    const units = src.units.map((u) => {
      if (u.id !== line.unitId) return u;
      if (remainingAmount(u) < line.pay) throw new Error('مانده بدهی تغییر کرده است؛ دوباره تلاش کنید.');
      const p: Payment = { id: newId(), amount: line.pay, paidAt, batchId };
      return withPayments(u, [...unitPayments(u), p]);
    });
    out.push({ bill: { ...src.bill, isFullySettled: allSettled(units) }, units });
  }
  return out;
}

/** لغو یک عملیات پرداخت: فقط پرداخت‌های همان `batchId` حذف می‌شوند (حذف‌شده‌ها هم بررسی می‌شوند) */
export function undoBatch(bills: BillWithUnits[], batchId: string): BillChange[] {
  const out: BillChange[] = [];
  for (const { bill, units } of bills) {
    let touched = false;
    const next = units.map((u) => {
      if (!Array.isArray(u.payments) || !u.payments.some((p) => p.batchId === batchId)) return u;
      touched = true;
      return withPayments(u, u.payments.filter((p) => p.batchId !== batchId));
    });
    if (touched) out.push({ bill: { ...bill, isFullySettled: allSettled(next) }, units: next });
  }
  return out;
}

export interface UnitBatch {
  batchId: string;
  /** زمان ثبت (ISO) یا null */
  paidAt: string | null;
  total: number;
  billCount: number;
}

/** عملیات‌های پرداخت (دارای batchId) این واحد، جدیدترین اول */
export function listUnitBatches(bills: BillWithUnits[], unitNumber: number): UnitBatch[] {
  const map = new Map<string, UnitBatch>();
  for (const { units } of bills) {
    const u = units.find((x) => x.unitNumber === unitNumber);
    if (!u || !Array.isArray(u.payments)) continue;
    for (const p of u.payments) {
      if (!p.batchId) continue;
      const b = map.get(p.batchId) ?? { batchId: p.batchId, paidAt: p.paidAt, total: 0, billCount: 0 };
      b.total += p.amount;
      b.billCount += 1;
      if (p.paidAt && (!b.paidAt || p.paidAt > b.paidAt)) b.paidAt = p.paidAt;
      map.set(p.batchId, b);
    }
  }
  return [...map.values()].sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''));
}

export { paidAmount };
