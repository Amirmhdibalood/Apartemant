/**
 * ساخت Entityهای Bill و Unit از روی فرم + نتیجه محاسبه (منطق خالص)
 */
import type { Bill, BillDraft, BillWithUnits, BuildingSettings, Unit } from '../models/types';
import type { CalculationResult } from './calculation';
import { newId } from './id';
import { allSettled } from './settlement';
import { splitMethodOf } from './split';
import { DEFAULT_SPLIT_METHOD } from '../models/constants';
import { unitPayments, withPayments } from './payments';
import { parseJalaliKey } from './jalali';
import { draftUnitsFromBuilding, sanitizeAlias } from './building';

export function buildBill(
  draft: BillDraft,
  calc: CalculationResult,
  existing: BillWithUnits | null,
  now: Date = new Date(),
): BillWithUnits {
  const id = existing?.bill.id ?? newId();
  const units: Unit[] = calc.shares.map((s, i) => {
    // در حالت ویرایش، وضعیت تسویه واحدهای موجود (بر اساس شماره واحد) حفظ می‌شود
    const prev = existing?.units.find((u) => u.unitNumber === s.unitNumber);
    const unit: Unit = {
      id: prev?.id ?? newId(),
      billId: id,
      unitNumber: s.unitNumber,
      personCount: s.personCount,
      // عکس لحظه‌ای اسم مستعار واحد (تغییرات بعدی تنظیمات ساختمان روی این قبض اثری ندارد)
      alias: sanitizeAlias(draft.unitAliases?.[i]),
      ...(draft.unitVacant?.[i] === true ? { vacant: true } : {}),
      shareAmount: s.shareAmount,
      // واحد بدون سهم (واحد خالی) بدهی ندارد
      isSettled: s.shareAmount === 0 ? true : prev?.isSettled ?? false,
    };
    if (s.shareAmount === 0) return unit;
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
    // «پرداخت شد» خودِ قبض در ویرایش حفظ می‌شود (قبض جدید = پرداخت‌نشده)
    billPaid: existing?.bill.billPaid === true,
    billPaidDate: existing?.bill.billPaid === true ? existing.bill.billPaidDate ?? null : null,
    dueDate: parseJalaliKey(draft.dueDate) ? draft.dueDate! : null,
    deletedAt: null,
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
    unitAliases: x.units.map((u) => sanitizeAlias(u.alias)),
    unitVacant: x.units.map((u) => u.vacant === true),
    splitMethod: splitMethodOf(x.bill),
    splitChosen: true,
    dueDate: parseJalaliKey(x.bill.dueDate) ? x.bill.dueDate! : null,
  };
}

/** تعداد نفرات پیش‌فرض هر واحد جدید */
export const DEFAULT_PERSON_COUNT = '1';

/**
 * فرم خالی قبض جدید. واحدها (تعداد، اسم مستعار و نفرات پیش‌فرض) از تنظیمات «ساختمان» پر می‌شوند؛
 * بدون تنظیمات: یک واحد با ۱ نفر. در فرم می‌توان واحد افزود/حذف کرد (فقط برای همین قبض).
 */
export function emptyDraft(year: number, month: number, building?: BuildingSettings | null): BillDraft {
  const rows = building && building.units.length > 0 ? draftUnitsFromBuilding(building) : { personCounts: [DEFAULT_PERSON_COUNT], unitAliases: [null], unitVacant: [false] };
  return {
    editingBillId: null,
    year,
    month,
    expenseType: null,
    billNumber: '',
    description: '',
    amountDigits: '',
    personCounts: rows.personCounts,
    unitAliases: rows.unitAliases,
    unitVacant: rows.unitVacant,
    splitMethod: DEFAULT_SPLIT_METHOD,
  };
}

/** اسم‌های مستعار هم‌ردیف با نفرات (برای فرم‌های قدیمی بدون unitAliases) */
export function draftAliases(draft: Pick<BillDraft, 'personCounts' | 'unitAliases'>): (string | null)[] {
  return draft.personCounts.map((_, i) => sanitizeAlias(draft.unitAliases?.[i]));
}

/** پرچم‌های «خالی» هم‌ردیف با نفرات (برای فرم‌های قدیمی بدون unitVacant) */
export function draftVacant(draft: Pick<BillDraft, 'personCounts' | 'unitVacant'>): boolean[] {
  return draft.personCounts.map((_, i) => draft.unitVacant?.[i] === true);
}

/** افزودن واحد در فرم (فقط برای همین قبض)؛ واحد جدید بدون اسم مستعار = «واحد N» */
export function addDraftUnit(draft: BillDraft, persons: string = DEFAULT_PERSON_COUNT): BillDraft {
  return { ...draft, personCounts: [...draft.personCounts, persons], unitAliases: [...draftAliases(draft), null], unitVacant: [...draftVacant(draft), false] };
}

/** حذف یک واحد از فرم؛ اسم مستعار همراه ردیف خودش جابه‌جا می‌شود (شماره واحدهای بعدی یکی کم می‌شود) */
export function removeDraftUnit(draft: BillDraft, index: number): BillDraft {
  return {
    ...draft,
    personCounts: draft.personCounts.filter((_, i) => i !== index),
    unitAliases: draftAliases(draft).filter((_, i) => i !== index),
    unitVacant: draftVacant(draft).filter((_, i) => i !== index),
  };
}
