/**
 * ساخت Entityهای Bill و Unit از روی فرم + نتیجه محاسبه (منطق خالص)
 */
import type { Bill, BillDraft, BillWithUnits, Unit } from '../models/types';
import type { CalculationResult } from './calculation';
import { newId } from './id';
import { allSettled } from './settlement';
import { splitMethodOf } from './split';
import { DEFAULT_SPLIT_METHOD } from '../models/constants';
import { unitPayments, withPayments } from './payments';

export function buildBill(
  draft: BillDraft,
  calc: CalculationResult,
  existing: BillWithUnits | null,
  now: Date = new Date(),
): BillWithUnits {
  const id = existing?.bill.id ?? newId();
  const units: Unit[] = calc.shares.map((s) => {
    // در حالت ویرایش، وضعیت تسویه واحدهای موجود (بر اساس شماره واحد) حفظ می‌شود
    const prev = existing?.units.find((u) => u.unitNumber === s.unitNumber);
    const unit: Unit = {
      id: prev?.id ?? newId(),
      billId: id,
      unitNumber: s.unitNumber,
      personCount: s.personCount,
      shareAmount: s.shareAmount,
      isSettled: prev?.isSettled ?? false,
    };
    // در ویرایش، پرداخت‌های قبلی واحد حفظ و وضعیت تسویه با سهم جدید دوباره محاسبه می‌شود
    if (prev && (prev.payments || prev.isSettled)) {
      const kept = unitPayments(prev);
      return kept.length ? withPayments(unit, kept) : { ...unit, isSettled: false };
    }
    return unit;
  });
  const bill: Bill = {
    id,
    year: draft.year,
    month: draft.month,
    expenseType: draft.expenseType!,
    billNumber: draft.billNumber.trim() === '' ? null : draft.billNumber.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    totalAmount: calc.totalAmount,
    createdAt: existing?.bill.createdAt ?? now.toISOString(),
    isFullySettled: allSettled(units),
    splitMethod: draft.splitMethod ?? DEFAULT_SPLIT_METHOD,
  };
  return { bill, units };
}

/** تبدیل قبض ذخیره‌شده به فرم (برای ویرایش) */
export function draftFromBill(x: BillWithUnits): BillDraft {
  return {
    editingBillId: x.bill.id,
    year: x.bill.year,
    month: x.bill.month,
    expenseType: x.bill.expenseType,
    billNumber: x.bill.billNumber ?? '',
    description: x.bill.description ?? '',
    amountDigits: String(x.bill.totalAmount),
    personCounts: x.units.map((u) => String(u.personCount)),
    splitMethod: splitMethodOf(x.bill),
    splitChosen: true,
  };
}

/** تعداد نفرات پیش‌فرض هر واحد جدید */
export const DEFAULT_PERSON_COUNT = '1';

/**
 * فرم خالی قبض جدید. اگر الگوی واحدها (واحدهای آخرین قبض ذخیره‌شده) داده شود،
 * واحدها و تعداد نفراتشان از همان پر می‌شوند؛ وگرنه یک واحد با ۱ نفر.
 */
export function emptyDraft(year: number, month: number, unitTemplate?: number[] | null): BillDraft {
  const personCounts = unitTemplate && unitTemplate.length > 0 ? unitTemplate.map((n) => String(n)) : [DEFAULT_PERSON_COUNT];
  return {
    editingBillId: null,
    year,
    month,
    expenseType: null,
    billNumber: '',
    description: '',
    amountDigits: '',
    personCounts,
    splitMethod: DEFAULT_SPLIT_METHOD,
    prefilledUnits: unitTemplate && unitTemplate.length > 0 ? unitTemplate.length : undefined,
  };
}
