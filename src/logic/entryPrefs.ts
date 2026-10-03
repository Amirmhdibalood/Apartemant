/**
 * «انواع قبض و روش‌های محاسبه» (از نسخه ۱.۶.۸) — کدام نوع هزینه و کدام روش تقسیم در برنامه فعال است. منطق خالص.
 * - نوع خاموش: در فرم ثبت قبض نیست و قبض‌هایش از همهٔ فهرست‌ها، فیلترها، گزارش‌ها و جمع‌ها کنار می‌رود
 *   (داده هرگز پاک نمی‌شود؛ با روشن کردن دوباره برمی‌گردد).
 * - روش خاموش: فقط در انتخاب نحوه تقسیم فرم ثبت قبض نیست (اگر تنها یک روش فعال باشد، انتخابگر پنهان و همان روش استفاده می‌شود).
 * - دست‌کم یک نوع و یک روش باید فعال بماند. فقط ترجیح همین گوشی است و داخل فایل پشتیبان نیست.
 */
import type { BillWithUnits, ExpenseType, SplitMethod } from '../models/types';
import { EXPENSE_TILE_ROWS, EXPENSE_TYPES, EXPENSE_TYPE_ORDER } from '../models/constants';
import { ALL_LABEL } from './billFilter';

export const ALL_SPLIT_METHODS: SplitMethod[] = ['perPerson', 'perUnit', 'perArea'];

export interface EntryPrefs {
  /** انواع فعال (به ترتیب EXPENSE_TYPE_ORDER، حداقل یکی) */
  types: ExpenseType[];
  /** روش‌های فعال (به ترتیب ALL_SPLIT_METHODS، حداقل یکی) */
  methods: SplitMethod[];
}

export const DEFAULT_ENTRY_PREFS: EntryPrefs = { types: [...EXPENSE_TYPE_ORDER], methods: [...ALL_SPLIT_METHODS] };

/** مقدار ذخیره‌شدهٔ خراب/ناقص ← فقط موارد معتبر؛ اگر چیزی نماند ← همه فعال */
export function sanitizeEntryPrefs(raw: unknown): EntryPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { types?: unknown; methods?: unknown };
  const types = Array.isArray(o.types) ? EXPENSE_TYPE_ORDER.filter((t) => (o.types as unknown[]).includes(t)) : [];
  const methods = Array.isArray(o.methods) ? ALL_SPLIT_METHODS.filter((m) => (o.methods as unknown[]).includes(m)) : [];
  return {
    types: types.length ? types : [...EXPENSE_TYPE_ORDER],
    methods: methods.length ? methods : [...ALL_SPLIT_METHODS],
  };
}

/** روشن/خاموش کردن یک نوع؛ خاموش کردن آخرین نوع فعال نادیده گرفته می‌شود */
export function setTypeEnabled(p: EntryPrefs, type: ExpenseType, on: boolean): EntryPrefs {
  const set = new Set(p.types);
  if (on) set.add(type);
  else if (set.size > 1) set.delete(type);
  return { ...p, types: EXPENSE_TYPE_ORDER.filter((t) => set.has(t)) };
}

export function setMethodEnabled(p: EntryPrefs, method: SplitMethod, on: boolean): EntryPrefs {
  const set = new Set(p.methods);
  if (on) set.add(method);
  else if (set.size > 1) set.delete(method);
  return { ...p, methods: ALL_SPLIT_METHODS.filter((m) => set.has(m)) };
}

export const isTypeEnabled = (p: EntryPrefs, t: ExpenseType | null | undefined): boolean => !!t && p.types.includes(t);
export const isMethodEnabled = (p: EntryPrefs, m: SplitMethod): boolean => p.methods.includes(m);

/** روش یادآوری‌شده/انتخاب‌شده اگر خاموش است ← اولین روش فعال */
export function resolveMethod(p: EntryPrefs, method: SplitMethod): SplitMethod {
  return p.methods.includes(method) ? method : p.methods[0];
}

/** فقط قبض‌های نوع فعال (برای فهرست‌ها، گزارش‌ها، جمع‌ها و هشدارها) — داده دست‌نخورده می‌ماند */
export function visibleBills<T extends { bill: { expenseType: ExpenseType } }>(all: T[], p: EntryPrefs): T[] {
  if (p.types.length === EXPENSE_TYPE_ORDER.length) return all;
  return all.filter((b) => p.types.includes(b.bill.expenseType));
}
export function visibleBillList<T extends { expenseType: ExpenseType }>(bills: T[], p: EntryPrefs): T[] {
  if (p.types.length === EXPENSE_TYPE_ORDER.length) return bills;
  return bills.filter((b) => p.types.includes(b.expenseType));
}

/** گزینه‌های کشوی نوع هزینه در فیلترها: همه + انواع فعال */
export function typeFilterOptions(p: EntryPrefs): { value: ExpenseType | null; label: string }[] {
  return [{ value: null, label: ALL_LABEL }, ...p.types.map((t) => ({ value: t as ExpenseType | null, label: EXPENSE_TYPES[t].label }))];
}

/** مقدار فیلتر نوعِ خاموش ← null (همه) */
export function activeTypeFilter(p: EntryPrefs, type: ExpenseType | null): ExpenseType | null {
  return type && p.types.includes(type) ? type : null;
}

/** چیدمان کاشی‌های فرم: انواع فعال به ترتیب معمول، ۳ تا در هر ردیف (ردیف آخر ممکن است ۱ یا ۲ تایی باشد) */
export function tileRows(p: EntryPrefs): ExpenseType[][] {
  const order = EXPENSE_TILE_ROWS.flat().filter((t) => p.types.includes(t));
  const rows: ExpenseType[][] = [];
  for (let i = 0; i < order.length; i += 3) rows.push(order.slice(i, i + 3));
  return rows;
}

export type { BillWithUnits };
