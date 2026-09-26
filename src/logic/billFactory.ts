/**
 * ساخت Entityهای Bill و Unit از روی فرم + نتیجه محاسبه (منطق خالص)
 */
import type { Bill, BillDraft, BillWithUnits, Unit } from '../models/types';
import type { CalculationResult } from './calculation';
import { newId } from './id';
import { allSettled } from './settlement';

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
    return {
      id: prev?.id ?? newId(),
      billId: id,
      unitNumber: s.unitNumber,
      personCount: s.personCount,
      shareAmount: s.shareAmount,
      isSettled: prev?.isSettled ?? false,
    };
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
  };
}

export function emptyDraft(year: number, month: number): BillDraft {
  return {
    editingBillId: null,
    year,
    month,
    expenseType: null,
    billNumber: '',
    description: '',
    amountDigits: '',
    personCounts: [''],
  };
}
