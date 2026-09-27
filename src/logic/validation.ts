/**
 * اعتبارسنجی فرم قبض — فقط لیست خطاها را برمی‌گرداند (بدون UI)
 */
import type { BillDraft } from '../models/types';
import { Errors, type AppError } from './errors';
import { onlyDigits } from './formatting';

export interface ValidDraft {
  totalAmount: number;
  personCounts: number[];
}

export type ValidationResult =
  | { ok: true; value: ValidDraft }
  | { ok: false; errors: AppError[] };

export function validateDraft(draft: BillDraft): ValidationResult {
  const errors: AppError[] = [];

  if (!draft.year) errors.push(Errors.requiredMissing('سال'));
  if (!draft.month || draft.month < 1 || draft.month > 12) errors.push(Errors.requiredMissing('ماه'));
  if (!draft.expenseType) errors.push(Errors.requiredMissing('نوع هزینه'));

  let totalAmount = 0;
  const amountDigits = onlyDigits(draft.amountDigits);
  if (amountDigits === '') {
    errors.push(Errors.amountMissing());
  } else {
    const n = Number(amountDigits);
    if (!Number.isSafeInteger(n) || n <= 0) errors.push(Errors.amountInvalid());
    else totalAmount = n;
  }

  const personCounts: number[] = [];
  if (draft.personCounts.length === 0) {
    errors.push(Errors.noUnits());
  } else {
    const perUnit = draft.splitMethod === 'perUnit';
    draft.personCounts.forEach((raw, i) => {
      const unitNumber = i + 1;
      const digits = onlyDigits(raw ?? '');
      const valid = raw.trim() !== '' && digits === raw.trim() && Number(digits) > 0;
      if (perUnit) {
        // «بر اساس واحد»: نفرات در محاسبه اثری ندارد؛ نفرات معتبر حفظ و خالی/نامعتبر با ۱ ذخیره می‌شود
        personCounts.push(valid ? Number(digits) : 1);
      } else if (raw.trim() === '') {
        errors.push(Errors.personCountMissing(unitNumber));
      } else if (digits !== raw.trim() || Number(digits) <= 0) {
        errors.push(Errors.personCountInvalid(unitNumber));
      } else {
        personCounts.push(Number(digits));
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { totalAmount, personCounts } };
}
