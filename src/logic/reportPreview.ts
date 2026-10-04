/**
 * پیش‌نمایش خروجی (از ۱.۷.۴) — منطق خالص و قابل تست.
 * - ضریب رسم امن برای canvas (گزارش خیلی بلند در WebView اندروید نباید از حد حافظه/ابعاد canvas بگذرد)
 * - صفحه‌های PDF (همان برش‌های خروجی نهایی) برای نمایش «صفحهٔ N از M»
 * - انتخاب ماندگار فقط برای PDF (اندازهٔ صفحه)
 */
import { DEFAULT_PDF_SIZE, pageSliceHeight, paginate, PDF_PAGE_PT, PDF_MARGIN_PT, type PdfSize } from './pdf';
import { toPersianDigits } from './formatting';

/** بیشینهٔ ارتفاع canvas (پیکسل) — کمتر از حد ۳۲۷۶۷ کرومیوم */
export const MAX_CANVAS_DIM = 30000;
/** بیشینهٔ مساحت canvas (پیکسل مربع) ≈ ۹۶ مگابایت RGBA */
export const MAX_CANVAS_AREA = 24_000_000;
/** کمترین ضریب خوانا */
export const MIN_REPORT_SCALE = 0.6;

/**
 * ضریب رسم برای گزارشی به ارتفاع منطقی `h` و عرض منطقی `w`: همان ۲ تا جایی که canvas امن است،
 * بعد خودکار کمتر (تا ۰٫۶)؛ اگر باز هم جا نشد null (گزارش بیش از حد بلند).
 */
export function pickReportScale(h: number, w: number, max = 2): number | null {
  if (!(h > 0) || !(w > 0)) return max;
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (w * h));
  const byDim = MAX_CANVAS_DIM / h;
  const s = Math.min(max, byArea, byDim);
  return s >= MIN_REPORT_SCALE ? s : null;
}

export interface PreviewPage { y0: number; y1: number }

/** صفحه‌های خروجی PDF؛ «اندازه عادی» = یک صفحهٔ بلند */
export function previewPages(imageW: number, imageH: number, breaks: number[], size: PdfSize): PreviewPage[] {
  if (size === 'std') return [{ y0: 0, y1: imageH }];
  return paginate(imageH, pageSliceHeight(size, imageW), breaks).map(([y0, y1]) => ({ y0, y1 }));
}

/** نسبت ارتفاع به عرض برگهٔ A4/A5 */
export function pageAspect(size: 'a4' | 'a5'): number {
  const p = PDF_PAGE_PT[size];
  return p.h / p.w;
}

/** موقعیت (نسبی، ۰ تا ۱ از عرض صفحه) تکهٔ تصویر روی برگه، برای رسم پیش‌نمایش صفحه */
export function sliceBox(size: 'a4' | 'a5', sliceW: number, sliceH: number): { x: number; y: number; w: number; h: number } {
  const p = PDF_PAGE_PT[size];
  const drawW = p.w - 2 * PDF_MARGIN_PT;
  const drawH = (sliceH / sliceW) * drawW;
  return { x: PDF_MARGIN_PT / p.w, y: PDF_MARGIN_PT / p.w, w: drawW / p.w, h: drawH / p.w };
}

export const pageLabel = (n: number, m: number) => `صفحهٔ ${toPersianDigits(n)} از ${toPersianDigits(m)}`;

export function sanitizePdfSize(v: unknown): PdfSize {
  return v === 'a4' || v === 'a5' || v === 'std' ? v : DEFAULT_PDF_SIZE;
}

const KEY = 'apartemant.pdfSize';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** اندازهٔ PDF انتخاب‌شدهٔ قبلی (فقط همین ماندگار است؛ تب تصویر/PDF هر بار از دکمهٔ زده‌شده می‌آید) */
export function loadPdfSize(s: Store | null = store()): PdfSize {
  try { return sanitizePdfSize(s?.getItem(KEY)); } catch { return DEFAULT_PDF_SIZE; }
}
export function savePdfSize(size: PdfSize, s: Store | null = store()): void {
  try { s?.setItem(KEY, size); } catch { /* حافظه پر/غیرفعال */ }
}

export type PreviewAction = 'save' | 'share' | 'print';
export type PreviewTab = 'image' | 'pdf';
/** تب اولیه: پرینت = PDF؛ ذخیره/اشتراک = تصویر */
export const initialTab = (a: PreviewAction): PreviewTab => (a === 'print' ? 'pdf' : 'image');
