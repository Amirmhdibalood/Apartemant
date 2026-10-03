/**
 * اعتبارسنجی فرم قبض — فقط لیست خطاها را برمی‌گرداند (بدون UI)
 */
import type { BillDraft } from '../models/types';
import { Errors, type AppError } from './errors';
import { onlyDigits } from './formatting';
import { parseArea } from './area';

export interface ValidDraft {
  totalAmount: number;
  personCounts: number[];
  /** واحد خالی بودن هر ردیف (هم‌ردیف personCounts) */
  vacant: boolean[];
  /** متراژ معتبر هر ردیف (هم‌ردیف personCounts)؛ ذخیره‌نشده/نامعتبر = null — در «بر اساس متراژ» برای همه واحدهای غیرخالی عدد است */
  areas: (number | null)[];
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
  const vacant: boolean[] = draft.personCounts.map((_, i) => draft.unitVacant?.[i] === true);
  if (draft.personCounts.length === 0) {
    errors.push(Errors.noUnits());
  } else {
    // «بر اساس واحد» و «بر اساس متراژ»: نفرات در محاسبه اثری ندارد
    const perUnit = draft.splitMethod === 'perUnit' || draft.splitMethod === 'perArea';
    let hadPersonError = false;
    draft.personCounts.forEach((raw, i) => {
      const unitNumber = i + 1;
      const t = (raw ?? '').trim();
      const digits = onlyDigits(t);
      // از نسخه ۱.۶.۰ صفر مجاز است (واحد خالی)
      const valid = t !== '' && digits === t && Number.isSafeInteger(Number(digits));
      if (vacant[i]) {
        // واحد خالی: نفراتش در محاسبه اثری ندارد؛ مقدار معتبر حفظ و در غیر این صورت ۰ ذخیره می‌شود
        personCounts.push(valid ? Number(digits) : 0);
      } else if (perUnit) {
        // «بر اساس واحد»: نفرات در محاسبه اثری ندارد؛ نفرات معتبر حفظ و خالی/نامعتبر با ۱ ذخیره می‌شود
        personCounts.push(valid ? Number(digits) : 1);
      } else if (t === '') {
        hadPersonError = true;
        errors.push(Errors.personCountMissing(unitNumber));
      } else if (!valid) {
        hadPersonError = true;
        errors.push(Errors.personCountInvalid(unitNumber));
      } else {
        personCounts.push(Number(digits));
      }
    });
    if (draft.splitMethod === 'perArea') {
      draft.personCounts.forEach((_, i) => {
        if (vacant[i]) return;
        const raw = (draft.unitAreas?.[i] ?? '').trim();
        if (raw === '') errors.push(Errors.areaMissing(i + 1));
        else if (parseArea(raw) === null) errors.push(Errors.areaInvalid(i + 1));
      });
    }
    if (vacant.every(Boolean)) errors.push(Errors.allVacant());
    else if (!perUnit && !hadPersonError && personCounts.reduce((s, n, i) => s + (vacant[i] ? 0 : n), 0) <= 0) errors.push(Errors.noPersons());
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { totalAmount, personCounts, vacant, areas: draft.personCounts.map((_, i) => parseArea(draft.unitAreas?.[i] ?? null)) } };
}
