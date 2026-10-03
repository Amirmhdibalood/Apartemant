/**
 * نحوه تقسیم قبض: «بر اساس نفرات» یا «بر اساس واحد» — منطق خالص.
 * در «بر اساس واحد» وزن هر واحد ۱ است؛ تعداد نفرات واقعی واحدها دست‌نخورده ذخیره می‌شود.
 */
import type { Bill, ExpenseType, SplitMethod } from '../models/types';
import { DEFAULT_SPLIT_METHOD, EXPENSE_TYPES } from '../models/constants';
import { calculateShares, type CalculationResult } from './calculation';

export const isSplitMethod = (v: unknown): v is SplitMethod => v === 'perPerson' || v === 'perUnit';

/** نحوه تقسیم یک قبض (قبض‌های قدیمی = بر اساس نفرات) */
export function splitMethodOf(bill: Pick<Bill, 'splitMethod'>): SplitMethod {
  return isSplitMethod(bill.splitMethod) ? bill.splitMethod : DEFAULT_SPLIT_METHOD;
}

/** وزن هر واحد در محاسبه */
export function splitWeights(personCounts: number[], method: SplitMethod, vacant?: boolean[]): number[] {
  // واحد خالی (از ۱.۶.۳) در هیچ‌کدام از دو روش تقسیم وزن ندارد
  return personCounts.map((n, i) => (vacant?.[i] ? 0 : method === 'perUnit' ? 1 : n));
}

export interface SplitCalculation extends CalculationResult {
  splitMethod: SplitMethod;
}

/**
 * محاسبه سهم‌ها با نحوه تقسیم. در خروجی `shares[i].personCount` همیشه تعداد نفرات واقعی واحد است
 * و `totalPersons` / `perPersonExact` در حالت «بر اساس واحد» یعنی تعداد واحدها / سهم هر واحد.
 */
export function calculateBySplit(totalAmount: number, personCounts: number[], method: SplitMethod, vacant?: boolean[]): SplitCalculation {
  const weights = splitWeights(personCounts, method, vacant);
  const r = calculateShares(totalAmount, weights.map((w, i) => ({ unitNumber: i + 1, personCount: w })));
  return { ...r, splitMethod: method, shares: r.shares.map((s, i) => ({ ...s, personCount: personCounts[i] })) };
}

/** پیش‌فرض نحوه تقسیم برای هر نوع هزینه (آخرین روش استفاده‌شده) */
export type SplitDefaults = Partial<Record<ExpenseType, SplitMethod>>;

export function sanitizeSplitDefaults(input: unknown): SplitDefaults {
  const out: SplitDefaults = {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k in EXPENSE_TYPES && isSplitMethod(v)) out[k as ExpenseType] = v;
  }
  return out;
}

export function defaultSplitFor(type: ExpenseType | null, defaults: SplitDefaults): SplitMethod {
  return (type && defaults[type]) || DEFAULT_SPLIT_METHOD;
}
