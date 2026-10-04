/**
 * ۱.۷.۴ — «پیش‌نمایش خروجی»: ضریب امن canvas، صفحه‌های PDF، ذخیرهٔ فقط اندازهٔ PDF، تب اولیه، و سیم‌کشی همهٔ گزارش‌ها و قبض.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  initialTab, loadPdfSize, MAX_CANVAS_AREA, MAX_CANVAS_DIM, MIN_REPORT_SCALE, pageAspect, pageLabel, pickReportScale,
  previewPages, sanitizePdfSize, savePdfSize, sliceBox,
} from '../src/logic/reportPreview';
import { PDF_MARGIN_PT, PDF_PAGE_PT } from '../src/logic/pdf';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
vi.mock('../src/context/FeedbackContext', () => ({ useFeedback: () => ({ toast: () => undefined }) }));

describe('ضریب رسم امن (گزارش خیلی بلند)', () => {
  it('گزارش معمولی: همان ۲', () => {
    expect(pickReportScale(600, 540)).toBe(2);
    expect(pickReportScale(3668, 540)).toBe(2); // بدهکاران ~۲۸ قبض
    expect(pickReportScale(10_000, 540)).toBe(2);
  });
  it('خیلی بلند: ضریب کم می‌شود و هرگز از حد مساحت و ابعاد canvas نمی‌گذرد', () => {
    for (const h of [12_000, 20_000, 30_000, 45_000]) {
      const s = pickReportScale(h, 540)!;
      expect(s).toBeLessThan(2);
      expect(s).toBeGreaterThanOrEqual(MIN_REPORT_SCALE);
      expect(540 * s * h * s).toBeLessThanOrEqual(MAX_CANVAS_AREA * 1.0001);
      expect(h * s).toBeLessThanOrEqual(MAX_CANVAS_DIM * 1.0001);
    }
  });
  it('بیش از حد بلند ← null (خطای دوستانه به‌جای کرش)؛ ورودی نامعتبر ← بیشینه', () => {
    expect(pickReportScale(100_000, 540)).toBeNull();
    expect(pickReportScale(0, 540)).toBe(2);
    expect(pickReportScale(NaN, 540)).toBe(2);
  });
});

describe('صفحه‌های پیش‌نمایش PDF', () => {
  it('اندازه عادی = یک صفحهٔ بلند؛ A4/A5 در نقطه‌های شکست می‌برد و کل ارتفاع را می‌پوشاند', () => {
    expect(previewPages(1080, 5000, [], 'std')).toEqual([{ y0: 0, y1: 5000 }]);
    const breaks = Array.from({ length: 60 }, (_, i) => (i + 1) * 100);
    for (const size of ['a4', 'a5'] as const) {
      const pg = previewPages(1080, 6000, breaks, size);
      expect(pg.length).toBeGreaterThan(1);
      expect(pg[0].y0).toBe(0);
      expect(pg[pg.length - 1].y1).toBe(6000);
      pg.forEach((p, i) => { if (i) expect(p.y0).toBe(pg[i - 1].y1); });
    }
    // A4 و A5 تقریباً هم‌نسبت‌اند (۱٫۴۱۴ و ۱٫۴۱۹) و تصویر به عرض صفحه می‌رسد، پس تعداد صفحه‌ها نزدیک است
    expect(Math.abs(previewPages(1080, 6000, breaks, 'a5').length - previewPages(1080, 6000, breaks, 'a4').length)).toBeLessThanOrEqual(1);
  });
  it('گزارش کوتاه در A4 = یک صفحه', () => {
    expect(previewPages(1080, 900, [300, 600], 'a4')).toHaveLength(1);
  });
  it('جای تکه روی برگه با حاشیهٔ PDF یکی است و از برگه بیرون نمی‌زند', () => {
    const b = sliceBox('a4', 1080, 1800);
    expect(b.x).toBeCloseTo(PDF_MARGIN_PT / PDF_PAGE_PT.a4.w, 6);
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(pageAspect('a4')).toBeCloseTo(841.89 / 595.28, 5);
  });
  it('برچسب «صفحهٔ N از M» با ارقام فارسی', () => {
    expect(pageLabel(1, 3)).toBe('صفحهٔ ۱ از ۳');
    expect(pageLabel(12, 14)).toBe('صفحهٔ ۱۲ از ۱۴');
  });
});

describe('فقط اندازهٔ PDF به‌خاطر سپرده می‌شود', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
  it('پیش‌فرض «اندازه عادی»؛ ذخیره/بازیابی؛ مقدار خراب ← پیش‌فرض', () => {
    const s = mem();
    expect(loadPdfSize(s)).toBe('std');
    savePdfSize('a4', s);
    expect(loadPdfSize(s)).toBe('a4');
    s.m.set('apartemant.pdfSize', 'zzz');
    expect(loadPdfSize(s)).toBe('std');
    expect(sanitizePdfSize('a5')).toBe('a5');
    expect(sanitizePdfSize(7)).toBe('std');
    expect([...s.m.keys()]).toEqual(['apartemant.pdfSize']); // تب/قالب ذخیره نمی‌شود
  });
  it('حافظهٔ خراب/غیرفعال کرش نمی‌کند', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadPdfSize(bad)).toBe('std');
    expect(() => savePdfSize('a4', bad)).not.toThrow();
    expect(loadPdfSize(null)).toBe('std');
  });
  it('تب اولیه: پرینت = PDF؛ ذخیره/اشتراک = تصویر', () => {
    expect(initialTab('print')).toBe('pdf');
    expect(initialTab('save')).toBe('image');
    expect(initialTab('share')).toBe('image');
  });
});

describe('سیم‌کشی', () => {
  it('هر ۵ نمای گزارش (۶ گزارش) از ReportActions می‌گذرد و ReportActions فقط پیش‌نمایش باز می‌کند (بدون خروجی مستقیم)', () => {
    for (const f of ['YearlyReportView', 'MonthlyTotalView', 'ChartsView', 'DebtorsView', 'BillPaymentsView']) expect(read(`src/screens/reports/${f}.tsx`)).toContain('<ReportActions');
    const a = read('src/components/ReportActions.tsx');
    expect(a).not.toMatch(/saveReportImage|shareReportImage|printReportPdf/);
    expect(a).toContain('<ReportPreview');
  });
  it('پیش‌نمایش: یک‌بار رسم، تب PNG/PDF، A4/A5/عادی، صفحه‌به‌صفحه، نوار ذخیره/اشتراک/پرینت، رنگ چاپ، پورتال', () => {
    const c = read('src/components/ReportPreview.tsx');
    expect(c.match(/source\.render\(\)/g)).toHaveLength(1);
    for (const t of ['تصویر (PNG)', 'فایل PDF', 'رنگ چاپ', 'پیش‌نمایش خروجی', 'pageLabel', 'createPortal', 'savePdfSize', 'loadPdfSize', 'role="tablist"', 'role="radiogroup"']) expect(c).toContain(t);
    for (const k of ["'save'", "'share'", "'print'"]) expect(c).toContain(k);
    // PDF: ذخیره و اشتراک از پنجرهٔ اشتراک؛ گالری فقط تصویر
    expect(c).toMatch(/sharePdfFile\([^)]*kind === 'save'/s);
    expect(c.indexOf('saveReportPng')).toBeLessThan(c.indexOf('sharePdfFile'));
    expect(c).toContain("background: '#FFFFFF'"); // کاغذ همیشه سفید
  });
  it('رندر از پالت روشن چاپ (data-light) می‌گیرد نه تم تیره', () => {
    const r = read('src/services/reportImage.tsx');
    expect(r).toContain('dataset.light');
    expect(r).not.toContain('dataset.theme');
    expect(r).toContain('pickReportScale');
    expect(r).toContain("throw new Error('report-too-tall')");
  });
  it('بازگشت (Esc/دکمهٔ Back اندروید) بدون خروجی می‌بندد و Dialog زیرین را با آن نمی‌بندد', () => {
    expect(read('src/App.tsx')).toContain("document.querySelector('.pv')");
    expect(read('src/components/Dialog.tsx')).toContain("document.querySelector('.pv')");
    const c = read('src/components/ReportPreview.tsx');
    expect(c).toContain("e.key === 'Escape'");
    expect(c).toContain('بازگشت (بدون خروجی)');
  });
  it('قبض: BillDetailsScreen از BillImageActions با پیش‌نمایش؛ دیالوگ ذخیره هم PDF/پرینت را از همان پیش‌نمایش می‌دهد', () => {
    expect(read('src/screens/BillDetailsScreen.tsx')).toContain('<BillImageActions data={data} />');
    const b = read('src/components/BillImageActions.tsx');
    expect(b).toContain('preview = true');
    expect(b).toContain('<ReportPreview');
    const d = read('src/components/BillSavedDialog.tsx');
    expect(d).toContain('preview={false}'); // رفتار فوری اشتراک/ذخیرهٔ PNG دست‌نخورده
    expect(d).toContain('PDF و پرینت');
    expect(d).toContain('<ReportPreview');
  });
  it('بدون وابستگی و مجوز جدید؛ PrintSheet حذف شده', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys(pkg.dependencies)).not.toContain('html2canvas');
    expect(() => read('src/components/PrintSheet.tsx')).toThrow();
  });
  it('رندر ایستا: پیش‌نمایش بدون منبع هیچ نمی‌کشد', async () => {
    const { ReportPreview } = await import('../src/components/ReportPreview');
    expect(renderToStaticMarkup(createElement(ReportPreview, { source: null, action: 'print', onClose: () => undefined }))).toBe('');
  });
});
