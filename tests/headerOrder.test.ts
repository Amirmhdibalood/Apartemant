import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { popoverAnchor } from '../src/logic/popoverAnchor';

describe('جای پنل کشویی اعلان‌ها زیر زنگوله', () => {
  // زنگوله اکنون در سمت راستِ گروه دکمه‌های گوشهٔ چپ است (بازگشت، تم، پشتیبانی، زنگوله (اعلان))
  const bellAt = (vw: number) => ({ left: 10 + 44 * 3, width: 44, bottom: 60 + 0 * vw });
  it('در ۳۶۰ و ۳۹۰: پنل در صفحه می‌ماند و فلش زیر مرکز زنگوله و داخل پنل است', () => {
    for (const vw of [360, 390]) {
      const a = popoverAnchor(bellAt(vw), vw);
      const panelW = Math.min(340, vw - 20);
      expect(a.left).toBe(10);
      expect(a.left + panelW).toBeLessThanOrEqual(vw);
      expect(a.arrowLeft).toBeGreaterThanOrEqual(16);
      expect(a.arrowLeft).toBeLessThanOrEqual(panelW - 30);
      const centre = a.left + a.arrowLeft + 7;
      expect(Math.abs(centre - (bellAt(vw).left + 22))).toBeLessThanOrEqual(1);
      expect(a.top).toBe(68);
    }
  });
  it('زنگولهٔ صفحهٔ اصلی (بدون بازگشت) و موقعیت‌های دور: فلش همیشه داخل پنل', () => {
    const near = popoverAnchor({ left: 8 + 44 * 2, width: 44, bottom: 58 }, 360);
    expect(near.arrowLeft).toBeGreaterThanOrEqual(16);
    const far = popoverAnchor({ left: 330, width: 44, bottom: 58 }, 360);
    expect(far.arrowLeft).toBeLessThanOrEqual(340 - 30);
    const wide = popoverAnchor({ left: 400, width: 44, bottom: 58 }, 1000); // شل ۵۲۰ وسط‌چین: base=240
    expect(wide.arrowLeft).toBeLessThanOrEqual(310);
  });
  it('سرصفحه و نوار بالای خانه: ترتیب فیزیکی از چپ بازگشت، تم، پشتیبانی، زنگوله (اعلان) (DOM برعکس)', () => {
    const hdr = readFileSync('src/components/AppHeader.tsx', 'utf8');
    const body = hdr.slice(hdr.indexOf('export function AppHeader'));
    const iBell = body.indexOf('<NotifBell />'), iSup = body.indexOf('<SupportButton'), iTheme = body.indexOf('<ThemeToggle />'), iBack = body.indexOf('aria-label="بازگشت"');
    expect(iBell).toBeGreaterThan(0);
    expect([iBell, iSup, iTheme, iBack]).toEqual([...[iBell, iSup, iTheme, iBack]].sort((a, b) => a - b));
    const css = readFileSync('src/styles/global.css', 'utf8');
    expect(css).toMatch(/\.app-header__end \{ justify-content: flex-end; \}/); // گروه در گوشهٔ چپ (RTL)
    expect(css).toMatch(/\.app-header--two \{ grid-template-columns: auto 1fr auto; \}/);
    expect(readFileSync('src/screens/HomeScreen.tsx', 'utf8')).toMatch(/<NotifBell \/><SupportButton onSupport=\{onSupport\} \/><ThemeToggle \/>/);
  });
  it('همهٔ صفحه‌های دارای سرصفحه از همان AppHeader مشترک استفاده می‌کنند', () => {
    for (const f of ['NewBillScreen', 'ResultScreen', 'BillDetailsScreen', 'TutorialScreen', 'RecordsScreen', 'ReportsScreen', 'SettingsScreen', 'UnitHistoryScreen']) {
      expect(readFileSync(`src/screens/${f}.tsx`, 'utf8')).toContain('<AppHeader');
    }
  });
});

describe('۱.۷.۸ — قاعدهٔ سرصفحه: بدون «؟»؛ پشتیبانی و زنگوله (اعلان) فقط در چهار صفحهٔ اصلی', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  it('AppHeader: تم همیشه هست؛ زنگوله و پشتیبانی فقط با onSupport (صفحهٔ اصلی)؛ هیچ دکمهٔ «؟»ی راهنما نیست', () => {
    const body = read('src/components/AppHeader.tsx');
    const fn = body.slice(body.indexOf('export function AppHeader'));
    expect(fn).toMatch(/\{main && <NotifBell \/>\}/);
    expect(fn).toMatch(/\{main && <SupportButton/);
    expect(fn).toMatch(/\n\s+<ThemeToggle \/>/); // بدون شرط
    expect(body).not.toMatch(/HelpButton|IconHelp|help-btn|onHelp/);
    expect(read('src/screens/HomeScreen.tsx')).not.toMatch(/HelpButton|onHelp|help-btn/);
  });
  it('فقط خانه، سوابق، فهرست گزارش‌ها و تنظیمات onSupport می‌دهند؛ صفحه‌های داخلی نه؛ هیچ‌جا onHelp نیست', () => {
    for (const f of ['NewBillScreen', 'ResultScreen', 'BillDetailsScreen', 'TutorialScreen', 'UnitHistoryScreen', 'UnitPaymentScreen', 'SupportScreen']) {
      expect(read(`src/screens/${f}.tsx`)).not.toMatch(/onHelp=|onSupport=/);
    }
    for (const f of ['RecordsScreen', 'SettingsScreen']) expect(read(`src/screens/${f}.tsx`)).toMatch(/<AppHeader[^>]*onSupport=\{onSupport\}/);
    const rep = read('src/screens/ReportsScreen.tsx');
    expect(rep).toMatch(/<AppHeader title="گزارش‌ها" onSupport=\{onSupport\}/);
    expect(rep).toMatch(/<AppHeader title=\{reportInfo\(page\)\.title\} onBack=\{onBack\} start/); // صفحهٔ هر گزارش: داخلی
    for (const f of ['App.tsx', 'screens/RecordsScreen.tsx', 'screens/ReportsScreen.tsx', 'screens/SettingsScreen.tsx', 'screens/UnitPaymentScreen.tsx']) expect(read(`src/${f}`)).not.toMatch(/onHelp/);
  });
});
