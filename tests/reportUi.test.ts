/**
 * ۱.۷.۰ — ساختار رابط گزارش‌ها: سه دکمهٔ هر گزارش، پیش‌نمایش خروجی (PNG/PDF و A4/A5/عادی)، هر گزارش صفحهٔ جداگانه،
 * افزونهٔ بومی چاپ (بدون مجوز جدید)، بدون کتابخانهٔ بیرونی، تنظیمات «نمایش گزارش‌ها».
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
vi.mock('../src/context/FeedbackContext', () => ({ useFeedback: () => ({ toast: () => undefined }) }));
const { ReportPreview } = await import('../src/components/ReportPreview');
const { ReportActions } = await import('../src/components/ReportActions');
const doc = { id: 'monthly' as const, title: 'جمع قبض‌های ماه', subtitle: 'آبان ۱۴۰۵', fileBase: 'x', blocks: [] };

describe('سه دکمه و برگهٔ پرینت', () => {
  it('ذخیره، اشتراک‌گذاری، پرینت — با سند فعال', () => {
    const h = renderToStaticMarkup(createElement(ReportActions, { doc }));
    expect(h).toContain('>ذخیره<');
    expect(h).toContain('>اشتراک‌گذاری<');
    expect(h).toContain('>پرینت<');
    expect(h.match(/disabled=""/g)).toBeNull();
    expect(renderToStaticMarkup(createElement(ReportActions, { doc: null })).match(/disabled=""/g)).toHaveLength(3);
  });
  it('پیش‌نمایش: بدون منبع = هیچ؛ هر سه دکمه به‌جای خروجی مستقیم، پیش‌نمایش را باز می‌کنند (۱.۷.۴)', () => {
    expect(renderToStaticMarkup(createElement(ReportPreview, { source: null, action: 'save', onClose: () => undefined }))).toBe('');
    const src = read('src/components/ReportActions.tsx');
    expect(src).not.toContain('PrintSheet');
    for (const a of ['save', 'share', 'print']) expect(src).toContain(`setAction('${a}')`);
    expect(src).toContain('<ReportPreview');
  });
  it('هر شش گزارش دکمه‌های خروجی دارند و نمودارها فقط SVG/سند (بدون کتابخانه)', () => {
    for (const f of ['YearlyReportView', 'MonthlyTotalView', 'ChartsView', 'DebtorsView', 'BillPaymentsView']) {
      expect(read(`src/screens/reports/${f}.tsx`)).toContain('<ReportActions');
    }
    const pkg = JSON.parse(read('package.json'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const lib of ['jspdf', 'chart.js', 'recharts', 'd3', 'html2canvas', 'pdfmake', 'victory']) expect(deps).not.toContain(lib);
    expect(read('src/components/ChartSvg.tsx')).toContain('<svg');
  });
});

describe('صفحه‌های گزارش و تنظیمات', () => {
  it('ReportsScreen: بدون tab = فهرست؛ با tab = صفحهٔ جداگانه با دکمهٔ بازگشت؛ هر شش گزارش وصل است', () => {
    const s = read('src/screens/ReportsScreen.tsx');
    expect(s).toContain('<AppHeader');
    expect(s).toContain('onBack={onBack}');
    expect(s).toContain('<ReportsHub');
    for (const id of ['yearly', 'monthly', 'monthlyDetail', 'charts', 'debtors', 'billPayments']) expect(s).toContain(`page === '${id}'`);
    expect(s).not.toContain('className="seg');
    const app = read('src/App.tsx');
    expect(app).toContain("push({ name: 'report', tab: id })");
  });
  it('تنظیمات: «نمایش گزارش‌ها» کلید برای هر گزارش دارد و آخرین کلید روشن غیرفعال می‌شود', () => {
    const s = read('src/screens/SettingsScreen.tsx');
    expect(s).toContain('id="report-prefs"');
    expect(s).toContain('نمایش گزارش‌ها');
    expect(s).toContain('REPORTS.map');
    expect(s).toContain('reportPrefs.visible.length === 1');
  });
  it('جمع قبض‌های ماه و با جزئیات یک کامپوننت مشترک‌اند', () => {
    const m = read('src/screens/reports/MonthlyTotalView.tsx');
    expect(m).toContain('detailed');
    expect(m).toContain('monthlyDetailDoc');
    expect(m).toContain('monthlyDoc');
  });
});

describe('افزونهٔ بومی چاپ', () => {
  const java = read('resources/android/java/ir/buildingcharge/app/ReportPrintPlugin.java');
  it('PrintManager + PrintDocumentAdapter؛ نام افزونه ReportPrint؛ ثبت در MainActivity', () => {
    expect(java).toContain('@CapacitorPlugin(name = "ReportPrint")');
    expect(java).toContain('PrintManager');
    expect(java).toContain('PrintDocumentAdapter');
    expect(java).toContain('printPdf');
    expect(read('resources/android/java/ir/buildingcharge/app/MainActivity.java')).toContain('ReportPrintPlugin.class');
  });
  it('هیچ مجوز جدیدی اضافه نشده و اسکریپت برندینگ افزونه را کپی می‌کند', () => {
    const b = read('scripts/apply-android-branding.mjs');
    expect(b).toContain('ReportPrint');
    expect(b).toContain('resources/android/java');
    expect(b).not.toMatch(/uses-permission android:name="android\.permission\.(?!.*DYNAMIC)/);
    expect(java).not.toMatch(/WRITE_EXTERNAL|READ_EXTERNAL|INTERNET/);
    expect(existsSync(new URL('../src/services/reportExport.ts', import.meta.url))).toBe(true);
    expect(read('src/services/reportExport.ts')).toContain("registerPlugin<ReportPrintPlugin>('ReportPrint')");
  });
});
