/**
 * فیلترهای چندتایی (۱.۹): «سوابق» (سال، ماه، نوع هزینه، وضعیت)، «جمع قبض‌های ماه» (ماه)،
 * «پرداخت قبض‌ها» (سال، نوع هزینه) و نمودار دایره‌ای (نوع قبض).
 * قاعدهٔ مشترک: فهرست خالی («همه» یا هیچ تیک) = بدون فیلتر. «حذف‌شده» انحصاری است و با بقیه جمع نمی‌شود.
 * جمع و تعدادها همیشه از همان مجموعهٔ فیلترشده حساب می‌شوند.
 */
import type { BillWithUnits, ExpenseType } from '../models/types';
import { MONTHS } from '../models/constants';
import { isBillDeleted, isBillPaid } from './billPaid';
import { typeInfo } from './billTypes';
import type { StatusFilter } from './billFilter';
import { toPersianDigits } from './formatting';

export type StatusPick = Exclude<StatusFilter, 'all'>;

export interface MultiRecordsFilter {
  /** خالی = همهٔ سال‌های نمایان */
  years: number[];
  /** ۱..۱۲؛ خالی = همه */
  months: number[];
  /** خالی = همه */
  types: ExpenseType[];
  /** خالی = پرداخت‌شده + پرداخت‌نشده (بدون حذف‌شده)؛ ['deleted'] = فقط حذف‌شده‌ها */
  statuses: StatusPick[];
}

const uniqInts = (v: unknown, min: number, max: number): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= min && x <= max))].sort((a, b) => a - b) : [];

export function normalizeYears(v: unknown): number[] { return uniqInts(v, 1300, 1700); }
export function normalizeMonths(v: unknown): number[] { return uniqInts(v, 1, 12); }

export function normalizeStatuses(v: unknown): StatusPick[] {
  if (!Array.isArray(v)) return [];
  const s = new Set(v.filter((x): x is StatusPick => x === 'paid' || x === 'unpaid' || x === 'deleted'));
  if (s.has('deleted')) return ['deleted'];
  if (s.has('paid') && s.has('unpaid')) return [];
  return [...s];
}

export function matchesStatuses(bill: BillWithUnits['bill'], statuses: readonly StatusPick[]): boolean {
  const deleted = isBillDeleted(bill);
  if (statuses.includes('deleted')) return deleted;
  if (deleted) return false;
  if (statuses.length === 0) return true;
  return isBillPaid(bill) ? statuses.includes('paid') : statuses.includes('unpaid');
}

/** `visibleYears`: سال‌های قابل نمایش (بدون پنهان‌ها) وقتی سالی انتخاب نشده */
export function matchesMulti({ bill }: BillWithUnits, f: MultiRecordsFilter, visibleYears?: readonly number[]): boolean {
  if (f.years.length ? !f.years.includes(bill.year) : visibleYears ? !visibleYears.includes(bill.year) : false) return false;
  if (f.months.length && !f.months.includes(bill.month)) return false;
  if (f.types.length && !f.types.includes(bill.expenseType)) return false;
  return matchesStatuses(bill, f.statuses);
}

/** ترتیب: سال جدیدتر، ماه جدیدتر، سپس جدیدترین ثبت */
export function filterBillsMulti(items: BillWithUnits[], f: MultiRecordsFilter, visibleYears?: readonly number[]): BillWithUnits[] {
  return items
    .filter((x) => matchesMulti(x, f, visibleYears))
    .sort((a, b) => b.bill.year - a.bill.year || b.bill.month - a.bill.month || b.bill.createdAt.localeCompare(a.bill.createdAt));
}

export const hasActiveMulti = (f: MultiRecordsFilter): boolean =>
  f.months.length > 0 || f.types.length > 0 || f.statuses.length > 0;

/** خلاصهٔ فیلد بسته: «همه» / «مهر» / «۲ ماه (مهر، آبان)» / «۵ ماه (مهر، آبان، …)» */
export function multiSummary(labels: readonly string[], unit: string, max = 3): string {
  if (labels.length === 0) return 'همه';
  if (labels.length === 1) return labels[0];
  const shown = labels.slice(0, max).join('، ') + (labels.length > max ? '، …' : '');
  return `${toPersianDigits(labels.length)} ${unit} (${shown})`;
}

const STATUS_WORD: Record<StatusPick, string> = { paid: 'پرداخت‌شده', unpaid: 'پرداخت‌نشده', deleted: 'حذف‌شده' };

/** متن حالت خالی متناسب با فیلترها */
export function emptyMessageMulti(f: MultiRecordsFilter): string {
  const years = f.years.length ? f.years.map((y) => toPersianDigits(y)).join('، ') : '';
  const months = f.months.map((m) => MONTHS[m - 1]).join('، ');
  const where = [months, years ? `سال ${years}` : ''].filter(Boolean).join(' ') || 'این فهرست';
  const what = [f.types.map((t) => `«${typeInfo(t).label}»`).join('، '), f.statuses.map((s) => STATUS_WORD[s]).join(' یا ')].filter(Boolean).join(' ');
  if (!what) return `برای ${where} هنوز قبضی ثبت نشده است.`;
  return `در ${where} هیچ قبض ${what} پیدا نشد.`;
}

/** عنوان «جمع قبض‌های ماه»: یک ماه = نام ماه؛ چند ماه = «جمع N ماه» */
export function monthsHeading(months: readonly number[], year: number): string {
  if (months.length === 1) return `${MONTHS[months[0] - 1]} ${toPersianDigits(year)}`;
  if (months.length === 0) return `همهٔ ماه‌های ${toPersianDigits(year)}`;
  return `جمع ${toPersianDigits(months.length)} ماه`;
}
