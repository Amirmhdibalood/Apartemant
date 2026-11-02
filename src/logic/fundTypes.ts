/**
 * قبض‌های واریزی به صندوق (برای هر ساختمان جدا).
 * قانون (تأیید مالک): تصمیم «واریز به صندوق» لحظهٔ ثبت هر پرداخت گرفته می‌شود؛ تغییر انتخاب فقط روی
 * پرداخت‌های بعدی اثر دارد و گردش قبلی صندوق هرگز عوض نمی‌شود.
 */
import type { ExpenseType } from '../models/types';
import { EXPENSE_TYPE_ORDER, isCustomTypeId, isExpenseType } from '../models/constants';
import { MAX_CUSTOM_TYPES, typeLabel } from './billTypes';

export const DEFAULT_FUND_TYPES: readonly ExpenseType[] = ['building'];

/** دلیل ردیف‌های واریزِ خودکار از پرداخت قبض (قدیمی: فقط شارژ) */
export const FUND_REASON_LEGACY_CHARGE = 'charge_bill';
export const FUND_REASON_BILL_PAYMENT = 'bill_payment';
export const BILL_DEPOSIT_REASONS: readonly string[] = [FUND_REASON_LEGACY_CHARGE, FUND_REASON_BILL_PAYMENT];

/**
 * فقط نوع‌های معتبر (۸ نوع داخلی یا شناسهٔ سفارشی با الگوی درست)، بدون تکرار؛ داخلی‌ها به ترتیب استاندارد،
 * بعد سفارشی‌ها به ترتیب ورودی. ورودی نامعتبر (غیرآرایه / عضو نامعتبر / بیش از حد) = null
 */
export function sanitizeFundTypes(raw: unknown): ExpenseType[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > (EXPENSE_TYPE_ORDER.length + MAX_CUSTOM_TYPES) * 2) return null;
  if (!raw.every((t) => isExpenseType(t) || isCustomTypeId(t))) return null;
  const set = new Set(raw as ExpenseType[]);
  const customs = [...new Set((raw as ExpenseType[]).filter(isCustomTypeId))];
  return [...EXPENSE_TYPE_ORDER.filter((t) => set.has(t)), ...customs];
}

/** مقدار ستون fund_types → فهرست؛ خراب = پیش‌فرض (فقط شارژ) */
export function parseFundTypesJson(text: unknown): ExpenseType[] {
  if (typeof text === 'string') {
    try {
      const v = sanitizeFundTypes(JSON.parse(text));
      if (v) return v;
    } catch { /* fallthrough */ }
  }
  return [...DEFAULT_FUND_TYPES];
}

export const fundTypesToJson = (types: readonly ExpenseType[]): string => JSON.stringify(sanitizeFundTypes([...types]) ?? [...DEFAULT_FUND_TYPES]);

/**
 * ترتیب و نام نوع‌ها عمداً پارامتر است (پیش‌فرض: ۸ نوع داخلی) تا نوع‌های تعریف‌شدهٔ کاربر بعداً بدون تغییر
 * این منطق اضافه شوند.
 */
type TypeOrder = readonly string[];

/** ترتیب نمایش در فهرست صندوق (موکاپ ۰۹): نوع پیش‌فرض بالا، بقیه به ترتیب استاندارد */
export const FUND_DISPLAY_ORDER: readonly ExpenseType[] = [
  ...DEFAULT_FUND_TYPES, ...EXPENSE_TYPE_ORDER.filter((t) => !DEFAULT_FUND_TYPES.includes(t)),
];
/** برچسب از رجیستری (داخلی + سفارشی) */
const builtinLabel = (t: string): string => typeLabel(t);

/** ترتیب فهرست صندوق برای یک ساختمان: ترتیب پیش‌فرض + نوع‌های سفارشی همان ساختمان */
export const fundDisplayOrder = (customIds: readonly string[]): string[] => [...FUND_DISPLAY_ORDER, ...customIds];

/**
 * ردیف‌های فهرست انتخاب: نوع‌های روشن در «انواع قبض و روش‌ها».
 * نوعی که انتخاب شده ولی بعداً در آن بخش خاموش شده هم دیده می‌شود تا بشود تیکش را برداشت
 * (وگرنه پرداخت‌های آن نوع بی‌صدا به صندوق می‌رفت).
 */
export function fundTypeRows<T extends string>(enabledTypes: readonly T[], selected: readonly T[], order: TypeOrder = FUND_DISPLAY_ORDER): T[] {
  const show = new Set<string>([...enabledTypes, ...selected]);
  return order.filter((t) => show.has(t)) as T[];
}

export function toggleFundType<T extends string>(selected: readonly T[], t: T, order: TypeOrder = FUND_DISPLAY_ORDER): T[] {
  const set = new Set<string>(selected);
  if (set.has(t)) set.delete(t); else set.add(t);
  return order.filter((x) => set.has(x)) as T[];
}

export type FundHint =
  | { kind: 'none' }
  | { kind: 'all' }
  | { kind: 'some'; single: boolean; names: string };

const joinFa = (a: string[]): string => (a.length < 2 ? a[0] ?? '' : `${a.slice(0, -1).join('، ')} و ${a[a.length - 1]}`);

/** وضعیت راهنمای زیر فهرست (موکاپ تأییدشدهٔ ۰۹) */
export function fundHint(selected: readonly string[], order: TypeOrder = FUND_DISPLAY_ORDER, label: (t: string) => string = builtinLabel): FundHint {
  const picked = order.filter((t) => selected.includes(t));
  if (picked.length === 0) return { kind: 'none' };
  if (picked.length === order.length) return { kind: 'all' };
  return { kind: 'some', single: picked.length === 1, names: joinFa(picked.map((t) => `«${label(t)}»`)) };
}

export const FUND_HINT_FUTURE_ONLY = 'تغییر انتخاب فقط روی پرداخت‌های بعدی اثر دارد؛ گردش قبلی صندوق عوض نمی‌شود.';

/** متن کامل راهنما (برای تست و دسترس‌پذیری) */
export function fundHintText(selected: readonly string[], order: TypeOrder = FUND_DISPLAY_ORDER, label: (t: string) => string = builtinLabel): string {
  const h = fundHint(selected, order, label);
  if (h.kind === 'none') return 'هیچ قبضی انتخاب نشده؛ پرداخت قبض‌ها به صندوق نمی‌رود. فقط واریز و برداشت دستی در صندوق ثبت می‌شود.';
  if (h.kind === 'all') return 'با هر پرداخت روی همهٔ قبض‌ها، همان مبلغ به صندوق واریز می‌شود.';
  return `با هر پرداخت روی ${h.single ? 'قبض' : 'قبض‌های'} ${h.names}، همان مبلغ به صندوق واریز می‌شود. بقیهٔ قبض‌ها به صندوق نمی‌روند.`;
}

/** عنوان ردیف گردش صندوق */
export function fundReasonFa(reason: string, kind: string, billType?: string | null, label: (t: string) => string = builtinLabel): string {
  if (BILL_DEPOSIT_REASONS.includes(reason) && kind === 'deposit') {
    const t = billType ?? (reason === FUND_REASON_LEGACY_CHARGE ? 'building' : null);
    return t ? `واریز از پرداخت قبض ${label(t)}` : 'واریز از پرداخت قبض';
  }
  if (reason === 'manual' && kind === 'deposit') return 'واریز دستی';
  if (reason === 'expense' || kind === 'withdraw') return 'برداشت / هزینه';
  return reason;
}
