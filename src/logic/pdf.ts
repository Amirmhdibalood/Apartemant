/**
 * ساخت PDF تصویری (از ۱.۷.۰) — کاملاً آفلاین، بدون هیچ کتابخانه‌ای. هر صفحه فقط یک تصویر JPEG است
 * (متن فارسی به‌صورت تصویر می‌ماند، پس نیازی به فونت‌گذاری/اتصال حروف نیست). منطق خالص و قابل تست.
 */

export type PdfSize = 'a4' | 'a5' | 'std';
export const PDF_SIZE_LABEL: Record<PdfSize, string> = { a4: 'A4', a5: 'A5', std: 'اندازه عادی' };
export const DEFAULT_PDF_SIZE: PdfSize = 'std';

/** اندازهٔ صفحه به پوینت (۱/۷۲ اینچ) */
export const PDF_PAGE_PT: Record<'a4' | 'a5', { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  a5: { w: 419.53, h: 595.28 },
};
/** حاشیهٔ صفحه (پوینت) */
export const PDF_MARGIN_PT = 24;

export interface PdfPageImage {
  /** بایت‌های JPEG */
  jpeg: Uint8Array;
  /** ابعاد تصویر (پیکسل) */
  width: number;
  height: number;
  /** ابعاد جای‌گذاری روی صفحه (پوینت) و فاصله از لبه‌ها */
  drawW: number;
  drawH: number;
  x: number;
  y: number;
}
export interface PdfPage { width: number; height: number; image: PdfPageImage }

const enc = new TextEncoder();
const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** سند PDF از صفحه‌ها (هر صفحه یک تصویر JPEG). مختصات y از بالای صفحه است */
export function buildPdf(pages: PdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error('no pages');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); pos += u.length; };
  const obj = (n: number, body: (Uint8Array | string)[]) => { offsets[n] = pos; push(`${n} 0 obj\n`); body.forEach(push); push('\nendobj\n'); };

  // شماره‌ها: ۱ فهرست، ۲ صفحه‌ها، سپس برای هر صفحه سه شیء (صفحه، محتوا، تصویر)
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`]);
  pages.forEach((p, i) => {
    const pn = 3 + i * 3, cn = pn + 1, im = pn + 2;
    const { image: g } = p;
    obj(pn, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.width)} ${f(p.height)}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${cn} 0 R >>`]);
    const content = `q ${f(g.drawW)} 0 0 ${f(g.drawH)} ${f(g.x)} ${f(p.height - g.y - g.drawH)} cm /Im0 Do Q`;
    obj(cn, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${g.width} /Height ${g.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${g.jpeg.length} >>\nstream\n`, g.jpeg, '\nendstream']);
  });
  const total = 3 + pages.length * 3;
  const xref = pos;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** تکه‌های عمودی (بر حسب پیکسل تصویر) برای صفحه‌بندی؛ برش فقط روی «نقطه‌های شکست» (بین ردیف‌ها/بلوک‌ها) انجام می‌شود */
export function paginate(totalHeight: number, pageHeight: number, breaks: number[]): [number, number][] {
  const out: [number, number][] = [];
  if (totalHeight <= 0 || pageHeight <= 0) return out;
  const cuts = [...new Set(breaks.filter((b) => b > 0 && b < totalHeight))].sort((a, b) => a - b);
  let start = 0;
  while (start < totalHeight - 0.5) {
    const limit = start + pageHeight;
    if (limit >= totalHeight - 0.5) { out.push([start, totalHeight]); break; }
    // دورترین نقطهٔ شکست داخل صفحه؛ اگر نبود (ردیف بلندتر از صفحه) برش سخت
    let cut = limit;
    for (const b of cuts) if (b > start + pageHeight * 0.25 && b <= limit) cut = b;
    out.push([start, cut]);
    start = cut;
  }
  return out;
}

/** جای‌گذاری یک تکهٔ تصویر روی صفحه (عرض کامل منهای حاشیه، بدون کشیدگی) */
export function placeOnPage(size: 'a4' | 'a5', sliceW: number, sliceH: number): { drawW: number; drawH: number; x: number; y: number } {
  const page = PDF_PAGE_PT[size];
  const drawW = page.w - 2 * PDF_MARGIN_PT;
  return { drawW, drawH: (sliceH / sliceW) * drawW, x: PDF_MARGIN_PT, y: PDF_MARGIN_PT };
}

/** ارتفاع قابل استفادهٔ هر صفحه برحسب پیکسل تصویر */
export function pageSliceHeight(size: 'a4' | 'a5', imageW: number): number {
  const page = PDF_PAGE_PT[size];
  const scale = (page.w - 2 * PDF_MARGIN_PT) / imageW;
  return (page.h - 2 * PDF_MARGIN_PT) / scale;
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
