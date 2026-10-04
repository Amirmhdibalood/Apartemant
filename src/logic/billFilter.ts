/**
 * فیلترهای صفحه «سوابق» (از نسخه ۱.۵.۰) — منطق خالص.
 * سال (مثل قبل) + ماه («همه» یا یک ماه) + نوع هزینه («همه» یا یکی از ۸ نوع) + وضعیت؛ ترکیب با AND.
 * وضعیت «همه» (پیش‌فرض) = پرداخت‌شده + پرداخت‌نشده، بدون حذف‌شده‌ها؛ حذف‌شده‌ها فقط با انتخاب صریح «حذف‌شده».
 */
import type { BillWithUnits, ExpenseType } from '../models/types';
import { EXPENSE_TYPES, EXPENSE_TYPE_ORDER, MONTHS } from '../models/constants';
import { isBillDeleted, isBillPaid } from './billPaid';

export type StatusFilter = 'all' | 'paid' | 'unpaid' | 'deleted';

export interface RecordsFilter {
  year: number;
  /** ۱..۱۲ یا null = همه ماه‌ها */
  month: number | null;
  /** نوع هزینه یا null = همه انواع */
  type: ExpenseType | null;
  /** وضعیت (پیش‌فرض all) */
  status: StatusFilter;
}

export const ALL_LABEL = 'همه';

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: ALL_LABEL },
  { value: 'paid', label: 'پرداخت‌شده' },
  { value: 'unpaid', label: 'پرداخت‌نشده' },
  { value: 'deleted', label: 'حذف‌شده' },
];

/** تبدیل مقدار خام (مسیر/کشو) به ماه معتبر یا null (= همه) */
export function normalizeMonth(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12 ? v : null;
}

/** تبدیل مقدار خام به نوع هزینه معتبر یا null (= همه) */
export function normalizeType(v: unknown): ExpenseType | null {
  return typeof v === 'string' && v in EXPENSE_TYPES ? (v as ExpenseType) : null;
}

export function normalizeStatus(v: unknown): StatusFilter {
  return v === 'paid' || v === 'unpaid' || v === 'deleted' ? v : 'all';
}

export function matchesStatus(bill: BillWithUnits['bill'], status: StatusFilter): boolean {
  const deleted = isBillDeleted(bill);
  if (status === 'deleted') return deleted;
  if (deleted) return false;
  if (status === 'paid') return isBillPaid(bill);
  if (status === 'unpaid') return !isBillPaid(bill);
  return true;
}

export function matchesFilter({ bill }: BillWithUnits, f: RecordsFilter): boolean {
  return bill.year === f.year
    && (f.month === null || bill.month === f.month)
    && (f.type === null || bill.expenseType === f.type)
    && matchesStatus(bill, f.status);
}

/** اعمال فیلترها؛ ترتیب: ماه جدیدتر اول، سپس جدیدترین ثبت */
export function filterBills(items: BillWithUnits[], f: RecordsFilter): BillWithUnits[] {
  return items
    .filter((x) => matchesFilter(x, f))
    .sort((a, b) => b.bill.month - a.bill.month || b.bill.createdAt.localeCompare(a.bill.createdAt));
}

/** paid + unpaid = count (قبض حذف‌شده پرداخت‌نشده حساب می‌شود؛ مهلت پرداخت در این تقسیم نقشی ندارد) */
export interface RecordsSummary { count: number; total: number; paid: number; unpaid: number }

export function summarizeBills(items: BillWithUnits[]): RecordsSummary {
  const paid = items.filter((x) => isBillPaid(x.bill)).length;
  return {
    count: items.length,
    total: items.reduce((s, x) => s + x.bill.totalAmount, 0),
    paid,
    unpaid: items.length - paid,
  };
}

export const hasActiveFilters = (f: RecordsFilter): boolean => f.month !== null || f.type !== null || f.status !== 'all';

const STATUS_WORD: Record<StatusFilter, string> = { all: '', paid: 'پرداخت‌شده', unpaid: 'پرداخت‌نشده', deleted: 'حذف‌شده' };

/** متن حالت خالی متناسب با فیلترها */
export function emptyMessage(f: RecordsFilter): string {
  const y = String(f.year);
  const where = f.month === null ? `سال ${y}` : `${MONTHS[f.month - 1]} ${y}`;
  const what = [f.type ? `«${EXPENSE_TYPES[f.type].label}»` : '', STATUS_WORD[f.status]].filter(Boolean).join(' ');
  if (!what) return f.month === null ? `برای سال ${y} هنوز قبضی ثبت نشده است.` : `برای ${where} هنوز قبضی ثبت نشده است.`;
  return `در ${where} هیچ قبض ${what} پیدا نشد.`;
}

/** گزینه‌های کشوی نوع هزینه: همه + ۸ نوع (به ترتیب نمایش برنامه) */
export const TYPE_FILTER_OPTIONS: { value: ExpenseType | null; label: string }[] = [
  { value: null, label: ALL_LABEL },
  ...EXPENSE_TYPE_ORDER.map((t) => ({ value: t, label: EXPENSE_TYPES[t].label })),
];

/** گزینه‌های کشوی ماه: همه + فروردین..اسفند */
export const MONTH_FILTER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: ALL_LABEL },
  ...MONTHS.map((m, i) => ({ value: i + 1, label: m })),
];
