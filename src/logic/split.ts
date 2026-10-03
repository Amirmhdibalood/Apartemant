/**
 * نحوه تقسیم قبض: «بر اساس نفرات» یا «بر اساس واحد» — منطق خالص.
 * در «بر اساس واحد» وزن هر واحد ۱ است؛ تعداد نفرات واقعی واحدها دست‌نخورده ذخیره می‌شود.
 */
import type { Bill, ExpenseType, SplitMethod } from '../models/types';
import { DEFAULT_SPLIT_METHOD, EXPENSE_TYPES } from '../models/constants';
import { calculateShares, type CalculationResult } from './calculation';
import { areaToMilli, parseArea, AREA_SCALE } from './area';

export const isSplitMethod = (v: unknown): v is SplitMethod => v === 'perPerson' || v === 'perUnit' || v === 'perArea';

/** نحوه تقسیم یک قبض (قبض‌های قدیمی = بر اساس نفرات) */
export function splitMethodOf(bill: Pick<Bill, 'splitMethod'>): SplitMethod {
  return isSplitMethod(bill.splitMethod) ? bill.splitMethod : DEFAULT_SPLIT_METHOD;
}

/**
 * وزن هر واحد در محاسبه. در «بر اساس متراژ» وزن = متراژ مقیاس‌شده به عدد صحیح (هزارم مترمربع)؛
 * واحد خالی در هر سه روش وزن ندارد. متراژ نامعتبر یک واحد غیرخالی خطا می‌دهد.
 */
export function splitWeights(personCounts: number[], method: SplitMethod, vacant?: boolean[], areas?: (number | null | undefined)[]): number[] {
  // واحد خالی (از ۱.۶.۳) در هیچ‌کدام از روش‌های تقسیم وزن ندارد
  return personCounts.map((n, i) => {
    if (vacant?.[i]) return 0;
    if (method === 'perUnit') return 1;
    if (method === 'perArea') {
      const a = parseArea(areas?.[i] ?? null);
      if (a === null) throw new Error(`area missing for unit ${i + 1}`);
      return areaToMilli(a);
    }
    return n;
  });
}

export interface SplitCalculation extends CalculationResult {
  splitMethod: SplitMethod;
  /** فقط «بر اساس متراژ»: جمع متراژ واحدهای غیرخالی (مترمربع) */
  totalArea?: number;
  /** فقط «بر اساس متراژ»: قیمت دقیق هر مترمربع (ممکن است اعشاری باشد) */
  pricePerArea?: number;
}

/**
 * محاسبه سهم‌ها با نحوه تقسیم. در خروجی `shares[i].personCount` همیشه تعداد نفرات واقعی واحد است
 * و `totalPersons` / `perPersonExact` در حالت «بر اساس واحد» یعنی تعداد واحدها / سهم هر واحد.
 * در «بر اساس متراژ»: `totalPersons` = تعداد واحدهای غیرخالی، `totalArea` = جمع متراژ (مترمربع)،
 * `pricePerArea` = مبلغ ÷ جمع متراژ و `perPersonExact` برابر همان قیمت هر مترمربع است؛
 * سهم‌ها با همان روش «بزرگ‌ترین باقیمانده» گرد می‌شوند (جمع سهم‌ها دقیقاً برابر مبلغ کل).
 */
export function calculateBySplit(totalAmount: number, personCounts: number[], method: SplitMethod, vacant?: boolean[], areas?: (number | null | undefined)[]): SplitCalculation {
  const weights = splitWeights(personCounts, method, vacant, areas);
  const r = calculateShares(totalAmount, weights.map((w, i) => ({ unitNumber: i + 1, personCount: w })));
  const base = { ...r, splitMethod: method, shares: r.shares.map((s, i) => ({ ...s, personCount: personCounts[i] })) };
  if (method !== 'perArea') return base;
  const totalArea = r.totalPersons / AREA_SCALE;
  return {
    ...base,
    totalPersons: weights.filter((w) => w > 0).length,
    totalArea,
    pricePerArea: totalAmount / totalArea,
    perPersonExact: totalAmount / totalArea,
    shares: base.shares.map((s, i) => ({ ...s, area: weights[i] > 0 ? weights[i] / AREA_SCALE : null })),
  };
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
