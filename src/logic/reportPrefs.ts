/**
 * «نمایش گزارش‌ها» (از ۱.۷.۰) — کدام گزارش‌ها در فهرست «گزارش‌ها» نمایش داده شوند. منطق خالص.
 * گزارش خاموش فقط از فهرست (و میانبرها) کنار می‌رود؛ هیچ داده‌ای پاک نمی‌شود. دست‌کم یک گزارش باید روشن بماند.
 * فقط ترجیح همین گوشی است (kvStore، کلید reportPrefs) و داخل فایل پشتیبان نیست.
 */
import { REPORT_IDS, REPORTS, type ReportId, type ReportInfo } from './reportCatalog';

export interface ReportPrefs {
  /** گزارش‌های نمایش‌داده‌شده (به ترتیب فهرست، حداقل یکی) */
  visible: ReportId[];
}

export const DEFAULT_REPORT_PREFS: ReportPrefs = { visible: [...REPORT_IDS] };

/** مقدار ذخیره‌شدهٔ خراب/ناقص ← فقط موارد معتبر؛ اگر چیزی نماند ← همه روشن */
export function sanitizeReportPrefs(raw: unknown): ReportPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { visible?: unknown };
  const list = Array.isArray(o.visible) ? REPORT_IDS.filter((id) => (o.visible as unknown[]).includes(id)) : [];
  return { visible: list.length ? list : [...REPORT_IDS] };
}

/** روشن/خاموش کردن یک گزارش؛ خاموش کردن آخرین گزارش روشن نادیده گرفته می‌شود */
export function setReportVisible(p: ReportPrefs, id: ReportId, on: boolean): ReportPrefs {
  const set = new Set(p.visible);
  if (on) set.add(id);
  else if (set.size > 1) set.delete(id);
  return { visible: REPORT_IDS.filter((r) => set.has(r)) };
}

export const isReportVisible = (p: ReportPrefs, id: ReportId): boolean => p.visible.includes(id);

/** گزارش‌های روشن به ترتیب فهرست */
export const visibleReports = (p: ReportPrefs): ReportInfo[] => REPORTS.filter((r) => p.visible.includes(r.id));

/** گزارشی که صفحه‌اش باز است ولی خاموش شده (مثلاً با پیوند قدیمی) ← اولین گزارش روشن؛ وگرنه همان */
export function resolveReport(p: ReportPrefs, id: ReportId): ReportId {
  return p.visible.includes(id) ? id : p.visible[0];
}
