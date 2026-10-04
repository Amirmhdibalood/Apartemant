/**
 * فهرست گزارش‌ها (از ۱.۷.۰): صفحهٔ «گزارش‌ها» یک فهرست (hub) است و هر گزارش صفحهٔ جداگانهٔ خودش را دارد.
 * گزارش جدید فقط با اضافه شدن به این فهرست در مرکز گزارش‌ها و «نمایش گزارش‌ها»ی تنظیمات ظاهر می‌شود.
 */
export type ReportId = 'yearly' | 'monthly' | 'monthlyDetail' | 'charts' | 'debtors' | 'billPayments';

export type ReportGroup = 'costs' | 'debts';

export interface ReportInfo {
  id: ReportId;
  title: string;
  desc: string;
  group: ReportGroup;
  /** نشان «جدید» (فقط ۱.۷.۰) */
  isNew?: boolean;
}

export const REPORTS: readonly ReportInfo[] = [
  { id: 'yearly', title: 'هزینه‌های سال', desc: 'جمع هر نوع هزینه، سهم درصدی و ریز ماه‌به‌ماه', group: 'costs' },
  { id: 'monthly', title: 'جمع قبض‌های ماه', desc: 'مبلغ قابل پرداخت هر واحد از مجموع همهٔ قبض‌های یک ماه', group: 'costs', isNew: true },
  { id: 'monthlyDetail', title: 'جمع قبض‌های ماه با جزئیات', desc: 'سهم هر واحد از هر قبض ماه (آب، برق، گاز، شارژ…) و جمع واحد', group: 'costs', isNew: true },
  { id: 'charts', title: 'گزارش نموداری', desc: 'مقایسهٔ مبلغ ماه‌ها با نمودار میله‌ای، خطی یا دایره‌ای', group: 'costs', isNew: true },
  { id: 'debtors', title: 'بدهکاران', desc: 'مانده بدهی هر واحد و سابقهٔ پرداخت', group: 'debts' },
  { id: 'billPayments', title: 'پرداخت قبض‌ها', desc: 'به‌موقع، با تأخیر، پرداخت‌شده و پرداخت‌نشده (با فیلتر وضعیت)', group: 'debts' },
];

export const REPORT_IDS: ReportId[] = REPORTS.map((r) => r.id);
export const REPORT_GROUP_TITLE: Record<ReportGroup, string> = { costs: 'هزینه‌ها و جمع‌ها', debts: 'پرداخت و بدهی' };

export const isReportId = (v: unknown): v is ReportId => typeof v === 'string' && (REPORT_IDS as string[]).includes(v);
export const reportInfo = (id: ReportId): ReportInfo => REPORTS.find((r) => r.id === id)!;
