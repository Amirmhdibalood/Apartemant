import type { AppSettings, ExpenseType, SplitMethod } from './types';

export const MONTHS: readonly string[] = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

export const monthName = (month: number): string => MONTHS[month - 1] ?? '';

export interface ExpenseTypeInfo {
  id: ExpenseType;
  label: string;
  /** رنگ آیکون */
  color: string;
  /** پس‌زمینه کاشی/دایره آیکون */
  bg: string;
  /** پس‌زمینه دایره آیکون (کمی پررنگ‌تر) */
  iconBg: string;
}

export const EXPENSE_TYPES: Record<ExpenseType, ExpenseTypeInfo> = {
  water: { id: 'water', label: 'آب', color: '#2F7BF5', bg: '#EEF4FF', iconBg: '#DCE9FF' },
  electricity: { id: 'electricity', label: 'برق', color: '#F2B01E', bg: '#FFF8E6', iconBg: '#FFEFC2' },
  gas: { id: 'gas', label: 'گاز', color: '#F47A20', bg: '#FFF3EA', iconBg: '#FFE3CF' },
  building: { id: 'building', label: 'شارژ ساختمان', color: '#8B5CF6', bg: '#F4F0FF', iconBg: '#E7DDFF' },
  cleaning: { id: 'cleaning', label: 'نظافت', color: '#0EA5A4', bg: '#E9FAF8', iconBg: '#CDF3EF' },
  repairs: { id: 'repairs', label: 'تعمیرات', color: '#E0533D', bg: '#FFF0ED', iconBg: '#FFDCD5' },
  beautification: { id: 'beautification', label: 'زیبایی ساختمان', color: '#DB2777', bg: '#FDEEF6', iconBg: '#FAD5E8' },
  misc: { id: 'misc', label: 'متفرقه', color: '#5B6478', bg: '#F2F4F8', iconBg: '#E6E9F0' },
};

/** ترتیب نمایش در لیست‌ها و گزارش */
export const EXPENSE_TYPE_ORDER: ExpenseType[] = [
  'water', 'electricity', 'gas', 'building', 'cleaning', 'repairs', 'beautification', 'misc',
];

/**
 * چیدمان کاشی‌های نوع هزینه در فرم (اولین مورد هر ردیف سمت راست):
 * ردیف ۱: گاز، برق، آب — ردیف ۲: شارژ ساختمان، نظافت، تعمیرات — ردیف ۳: زیبایی ساختمان، متفرقه
 */
export const EXPENSE_TILE_ROWS: ExpenseType[][] = [
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
};
export const DEFAULT_SPLIT_METHOD: SplitMethod = 'perPerson';
