/** تعریف مسیرهای برنامه (ناوبری ساده مبتنی بر Stack، بدون وابستگی خارجی) */
import type { ExpenseType } from './models/types';
import type { StatusPick } from './logic/multiFilter';
import type { ReportId } from './logic/reportCatalog';

export type Route =
  | { name: 'home' }
  /** topic نبودن = فهرست موضوع‌ها؛ با topic همان موضوع باز می‌شود (۱.۷.۷) */
  | { name: 'tutorial'; topic?: string }
  /** focus: شناسهٔ بخش آکاردئونی که باید باز و دیده شود (۱.۷.۷) */
  | { name: 'settings'; focus?: string }
  /** پشتیبانی (۱.۷.۷): زبانهٔ «سؤال‌های رایج» یا «تماس با ما» */
  | { name: 'support'; tab?: 'faq' | 'contact' }
  /** سوابق (۱.۹ چندتایی): years نبودن = سال جاری (اگر نمایان)؛ [] یا نبودنِ بقیه = «همه»؛ statuses خالی = بدون حذف‌شده‌ها */
  | { name: 'records'; years?: number[]; months?: number[]; types?: ExpenseType[]; statuses?: StatusPick[] }
  /** «دوره‌ها» (۱.۹): سال‌ها و مدیریت ساختمان */
  | { name: 'periods'; tab?: 'years' | 'manager'; openNewManager?: boolean }
  /** جلسه‌ها (۱.۹: از تنظیمات به صفحهٔ خودش آمد) */
  | { name: 'meetings' }
  /** پشتیبان‌گیری (۱.۹: کارت صفحهٔ اصلی؛ همان بخش تنظیمات) */
  | { name: 'backup' }
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
export const TAB_ROUTES: RouteName[] = ['home', 'records', 'report', 'tutorial', 'settings'];
