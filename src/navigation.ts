/** تعریف مسیرهای برنامه (ناوبری ساده مبتنی بر Stack، بدون وابستگی خارجی) */
import type { ExpenseType } from './models/types';
import type { StatusFilter } from './logic/billFilter';

export type Route =
  | { name: 'home' }
  | { name: 'tutorial' }
  | { name: 'settings' }
  /** سوابق: month / type نبودن یا null = «همه»؛ status نبودن = «همه» (بدون حذف‌شده‌ها) */
  | { name: 'records'; year?: number; month?: number | null; type?: ExpenseType | null; status?: StatusFilter }
  | { name: 'report'; tab?: ReportTab; year?: number; type?: ExpenseType | null }
  | { name: 'unitHistory'; unitNumber: number }
  | { name: 'newBill' }
  | { name: 'result' }
  | { name: 'details'; billId: string };

export type RouteName = Route['name'];

/** زبانه‌های مرکز گزارش‌ها (گزارش‌های جدید در آینده اینجا اضافه می‌شوند) */
export type ReportTab = 'yearly' | 'debtors' | 'billPayments';

/** صفحاتی که نوار پایین (Bottom Navigation) در آن‌ها نمایش داده می‌شود */
export const TAB_ROUTES: RouteName[] = ['home', 'tutorial', 'records', 'report', 'settings'];
