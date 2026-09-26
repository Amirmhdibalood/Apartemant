/** تعریف مسیرهای برنامه (ناوبری ساده مبتنی بر Stack، بدون وابستگی خارجی) */
export type Route =
  | { name: 'home' }
  | { name: 'tutorial' }
  | { name: 'settings' }
  | { name: 'records'; year?: number; month?: number }
  | { name: 'newBill' }
  | { name: 'result' }
  | { name: 'details'; billId: string };

export type RouteName = Route['name'];

/** صفحاتی که نوار پایین (Bottom Navigation) در آن‌ها نمایش داده می‌شود */
export const TAB_ROUTES: RouteName[] = ['home', 'tutorial', 'records', 'settings'];
