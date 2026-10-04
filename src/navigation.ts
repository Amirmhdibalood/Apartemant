/** تعریف مسیرهای برنامه (ناوبری ساده مبتنی بر Stack، بدون وابستگی خارجی) */
import type { ExpenseType } from './models/types';
import type { StatusFilter } from './logic/billFilter';
import type { ReportId } from './logic/reportCatalog';

export type Route =
  | { name: 'home' }
  | { name: 'tutorial' }
  | { name: 'settings' }
  /** سوابق: month / type نبودن یا null = «همه»؛ status نبودن = «همه» (بدون حذف‌شده‌ها) */
  | { name: 'records'; year?: number; month?: number | null; type?: ExpenseType | null; status?: StatusFilter }
  | { name: 'report'; tab?: ReportTab; year?: number; type?: ExpenseType | null }
  | { name: 'unitHistory'; unitNumber: number }
  /** پرداخت بدهی یک واحد (از ۱.۷.۳؛ از «بدهکاران») */
  | { name: 'unitPay'; unitNumber: number }
  | { name: 'newBill' }
  | { name: 'result' }
  | { name: 'details'; billId: string };

export type RouteName = Route['name'];

/** شناسهٔ گزارش‌ها (از ۱.۷.۰ فهرست گزارش‌ها + صفحهٔ جداگانهٔ هر گزارش؛ بدون tab = فهرست) */
export type ReportTab = ReportId;

/** صفحاتی که نوار پایین (Bottom Navigation) در آن‌ها نمایش داده می‌شود */
export const TAB_ROUTES: RouteName[] = ['home', 'records', 'report', 'settings'];
