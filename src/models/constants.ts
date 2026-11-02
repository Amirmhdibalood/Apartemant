import type { AppSettings, BuiltinExpenseType, CustomTypeId, SplitMethod } from './types';

export const MONTHS: readonly string[] = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export const monthName = (month: number): string => MONTHS[month - 1] ?? '';

export interface ExpenseTypeInfo {
  id: BuiltinExpenseType;
  label: string;
  /** رنگ آیکون */
  color: string;
  /** پس‌زمینه کاشی/دایره آیکون */
  bg: string;
  /** پس‌زمینه دایره آیکون (کمی پررنگ‌تر) */
  iconBg: string;
  /** مقادیر مخصوص تم تاریک (اگر نباشد از روی رنگ روشن محاسبه می‌شود) */
  dark?: { color: string; bg: string; iconBg: string };
}

export const EXPENSE_TYPES: Record<BuiltinExpenseType, ExpenseTypeInfo> = {
  // آب: سرمه‌ای عمیق (نه آبی روشن) تا در نوار خلاصهٔ آبیِ گزارش و پس‌زمینه گم نشود
  water: {
    id: 'water', label: 'آب', color: '#14307A', bg: '#E3E6EF', iconBg: '#C2C9DC',
    dark: { color: '#B6D4FF', bg: '#28344B', iconBg: '#384660' },
  },
  electricity: { id: 'electricity', label: 'برق', color: '#F2B01E', bg: '#FFF8E6', iconBg: '#FFEFC2' },
  gas: { id: 'gas', label: 'گاز', color: '#F47A20', bg: '#FFF3EA', iconBg: '#FFE3CF' },
  building: { id: 'building', label: 'شارژ ساختمان', color: '#8B5CF6', bg: '#F4F0FF', iconBg: '#E7DDFF' },
  cleaning: { id: 'cleaning', label: 'نظافت', color: '#0EA5A4', bg: '#E9FAF8', iconBg: '#CDF3EF' },
  repairs: { id: 'repairs', label: 'تعمیرات', color: '#E0533D', bg: '#FFF0ED', iconBg: '#FFDCD5' },
  beautification: { id: 'beautification', label: 'زیبایی ساختمان', color: '#DB2777', bg: '#FDEEF6', iconBg: '#FAD5E8' },
  misc: { id: 'misc', label: 'متفرقه', color: '#5B6478', bg: '#F2F4F8', iconBg: '#E6E9F0' },
};

/** ترتیب نمایش در لیست‌ها و گزارش */
/**
 * آیا مقدار، یکی از ۸ نوع هزینه است؟ (فقط کلیدهای خودِ EXPENSE_TYPES؛ برخلاف `in`، کلیدهای ارثی
 * مثل "constructor" / "toString" / "__proto__" از فایل پشتیبان دستکاری‌شده پذیرفته نمی‌شوند)
 */
export function isExpenseType(v: unknown): v is BuiltinExpenseType {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(EXPENSE_TYPES, v);
}

/** الگوی سخت‌گیرانهٔ شناسهٔ نوع سفارشی: کلیدهای ارثی (constructor/__proto__/…) هرگز با آن جور نمی‌شوند */
export const CUSTOM_TYPE_ID_RE = /^c_[a-z0-9]{8,24}$/;
export function isCustomTypeId(v: unknown): v is CustomTypeId {
  return typeof v === 'string' && CUSTOM_TYPE_ID_RE.test(v);
}

export const EXPENSE_TYPE_ORDER: BuiltinExpenseType[] = [
  'water', 'electricity', 'gas', 'building', 'cleaning', 'repairs', 'beautification', 'misc',
];

/**
 * چیدمان کاشی‌های نوع هزینه در فرم (اولین مورد هر ردیف سمت راست):
 * ردیف ۱: گاز، برق، آب — ردیف ۲: شارژ ساختمان، نظافت، تعمیرات — ردیف ۳: زیبایی ساختمان، متفرقه
 */
export const EXPENSE_TILE_ROWS: BuiltinExpenseType[][] = [
  ['gas', 'electricity', 'water'],
  ['building', 'cleaning', 'repairs'],
  ['beautification', 'misc'],
];

/** اولین سال قابل انتخاب در تنظیمات */
export const FIRST_YEAR = 1405;
/** تعداد سال‌های بعد از FIRST_YEAR که در تنظیمات قابل انتخاب است */
export const YEARS_AHEAD = 100;
/** آخرین سال قابل انتخاب (۱۴۰۵ + ۱۰۰ = ۱۵۰۵) */
export const LAST_YEAR = FIRST_YEAR + YEARS_AHEAD;

export const DEFAULT_SETTINGS: AppSettings = {
  showSaveWarning: true,
  activeYears: [FIRST_YEAR],
  dismissedWarnings: [],
};

export const CURRENCY = 'تومان';

/** برچسب نحوه تقسیم */
export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  perPerson: 'بر اساس نفرات',
  perUnit: 'بر اساس واحد',
  perArea: 'بر اساس متراژ',
};
export const DEFAULT_SPLIT_METHOD: SplitMethod = 'perPerson';
