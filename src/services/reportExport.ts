/**
 * خروجی گزارش‌ها (از ۱.۷.۰) — کاملاً آفلاین و بدون مجوز:
 * - «ذخیره» و «اشتراک‌گذاری»: همان رفتار تصویر قبض (PNG در گالری Pictures/Apartemant / پنجرهٔ اشتراک‌گذاری).
 * - «پرینت»: JPEG (پنجرهٔ اشتراک‌گذاری) یا PDF تصویری (A4/A5/اندازه عادی، چندصفحه‌ای برای گزارش بلند)
 *   که با افزونهٔ بومی ReportPrint به PrintManager اندروید داده می‌شود؛ اگر چاپ شکست خورد، PDF با پنجرهٔ اشتراک‌گذاری ارسال می‌شود.
 *   مرورگر: دانلود فایل.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ReportDoc } from '../logic/reportDoc';
import { buildPdf, bytesToBase64, dataUrlToBytes, pageSliceHeight, paginate, PDF_PAGE_PT, placeOnPage, type PdfPage, type PdfSize } from '../logic/pdf';
import { renderReportImage, type RenderedReportImage } from './reportImage';
import { saveImageFileToGallery, shareImageFile, type SaveOutcome, type ShareOutcome } from './billImageExport';

interface ReportPrintPlugin {
  printPdf(options: { data: string; jobName: string }): Promise<void>;
}
const ReportPrint = registerPlugin<ReportPrintPlugin>('ReportPrint');

export async function shareReportImage(doc: ReportDoc): Promise<ShareOutcome> {
  const img = await renderReportImage(doc, 'png');
  return shareImageFile(img, doc.title, `گزارش ${doc.title}`, `اشتراک‌گذاری تصویر گزارش ${doc.title}`);
}

export async function saveReportImage(doc: ReportDoc): Promise<SaveOutcome> {
  const img = await renderReportImage(doc, 'png');
  return saveImageFileToGallery(img, () => shareImageFile(img, doc.title, `گزارش ${doc.title}`, `ذخیرهٔ تصویر گزارش ${doc.title}`));
}

/** صفحه‌های PDF از تصویر گزارش. «اندازه عادی» = یک صفحه هم‌عرض تصویر فعلی (۱۰۸۰ پیکسل = ۵۴۰ پوینت) */
export function pdfPagesFromImage(img: RenderedReportImage, size: PdfSize): PdfPage[] {
  const jpegOf = (c: HTMLCanvasElement) => dataUrlToBytes(c.toDataURL('image/jpeg', 0.92));
  if (size === 'std') {
    const wPt = img.width / 2, hPt = img.height / 2;
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

export async function createReportPdf(doc: ReportDoc, size: PdfSize): Promise<{ bytes: Uint8Array; fileName: string; pages: number }> {
  const img = await renderReportImage(doc, 'jpeg');
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

/** پرینت PDF: PrintManager اندروید؛ در صورت خطا پنجرهٔ اشتراک‌گذاری؛ مرورگر: دانلود */
export async function printReportPdf(doc: ReportDoc, size: PdfSize): Promise<PrintOutcome> {
  const { bytes, fileName } = await createReportPdf(doc, size);
  if (!Capacitor.isNativePlatform()) { downloadBlob(bytes, fileName, 'application/pdf'); return 'downloaded'; }
  const base64 = bytesToBase64(bytes);
  try {
    await ReportPrint.printPdf({ data: base64, jobName: `آپارتمانت - ${doc.title}` });
    return 'printing';
  } catch {
    // بازگشت امن: فایل PDF با پنجرهٔ اشتراک‌گذاری (از آنجا می‌توان چاپ یا ذخیره کرد)
    const { uri } = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    try {
      await Share.share({ title: `گزارش ${doc.title}`, files: [uri], dialogTitle: 'ارسال یا چاپ PDF گزارش' });
      return 'shared';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      throw e;
    }
  }
}

/** پرینت JPEG: تصویر JPEG با همان اندازهٔ فعلی از پنجرهٔ اشتراک‌گذاری (چاپ/ذخیره/ارسال) */
export async function printReportJpeg(doc: ReportDoc): Promise<ShareOutcome> {
  const img = await renderReportImage(doc, 'jpeg');
  return shareImageFile(img, doc.title, `گزارش ${doc.title}`, `چاپ یا ارسال تصویر گزارش ${doc.title}`);
}
