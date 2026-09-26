/** تعریف مسیرهای برنامه (ناوبری ساده مبتنی بر Stack، بدون وابستگی خارجی) */
export type Route =
  | { name: 'home' }
  | { name: 'tutorial' }
  | { name: 'settings' }
  | { name: 'records'; year?: number; month?: number }
  | { name: 'report'; tab?: ReportTab; year?: number }
  | { name: 'unitHistory'; unitNumber: number }
  | { name: 'newBill' }
  | { name: 'result' }
  | { name: 'details'; billId: string };

export type RouteName = Route['name'];

/** زبانه‌های مرکز گزارش‌ها (گزارش‌های جدید در آینده اینجا اضافه می‌شوند) */
export type ReportTab = 'yearly' | 'debtors';

/** صفحاتی که نوار پایین (Bottom Navigation) در آن‌ها نمایش داده می‌شود */
export const TAB_ROUTES: RouteName[] = ['home', 'tutorial', 'records', 'report', 'settings'];
