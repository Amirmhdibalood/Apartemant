import type { AppSettings, ExpenseType } from './types';

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
  misc: { id: 'misc', label: 'متفرقه', color: '#5B6478', bg: '#F2F4F8', iconBg: '#E6E9F0' },
};

/** ترتیب نمایش در لیست‌ها */
export const EXPENSE_TYPE_ORDER: ExpenseType[] = ['water', 'electricity', 'gas', 'building', 'misc'];

/**
 * چیدمان کاشی‌های نوع هزینه در فرم، دقیقاً مطابق تصویر مرجع
 * (ردیف اول از راست: گاز، برق، آب — ردیف دوم از راست: متفرقه، شارژ ساختمان)
 */
export const EXPENSE_TILE_ROWS: ExpenseType[][] = [
  ['gas', 'electricity', 'water'],
  ['misc', 'building'],
];

/** اولین سال قابل انتخاب در تنظیمات */
export const FIRST_YEAR = 1403;
/** تعداد سال‌های آینده که در تنظیمات نمایش داده می‌شود */
export const YEARS_AHEAD = 100;

export const DEFAULT_SETTINGS: AppSettings = {
  showSaveWarning: true,
  activeYears: [1404, 1405],
  dismissedWarnings: [],
};

export const CURRENCY = 'تومان';
