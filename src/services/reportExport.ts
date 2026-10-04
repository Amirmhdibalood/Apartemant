/**
 * خروجی گزارش‌ها (از ۱.۷.۰) — کاملاً آفلاین و بدون مجوز:
 * - از ۱.۷.۴ همهٔ خروجی‌ها از «پیش‌نمایش خروجی» (ReportPreview) می‌آیند و تصویر فقط یک‌بار ساخته می‌شود.
 * - «ذخیره» و «اشتراک‌گذاری»: همان رفتار تصویر قبض (PNG در گالری Pictures/Apartemant / پنجرهٔ اشتراک‌گذاری)؛ ذخیرهٔ PDF از پنجرهٔ اشتراک‌گذاری.
 * - «پرینت»: JPEG (پنجرهٔ اشتراک‌گذاری) یا PDF تصویری (A4/A5/اندازه عادی، چندصفحه‌ای برای گزارش بلند)
 *   که با افزونهٔ بومی ReportPrint به PrintManager اندروید داده می‌شود؛ اگر چاپ شکست خورد، PDF با پنجرهٔ اشتراک‌گذاری ارسال می‌شود.
 *   مرورگر: دانلود فایل.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { buildPdf, bytesToBase64, dataUrlToBytes, pageSliceHeight, paginate, PDF_PAGE_PT, placeOnPage, type PdfPage, type PdfSize } from '../logic/pdf';
import { encodeReportImage, reportImageShell, type RenderedReportImage, type ReportCanvas } from './reportImage';
import { saveImageFileToGallery, shareImageFile, type SaveOutcome, type ShareOutcome } from './billImageExport';

interface ReportPrintPlugin {
  printPdf(options: { data: string; jobName: string }): Promise<void>;
}
const ReportPrint = registerPlugin<ReportPrintPlugin>('ReportPrint');

/** صفحه‌های PDF از تصویر گزارش. «اندازه عادی» = یک صفحه هم‌عرض تصویر فعلی (۱۰۸۰ پیکسل = ۵۴۰ پوینت) */
export function pdfPagesFromImage(img: RenderedReportImage, size: PdfSize): PdfPage[] {
  const jpegOf = (c: HTMLCanvasElement) => dataUrlToBytes(c.toDataURL('image/jpeg', 0.92));
  if (size === 'std') {
    const wPt = img.width / img.scale, hPt = img.height / img.scale;
    return [{ width: wPt, height: hPt, image: { jpeg: jpegOf(img.canvas), width: img.width, height: img.height, drawW: wPt, drawH: hPt, x: 0, y: 0 } }];
  }
  const page = PDF_PAGE_PT[size];
  const slices = paginate(img.height, pageSliceHeight(size, img.width), img.breaks);
  return slices.map(([y0, y1]) => {
    const h = Math.round(y1 - y0);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img.canvas, 0, Math.round(y0), img.width, h, 0, 0, img.width, h);
    return { width: page.w, height: page.h, image: { jpeg: jpegOf(c), width: img.width, height: h, ...placeOnPage(size, img.width, h) } };
  });
}

/** PDF از canvas آمادهٔ گزارش (بدون رسم دوباره) */
export function createReportPdf(r: ReportCanvas, size: PdfSize): { bytes: Uint8Array; fileName: string; pages: number } {
  const img = reportImageShell(r);
  const pages = pdfPagesFromImage(img, size);
  return { bytes: buildPdf(pages), fileName: img.fileName.replace(/\.jpg$/, `-${size}.pdf`), pages: pages.length };
}

function downloadBlob(bytes: Uint8Array, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export type PrintOutcome = 'printing' | 'shared' | 'cancelled' | 'downloaded';

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e).toLowerCase();
  return msg.includes('cancel') || msg.includes('abort');
}

/** ارسال فایل PDF با پنجرهٔ اشتراک‌گذاری (ذخیرهٔ PDF و اشتراک‌گذاری PDF)؛ مرورگر: دانلود */
export async function sharePdfFile(bytes: Uint8Array, fileName: string, title: string, dialogTitle: string): Promise<ShareOutcome> {
  if (!Capacitor.isNativePlatform()) { downloadBlob(bytes, fileName, 'application/pdf'); return 'downloaded'; }
  const { uri } = await Filesystem.writeFile({ path: fileName, data: bytesToBase64(bytes), directory: Directory.Cache });
  try {
    await Share.share({ title, files: [uri], dialogTitle });
    return 'shared';
  } catch (e) {
    if (isCancel(e)) return 'cancelled';
    throw e;
  }
}

/** پرینت PDF: PrintManager اندروید؛ در صورت خطا پنجرهٔ اشتراک‌گذاری؛ مرورگر: دانلود */
export async function printPdfBytes(bytes: Uint8Array, fileName: string, title: string): Promise<PrintOutcome> {
  if (!Capacitor.isNativePlatform()) { downloadBlob(bytes, fileName, 'application/pdf'); return 'downloaded'; }
  try {
    await ReportPrint.printPdf({ data: bytesToBase64(bytes), jobName: `آپارتمانت - ${title}` });
    return 'printing';
  } catch {
    // بازگشت امن: فایل PDF با پنجرهٔ اشتراک‌گذاری (از آنجا می‌توان چاپ یا ذخیره کرد)
    const r = await sharePdfFile(bytes, fileName, `گزارش ${title}`, 'ارسال یا چاپ PDF گزارش');
    return r === 'cancelled' ? 'cancelled' : 'shared';
  }
}

/** اشتراک‌گذاری تصویر PNG (همان تصویر پیش‌نمایش) */
export function shareReportPng(img: RenderedReportImage, title: string): Promise<ShareOutcome> {
  return shareImageFile(img, title, `گزارش ${title}`, `اشتراک‌گذاری تصویر گزارش ${title}`);
}

/** ذخیرهٔ تصویر PNG در گالری (فقط تصویر؛ PDF از پنجرهٔ اشتراک‌گذاری ذخیره می‌شود) */
export function saveReportPng(img: RenderedReportImage, title: string): Promise<SaveOutcome> {
  return saveImageFileToGallery(img, () => shareImageFile(img, title, `گزارش ${title}`, `ذخیرهٔ تصویر گزارش ${title}`));
}

/** پرینت JPEG: تصویر JPEG با همان اندازهٔ فعلی از پنجرهٔ اشتراک‌گذاری (چاپ/ذخیره/ارسال) */
export function printReportJpeg(r: ReportCanvas, title: string): Promise<ShareOutcome> {
  return shareImageFile(encodeReportImage(r, 'jpeg'), title, `گزارش ${title}`, `چاپ یا ارسال تصویر گزارش ${title}`);
}
