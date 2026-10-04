/** ۱.۷.۰ — سازندهٔ PDF تصویری (بدون کتابخانه)، صفحه‌بندی، اندازه‌های A4/A5/عادی */
import { describe, expect, it } from 'vitest';
import { buildPdf, bytesToBase64, dataUrlToBytes, DEFAULT_PDF_SIZE, pageSliceHeight, paginate, PDF_MARGIN_PT, PDF_PAGE_PT, PDF_SIZE_LABEL, placeOnPage, type PdfPage } from '../src/logic/pdf';

const jpeg = (n: number) => { const b = new Uint8Array(n); b[0] = 0xff; b[1] = 0xd8; for (let i = 2; i < n - 2; i++) b[i] = (i * 7) & 0xff; b[n - 2] = 0xff; b[n - 1] = 0xd9; return b; };
const page = (w: number, h: number, jl: number): PdfPage => ({ width: w, height: h, image: { jpeg: jpeg(jl), width: 1080, height: 600, drawW: w, drawH: h, x: 0, y: 0 } });
const latin = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s; };

describe('buildPdf', () => {
  it('ساختار معتبر: سرآیند، تعداد صفحه، offsetهای xref دقیق، startxref، %%EOF', () => {
    const bytes = buildPdf([page(540, 800, 1500), page(595.28, 841.89, 3000), page(419.53, 595.28, 10)]);
    const s = latin(bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Count 3');
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBe(3);
    expect((s.match(/\/Filter \/DCTDecode/g) ?? []).length).toBe(3);
    const sx = Number(/startxref\n(\d+)\n%%EOF/.exec(s)![1]);
    expect(s.slice(sx, sx + 4)).toBe('xref');
    const size = Number(/xref\n0 (\d+)\n/.exec(s.slice(sx))![1]);
    expect(size).toBe(3 + 3 * 3);
    const entries = [...s.slice(sx).matchAll(/(\d{10}) (\d{5}) ([nf]) \n/g)];
    expect(entries).toHaveLength(size);
    entries.slice(1).forEach((m, i) => {
      const off = Number(m[1]);
      expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });
  it('Length تصویر برابر طول JPEG و بایت‌های JPEG بدون تغییر درون فایل‌اند؛ MediaBox اندازهٔ صفحه', () => {
    const j = jpeg(2222);
    const bytes = buildPdf([{ width: 419.53, height: 595.28, image: { jpeg: j, width: 1080, height: 900, drawW: 371.53, drawH: 400, x: 24, y: 24 } }]);
    const s = latin(bytes);
    expect(s).toContain('/Length 2222');
    expect(s).toContain('/MediaBox [0 0 419.53 595.28]');
    expect(s).toContain(latin(j));
  });
  it('بدون صفحه ← خطا', () => { expect(() => buildPdf([])).toThrow(); });
});

describe('اندازه‌ها و صفحه‌بندی', () => {
  it('A4 و A5 به پوینت؛ برچسب‌ها و پیش‌فرض «اندازه عادی»', () => {
    expect(PDF_PAGE_PT.a4.w).toBeCloseTo(595.28, 2); expect(PDF_PAGE_PT.a4.h).toBeCloseTo(841.89, 2);
    expect(PDF_PAGE_PT.a5.w).toBeCloseTo(419.53, 2); expect(PDF_PAGE_PT.a5.h).toBeCloseTo(595.28, 2);
    expect(PDF_PAGE_PT.a5.w * 2).toBeCloseTo(839.06, 1); // A5 = نصف A4
    expect(PDF_SIZE_LABEL).toEqual({ a4: 'A4', a5: 'A5', std: 'اندازه عادی' });
    expect(DEFAULT_PDF_SIZE).toBe('std');
  });
  it('جای‌گذاری: عرض صفحه منهای دو حاشیه، نسبت حفظ، داخل صفحه', () => {
    for (const size of ['a4', 'a5'] as const) {
      const p = placeOnPage(size, 1080, 500);
      expect(p.drawW).toBeCloseTo(PDF_PAGE_PT[size].w - 2 * PDF_MARGIN_PT, 6);
      expect(p.drawH / p.drawW).toBeCloseTo(500 / 1080, 6);
      const maxSlice = pageSliceHeight(size, 1080);
      const full = placeOnPage(size, 1080, maxSlice);
      expect(full.y + full.drawH).toBeCloseTo(PDF_PAGE_PT[size].h - PDF_MARGIN_PT, 4);
    }
  });
  it('paginate: کل ارتفاع بدون شکاف/هم‌پوشانی؛ برش فقط روی نقطه‌های شکست؛ هر تکه ≤ ارتفاع صفحه', () => {
    const total = 5000, ph = 1100;
    const breaks = [200, 640, 900, 1500, 2100, 2200, 3300, 4400];
    const sl = paginate(total, ph, breaks);
    expect(sl[0][0]).toBe(0);
    expect(sl[sl.length - 1][1]).toBe(total);
    sl.forEach(([a, b], i) => {
      expect(b - a).toBeLessThanOrEqual(ph + 1e-6);
      expect(b).toBeGreaterThan(a);
      if (i > 0) expect(a).toBe(sl[i - 1][1]);
      if (i < sl.length - 1) expect(breaks).toContain(b);
    });
    expect(sl.length).toBeGreaterThan(1);
  });
  it('paginate: محتوای کوتاه = یک صفحه؛ ردیف بلندتر از صفحه ← برش سخت؛ ورودی نامعتبر ← تهی', () => {
    expect(paginate(900, 1100, [100, 500])).toEqual([[0, 900]]);
    const hard = paginate(3000, 1000, []);
    expect(hard).toEqual([[0, 1000], [1000, 2000], [2000, 3000]]);
    expect(paginate(0, 1000, [])).toEqual([]);
    expect(paginate(1000, 0, [])).toEqual([]);
  });
  it('paginate تصادفی: همیشه پوشش کامل', () => {
    let a = 12345; const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 300; k++) {
      const total = 100 + Math.floor(rnd() * 20000), ph = 300 + Math.floor(rnd() * 1500);
      const br = Array.from({ length: Math.floor(rnd() * 40) }, () => Math.floor(rnd() * total));
      const sl = paginate(total, ph, br);
      let pos = 0;
      for (const [x, y] of sl) { expect(x).toBe(pos); expect(y - x).toBeLessThanOrEqual(ph + 1e-6); pos = y; }
      expect(pos).toBe(total);
    }
  });
});

describe('تبدیل داده', () => {
  it('dataUrl ↔ بایت ↔ base64 بدون تغییر', () => {
    const j = jpeg(70_000);
    const b64 = bytesToBase64(j);
    expect(dataUrlToBytes(`data:image/jpeg;base64,${b64}`)).toEqual(j);
  });
});
